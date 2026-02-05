/**
 * Jupiter Swap Integration
 *
 * Enables actual swap execution via Jupiter V6 API.
 *
 * Built by Turbinete 🚀 for autonomous yield optimization
 */
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
export interface SwapQuote {
    inputMint: string;
    outputMint: string;
    inAmount: string;
    outAmount: string;
    priceImpactPct: string;
    slippageBps: number;
    routePlan: any[];
}
export interface SwapResult {
    success: boolean;
    signature?: string;
    inputAmount: bigint;
    outputAmount: bigint;
    error?: string;
}
export declare class JupiterSwap {
    private connection;
    private payer;
    constructor(connection: Connection, payer: Keypair);
    /**
     * Get a quote for swapping tokens
     */
    getQuote(inputMint: PublicKey, outputMint: PublicKey, amountLamports: bigint, slippageBps?: number): Promise<SwapQuote | null>;
    /**
     * Execute a swap based on a quote
     */
    executeSwap(quote: SwapQuote): Promise<SwapResult>;
    /**
     * Swap SOL to a yield-bearing token (mSOL, jitoSOL, etc.)
     */
    swapSolTo(outputMint: PublicKey, solAmountLamports: bigint, slippageBps?: number): Promise<SwapResult>;
    /**
     * Swap a token back to SOL
     */
    swapToSol(inputMint: PublicKey, amountLamports: bigint, slippageBps?: number): Promise<SwapResult>;
    /**
     * Get current price quote (for display/decision making)
     */
    getPrice(inputMint: PublicKey, outputMint: PublicKey, amountLamports: bigint): Promise<{
        price: number;
        priceImpact: number;
    } | null>;
}
/**
 * Token mints for yield-bearing assets
 */
export declare const YIELD_TOKENS: {
    mSOL: PublicKey;
    jitoSOL: PublicKey;
    USDC: PublicKey;
    USDT: PublicKey;
    SOL: PublicKey;
};
