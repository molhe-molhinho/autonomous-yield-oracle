/**
 * Autonomous Trader
 *
 * Makes REAL trades based on yield optimization decisions.
 * This is the "Most Agentic" component - actual fund management!
 *
 * Built by Turbinete 🚀
 */
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { OracleClient } from './client.js';
import { YieldFetcher } from './yields.js';
import { JupiterSwap } from './jupiter.js';
import { DEFAULT_CONFIG, PROTOCOL, TOKENS } from './config.js';
const STATE_FILE = '/Users/molhemolinho/clawd/projects/autonomous-yield-oracle/agent/trader-state.json';
// Map protocols to their yield tokens
const PROTOCOL_TO_TOKEN = {
    [PROTOCOL.MARINADE]: TOKENS.mSOL,
    [PROTOCOL.JITO]: TOKENS.jitoSOL,
    // For LP protocols, we'd need more complex logic
};
export class AutonomousTrader {
    connection;
    payer;
    jupiter;
    oracleClient;
    fetcher;
    state;
    oracleAddress;
    // Trading parameters
    minRebalanceImprovement = 100; // 1% minimum improvement to rebalance
    maxPositionSol = 1000000000n; // 1 SOL max per position (safety limit)
    minHoldTimeMs = 3600_000; // 1 hour minimum hold time
    constructor(connection, payer, oracleAddress) {
        this.connection = connection;
        this.payer = payer;
        this.oracleAddress = oracleAddress;
        this.jupiter = new JupiterSwap(connection, payer);
        this.oracleClient = new OracleClient(connection, payer);
        this.fetcher = new YieldFetcher();
        this.state = this.loadState();
    }
    /**
     * Load trader state from disk
     */
    loadState() {
        if (existsSync(STATE_FILE)) {
            try {
                const data = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
                return {
                    currentPosition: data.currentPosition ? {
                        ...data.currentPosition,
                        amount: BigInt(data.currentPosition.amount),
                    } : null,
                    totalPnlLamports: BigInt(data.totalPnlLamports || '0'),
                    tradesExecuted: data.tradesExecuted || 0,
                    lastTradeTime: data.lastTradeTime || 0,
                    history: (data.history || []).map((h) => ({
                        ...h,
                        amountIn: BigInt(h.amountIn),
                        amountOut: BigInt(h.amountOut),
                    })),
                };
            }
            catch (e) {
                console.warn('⚠️ Could not load trader state, starting fresh');
            }
        }
        return {
            currentPosition: null,
            totalPnlLamports: 0n,
            tradesExecuted: 0,
            lastTradeTime: 0,
            history: [],
        };
    }
    /**
     * Save trader state to disk
     */
    saveState() {
        const serializable = {
            currentPosition: this.state.currentPosition ? {
                ...this.state.currentPosition,
                amount: this.state.currentPosition.amount.toString(),
            } : null,
            totalPnlLamports: this.state.totalPnlLamports.toString(),
            tradesExecuted: this.state.tradesExecuted,
            lastTradeTime: this.state.lastTradeTime,
            history: this.state.history.map(h => ({
                ...h,
                amountIn: h.amountIn.toString(),
                amountOut: h.amountOut.toString(),
            })),
        };
        writeFileSync(STATE_FILE, JSON.stringify(serializable, null, 2));
    }
    /**
     * Main trading loop - analyze and potentially trade
     */
    async analyzAndTrade() {
        console.log('\n🤖 AUTONOMOUS TRADER - Analyzing opportunities...\n');
        // Get current yields
        const yields = await this.fetcher.fetchAllYields();
        // Show all yields
        console.log('📊 All Yields:');
        for (const y of yields) {
            const swappable = PROTOCOL_TO_TOKEN[y.protocol] ? '✓' : '✗';
            console.log(`   ${swappable} ${YieldFetcher.formatYield(y)}`);
        }
        // Filter to only swappable protocols
        const swappableYields = yields.filter(y => PROTOCOL_TO_TOKEN[y.protocol]);
        const bestSwappable = swappableYields.reduce((best, curr) => curr.adjustedApyBps > best.adjustedApyBps ? curr : best, swappableYields[0]);
        // Also track overall best for oracle recording
        const overallBest = await this.fetcher.getBestYield(70);
        if (!bestSwappable) {
            console.log('⚠️ No swappable yield opportunities found');
            if (overallBest)
                await this.recordDecision(overallBest);
            return;
        }
        console.log('\n🎯 Best SWAPPABLE Yield:', YieldFetcher.formatYield(bestSwappable));
        // Get current position status
        const balance = await this.connection.getBalance(this.payer.publicKey);
        console.log(`💰 Wallet Balance: ${(balance / 1e9).toFixed(4)} SOL`);
        if (this.state.currentPosition) {
            await this.evaluateRebalance(bestSwappable, swappableYields);
        }
        else {
            await this.evaluateEntry(bestSwappable, balance);
        }
        // Record best overall yield on-chain (for oracle accuracy)
        if (overallBest && overallBest.protocol !== bestSwappable.protocol) {
            console.log('\n📝 Also recording overall best yield for oracle...');
            await this.recordDecision(overallBest);
        }
    }
    /**
     * Evaluate whether to enter a new position
     */
    async evaluateEntry(bestYield, balanceLamports) {
        console.log('\n🎯 Evaluating entry opportunity...');
        const targetToken = PROTOCOL_TO_TOKEN[bestYield.protocol];
        if (!targetToken) {
            console.log(`⚠️ No direct swap available for ${bestYield.protocolName}`);
            // Record decision on-chain anyway
            await this.recordDecision(bestYield);
            return;
        }
        // Calculate position size (use smaller of max or 50% of balance)
        const maxAmount = this.maxPositionSol;
        const halfBalance = BigInt(Math.floor(balanceLamports / 2));
        const positionSize = halfBalance < maxAmount ? halfBalance : maxAmount;
        if (positionSize < 10000000n) { // Min 0.01 SOL
            console.log('⚠️ Insufficient balance for trade');
            return;
        }
        console.log(`\n🚀 ENTERING POSITION:`);
        console.log(`   Protocol: ${bestYield.protocolName}`);
        console.log(`   Amount: ${Number(positionSize) / 1e9} SOL`);
        console.log(`   Expected APY: ${(bestYield.apyBps / 100).toFixed(2)}%`);
        console.log(`   Risk Score: ${bestYield.riskScore}`);
        // Execute swap
        const result = await this.jupiter.swapSolTo(targetToken, positionSize);
        if (result.success && result.signature) {
            console.log(`✅ TRADE EXECUTED: ${result.signature}`);
            // Update state
            this.state.currentPosition = {
                token: bestYield.pool || 'Unknown',
                mint: targetToken.toBase58(),
                amount: result.outputAmount,
                entryPrice: Number(positionSize) / Number(result.outputAmount),
                entryTime: Date.now(),
                protocol: bestYield.protocol,
            };
            this.state.tradesExecuted++;
            this.state.lastTradeTime = Date.now();
            this.state.history.push({
                timestamp: Date.now(),
                action: 'enter',
                fromToken: 'SOL',
                toToken: bestYield.pool || 'Unknown',
                amountIn: positionSize,
                amountOut: result.outputAmount,
                signature: result.signature,
                reason: `Best yield: ${bestYield.protocolName} @ ${(bestYield.apyBps / 100).toFixed(2)}%`,
            });
            this.saveState();
            // Record on-chain
            await this.recordDecision(bestYield);
        }
        else {
            console.log(`❌ Trade failed: ${result.error}`);
        }
    }
    /**
     * Evaluate whether to rebalance current position
     */
    async evaluateRebalance(bestYield, allYields) {
        const pos = this.state.currentPosition;
        console.log(`\n📊 Current Position: ${pos.token}`);
        console.log(`   Amount: ${Number(pos.amount)}`);
        console.log(`   Entry: ${new Date(pos.entryTime).toISOString()}`);
        // Check minimum hold time
        const holdTime = Date.now() - pos.entryTime;
        if (holdTime < this.minHoldTimeMs) {
            console.log(`⏳ Minimum hold time not reached (${Math.round(holdTime / 60000)}m / ${this.minHoldTimeMs / 60000}m)`);
            await this.recordDecision(bestYield);
            return;
        }
        // Find current position's yield
        const currentYield = allYields.find(y => y.protocol === pos.protocol);
        const currentAdjusted = currentYield?.adjustedApyBps || 0;
        const improvement = bestYield.adjustedApyBps - currentAdjusted;
        console.log(`   Current yield: ${(currentAdjusted / 100).toFixed(2)}%`);
        console.log(`   Best yield: ${(bestYield.adjustedApyBps / 100).toFixed(2)}%`);
        console.log(`   Improvement: ${(improvement / 100).toFixed(2)}%`);
        if (improvement < this.minRebalanceImprovement) {
            console.log('✓ No rebalance needed (improvement below threshold)');
            await this.recordDecision(bestYield);
            return;
        }
        // Check if we can swap to the new protocol
        const newToken = PROTOCOL_TO_TOKEN[bestYield.protocol];
        if (!newToken || newToken.toBase58() === pos.mint) {
            console.log('⚠️ Cannot rebalance to same or unavailable protocol');
            await this.recordDecision(bestYield);
            return;
        }
        console.log(`\n🔄 REBALANCING:`);
        console.log(`   From: ${pos.token}`);
        console.log(`   To: ${bestYield.protocolName}`);
        // Exit current position
        const exitResult = await this.jupiter.swapToSol(new PublicKey(pos.mint), pos.amount);
        if (!exitResult.success) {
            console.log(`❌ Exit failed: ${exitResult.error}`);
            return;
        }
        console.log(`✅ Exited position: ${exitResult.signature}`);
        // Enter new position
        const entryResult = await this.jupiter.swapSolTo(newToken, exitResult.outputAmount);
        if (entryResult.success && entryResult.signature) {
            console.log(`✅ Entered new position: ${entryResult.signature}`);
            // Calculate P&L
            const pnl = exitResult.outputAmount - BigInt(Math.round(pos.entryPrice * Number(pos.amount)));
            this.state.totalPnlLamports += pnl;
            // Update state
            this.state.currentPosition = {
                token: bestYield.pool || 'Unknown',
                mint: newToken.toBase58(),
                amount: entryResult.outputAmount,
                entryPrice: Number(exitResult.outputAmount) / Number(entryResult.outputAmount),
                entryTime: Date.now(),
                protocol: bestYield.protocol,
            };
            this.state.tradesExecuted++;
            this.state.lastTradeTime = Date.now();
            this.state.history.push({
                timestamp: Date.now(),
                action: 'rebalance',
                fromToken: pos.token,
                toToken: bestYield.pool || 'Unknown',
                amountIn: pos.amount,
                amountOut: entryResult.outputAmount,
                signature: entryResult.signature,
                reason: `Rebalance: ${improvement / 100}% improvement`,
            });
            this.saveState();
            await this.recordDecision(bestYield);
        }
    }
    /**
     * Record decision on-chain for transparency
     */
    async recordDecision(yield_) {
        try {
            const sig = await this.oracleClient.monitorYields(this.oracleAddress, yield_.protocol, yield_.apyBps, yield_.riskScore);
            console.log(`📝 Decision recorded on-chain: ${sig}`);
        }
        catch (error) {
            console.warn('⚠️ Failed to record decision on-chain:', error);
        }
    }
    /**
     * Get current trading stats
     */
    getStats() {
        return {
            position: this.state.currentPosition,
            totalPnl: Number(this.state.totalPnlLamports) / 1e9,
            tradesExecuted: this.state.tradesExecuted,
            history: this.state.history,
        };
    }
}
// CLI entry point
async function main() {
    console.log('🚀 AUTONOMOUS TRADER - Starting...\n');
    const keypairPath = process.env.KEYPAIR_PATH ||
        `${process.env.HOME}/.config/solana/turbinete-wallet.json`;
    const oracleAddress = process.env.ORACLE_ADDRESS ||
        '7Ezsv1Etg3rk5WQvenCAjrArHp8zdacBFmKWj2iEn7pd';
    const keypairData = JSON.parse(readFileSync(keypairPath, 'utf-8'));
    const payer = Keypair.fromSecretKey(Uint8Array.from(keypairData));
    const connection = new Connection(DEFAULT_CONFIG.rpcUrl, 'confirmed');
    const trader = new AutonomousTrader(connection, payer, new PublicKey(oracleAddress));
    // Run one analysis cycle
    await trader.analyzAndTrade();
    // Print stats
    const stats = trader.getStats();
    console.log('\n📈 TRADER STATS:');
    console.log(`   Trades executed: ${stats.tradesExecuted}`);
    console.log(`   Total P&L: ${stats.totalPnl.toFixed(6)} SOL`);
    if (stats.position) {
        console.log(`   Current position: ${stats.position.token}`);
    }
}
main().catch(console.error);
