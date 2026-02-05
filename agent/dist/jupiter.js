/**
 * Jupiter Swap Integration
 *
 * Enables actual swap execution via Jupiter V6 API.
 *
 * Built by Turbinete 🚀 for autonomous yield optimization
 */
import { VersionedTransaction, } from '@solana/web3.js';
import { TOKENS } from './config.js';
// Using lite-api for free tier access (no API key required)
const JUPITER_QUOTE_API = 'https://lite-api.jup.ag/swap/v1/quote';
const JUPITER_SWAP_API = 'https://lite-api.jup.ag/swap/v1/swap';
export class JupiterSwap {
    connection;
    payer;
    constructor(connection, payer) {
        this.connection = connection;
        this.payer = payer;
    }
    /**
     * Get a quote for swapping tokens
     */
    async getQuote(inputMint, outputMint, amountLamports, slippageBps = 50 // 0.5% default
    ) {
        try {
            const url = new URL(JUPITER_QUOTE_API);
            url.searchParams.set('inputMint', inputMint.toBase58());
            url.searchParams.set('outputMint', outputMint.toBase58());
            url.searchParams.set('amount', amountLamports.toString());
            url.searchParams.set('slippageBps', slippageBps.toString());
            url.searchParams.set('restrictIntermediateTokens', 'true');
            const response = await fetch(url.toString());
            if (!response.ok) {
                console.error(`❌ Jupiter quote failed: ${response.status}`);
                return null;
            }
            return await response.json();
        }
        catch (error) {
            console.error('❌ Failed to get Jupiter quote:', error);
            return null;
        }
    }
    /**
     * Execute a swap based on a quote
     */
    async executeSwap(quote) {
        try {
            console.log(`🔄 Executing swap: ${quote.inAmount} → ${quote.outAmount}`);
            // Get serialized swap transaction
            const swapResponse = await fetch(JUPITER_SWAP_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    quoteResponse: quote,
                    userPublicKey: this.payer.publicKey.toBase58(),
                    dynamicComputeUnitLimit: true,
                    dynamicSlippage: true,
                    prioritizationFeeLamports: {
                        priorityLevelWithMaxLamports: {
                            maxLamports: 500000, // 0.0005 SOL max priority fee
                            priorityLevel: 'high',
                        },
                    },
                }),
            });
            if (!swapResponse.ok) {
                const error = await swapResponse.text();
                return {
                    success: false,
                    inputAmount: BigInt(quote.inAmount),
                    outputAmount: BigInt(0),
                    error: `Jupiter swap API error: ${error}`,
                };
            }
            const swapData = await swapResponse.json();
            if (swapData.simulationError) {
                return {
                    success: false,
                    inputAmount: BigInt(quote.inAmount),
                    outputAmount: BigInt(0),
                    error: `Simulation error: ${swapData.simulationError}`,
                };
            }
            // Deserialize and sign the transaction
            const swapTxBuf = Buffer.from(swapData.swapTransaction, 'base64');
            const transaction = VersionedTransaction.deserialize(swapTxBuf);
            transaction.sign([this.payer]);
            // Send transaction
            const signature = await this.connection.sendTransaction(transaction, {
                maxRetries: 3,
                skipPreflight: false,
            });
            console.log(`📝 Swap TX submitted: ${signature}`);
            // Wait for confirmation
            const confirmation = await this.connection.confirmTransaction({
                signature,
                blockhash: (await this.connection.getLatestBlockhash()).blockhash,
                lastValidBlockHeight: swapData.lastValidBlockHeight,
            }, 'confirmed');
            if (confirmation.value.err) {
                return {
                    success: false,
                    signature,
                    inputAmount: BigInt(quote.inAmount),
                    outputAmount: BigInt(0),
                    error: `Transaction failed: ${JSON.stringify(confirmation.value.err)}`,
                };
            }
            console.log(`✅ Swap confirmed: ${signature}`);
            return {
                success: true,
                signature,
                inputAmount: BigInt(quote.inAmount),
                outputAmount: BigInt(quote.outAmount),
            };
        }
        catch (error) {
            return {
                success: false,
                inputAmount: BigInt(quote.inAmount),
                outputAmount: BigInt(0),
                error: `Swap execution error: ${error}`,
            };
        }
    }
    /**
     * Swap SOL to a yield-bearing token (mSOL, jitoSOL, etc.)
     */
    async swapSolTo(outputMint, solAmountLamports, slippageBps = 50) {
        const quote = await this.getQuote(TOKENS.SOL, outputMint, solAmountLamports, slippageBps);
        if (!quote) {
            return {
                success: false,
                inputAmount: solAmountLamports,
                outputAmount: BigInt(0),
                error: 'Failed to get quote',
            };
        }
        return this.executeSwap(quote);
    }
    /**
     * Swap a token back to SOL
     */
    async swapToSol(inputMint, amountLamports, slippageBps = 50) {
        const quote = await this.getQuote(inputMint, TOKENS.SOL, amountLamports, slippageBps);
        if (!quote) {
            return {
                success: false,
                inputAmount: amountLamports,
                outputAmount: BigInt(0),
                error: 'Failed to get quote',
            };
        }
        return this.executeSwap(quote);
    }
    /**
     * Get current price quote (for display/decision making)
     */
    async getPrice(inputMint, outputMint, amountLamports) {
        const quote = await this.getQuote(inputMint, outputMint, amountLamports, 50);
        if (!quote)
            return null;
        const inAmount = Number(quote.inAmount);
        const outAmount = Number(quote.outAmount);
        const price = outAmount / inAmount;
        const priceImpact = parseFloat(quote.priceImpactPct);
        return { price, priceImpact };
    }
}
/**
 * Token mints for yield-bearing assets
 */
export const YIELD_TOKENS = {
    // Liquid staking derivatives
    mSOL: TOKENS.mSOL,
    jitoSOL: TOKENS.jitoSOL,
    // Stablecoins (for LP positions)
    USDC: TOKENS.USDC,
    USDT: TOKENS.USDT,
    // Native
    SOL: TOKENS.SOL,
};
