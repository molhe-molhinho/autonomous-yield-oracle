/**
 * Autonomous Yield Oracle Agent
 *
 * 24/7 yield monitoring, trading, and optimization for Solana DeFi.
 * - Monitors yields across protocols
 * - Executes trades via Jupiter when opportunities arise
 * - Records all decisions on-chain for transparency
 *
 * Built by Turbinete 🚀 for the Colosseum Agent Hackathon 2026
 */
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { config } from 'dotenv';
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'fs';
import { OracleClient } from './client.js';
import { YieldFetcher } from './yields.js';
import { JupiterSwap } from './jupiter.js';
import { DEFAULT_CONFIG, PROTOCOL_NAMES, PROGRAM_ID, PROTOCOL, TOKENS } from './config.js';
import { YieldGravity } from './gravity.js';
// Load environment
config();
// ASCII Art Banner
const BANNER = `
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║     🚀 AUTONOMOUS YIELD ORACLE 🚀                                 ║
║                                                                   ║
║     24/7 AI-Powered Yield Optimization + TRADING                  ║
║     Built by Turbinete for Colosseum Hackathon 2026              ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
`;
// File paths
const STATE_FILE = '/Users/molhemolinho/clawd/projects/autonomous-yield-oracle/agent/trader-state.json';
const LOG_FILE = '/Users/molhemolinho/clawd/projects/autonomous-yield-oracle/agent/agent.log';
// Map protocols to their yield tokens (swappable)
const PROTOCOL_TO_TOKEN = {
    [PROTOCOL.MARINADE]: TOKENS.mSOL,
    [PROTOCOL.JITO]: TOKENS.jitoSOL,
};
class YieldOracleAgent {
    connection;
    payer;
    client;
    fetcher;
    jupiter;
    gravity;
    oracleAddress = null;
    config;
    isRunning = false;
    traderState;
    constructor(agentConfig) {
        this.config = agentConfig;
        this.connection = new Connection(agentConfig.rpcUrl, 'confirmed');
        // Load keypair
        const keypairData = JSON.parse(readFileSync(agentConfig.keypairPath, 'utf-8'));
        this.payer = Keypair.fromSecretKey(Uint8Array.from(keypairData));
        this.client = new OracleClient(this.connection, this.payer);
        this.fetcher = new YieldFetcher();
        this.jupiter = new JupiterSwap(this.connection, this.payer);
        this.gravity = new YieldGravity();
        this.traderState = this.loadTraderState();
        if (agentConfig.oracleAddress) {
            this.oracleAddress = new PublicKey(agentConfig.oracleAddress);
        }
    }
    /**
     * Load trader state from disk
     */
    loadTraderState() {
        if (existsSync(STATE_FILE)) {
            try {
                return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
            }
            catch (e) {
                this.log('WARN', 'Could not load trader state, starting fresh');
            }
        }
        return {
            currentPosition: null,
            totalPnlLamports: '0',
            tradesExecuted: 0,
            lastTradeTime: 0,
            history: [],
        };
    }
    /**
     * Save trader state to disk
     */
    saveTraderState() {
        writeFileSync(STATE_FILE, JSON.stringify(this.traderState, null, 2));
    }
    /**
     * Log to console and file
     */
    log(level, message, data) {
        const timestamp = new Date().toISOString();
        const logLine = `[${timestamp}] [${level}] ${message}${data ? ' ' + JSON.stringify(data) : ''}`;
        console.log(logLine);
        try {
            appendFileSync(LOG_FILE, logLine + '\n');
        }
        catch (e) {
            // Ignore log write errors
        }
    }
    /**
     * Initialize the agent - create oracle if needed
     */
    async initialize() {
        console.log(BANNER);
        this.log('INFO', `🔑 Authority: ${this.payer.publicKey.toBase58()}`);
        this.log('INFO', `📡 RPC: ${this.config.rpcUrl}`);
        this.log('INFO', `📋 Program: ${PROGRAM_ID.toBase58()}`);
        this.log('INFO', `💰 Trading: ${this.config.tradingEnabled ? 'ENABLED' : 'DISABLED'}`);
        const balance = await this.connection.getBalance(this.payer.publicKey);
        this.log('INFO', `💰 Balance: ${(balance / 1e9).toFixed(4)} SOL`);
        // Check if oracle exists
        if (this.oracleAddress) {
            const state = await this.client.getOracleState(this.oracleAddress);
            if (state && state.isInitialized) {
                this.log('INFO', `✅ Oracle found: ${this.oracleAddress.toBase58()}`);
                this.logOracleState(state);
                return;
            }
        }
        // Create new oracle
        this.log('INFO', '📝 Creating new oracle account...');
        const oracleKeypair = Keypair.generate();
        await this.client.initialize(oracleKeypair);
        this.oracleAddress = oracleKeypair.publicKey;
        this.log('INFO', `✅ Oracle created: ${this.oracleAddress.toBase58()}`);
    }
    /**
     * Run the main monitoring + trading loop
     */
    async run() {
        if (!this.oracleAddress) {
            throw new Error('Oracle not initialized. Call initialize() first.');
        }
        this.isRunning = true;
        this.log('INFO', '🚀 Starting autonomous agent loop...');
        this.log('INFO', `⏱️  Interval: ${this.config.monitorIntervalMs / 1000}s`);
        this.log('INFO', `📊 Max Risk: ${this.config.maxRiskScore}`);
        this.log('INFO', `📈 Min Improvement: ${this.config.minYieldDifferenceBps / 100}%`);
        while (this.isRunning) {
            try {
                await this.tick();
            }
            catch (error) {
                this.log('ERROR', 'Error in agent loop', { error: String(error) });
            }
            await this.sleep(this.config.monitorIntervalMs);
        }
    }
    /**
     * Single tick - monitor yields and potentially trade
     */
    async tick() {
        const timestamp = new Date().toISOString();
        console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        this.log('INFO', `📊 Agent Tick @ ${timestamp}`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        // Fetch current yields
        const yields = await this.fetcher.fetchAllYields();
        console.log(`\n📈 Current Yields (${yields.length} protocols):`);
        for (const y of yields) {
            const swappable = PROTOCOL_TO_TOKEN[y.protocol] ? '✓' : ' ';
            console.log(`   [${swappable}] ${YieldFetcher.formatYield(y)}`);
        }
        // 🔮 Yield Gravity™ Analysis
        const gravityAnalyses = this.gravity.analyzeYields(yields);
        console.log(`\n🔮 Yield Gravity™ Analysis:`);
        for (const analysis of gravityAnalyses) {
            console.log(`   ${YieldGravity.formatAnalysis(analysis)}`);
            for (const signal of analysis.signals) {
                console.log(`      └─ ${signal.message} (${signal.impact > 0 ? '+' : ''}${signal.impact}bps)`);
            }
        }
        // Get best by gravity score (predictive) vs best by current yield
        const bestByGravity = this.gravity.getBestByGravity(gravityAnalyses, this.config.maxRiskScore);
        if (bestByGravity) {
            console.log(`\n🔮 Best by Gravity: ${bestByGravity.protocolName} (score: ${bestByGravity.gravityScore.toFixed(0)})`);
        }
        // Get best overall yield (for oracle)
        const bestOverall = await this.fetcher.getBestYield(this.config.maxRiskScore);
        if (!bestOverall) {
            this.log('WARN', 'No eligible yields found within risk tolerance');
            return;
        }
        console.log(`\n🏆 Best Overall: ${YieldFetcher.formatYield(bestOverall)}`);
        // Update oracle if needed
        await this.updateOracleIfNeeded(bestOverall);
        // Trading logic (if enabled)
        if (this.config.tradingEnabled) {
            const swappableYields = yields.filter(y => PROTOCOL_TO_TOKEN[y.protocol]);
            if (swappableYields.length > 0) {
                const bestSwappable = swappableYields.reduce((best, curr) => curr.adjustedApyBps > best.adjustedApyBps ? curr : best, swappableYields[0]);
                console.log(`\n🎯 Best Swappable: ${YieldFetcher.formatYield(bestSwappable)}`);
                await this.evaluateAndTrade(bestSwappable, swappableYields);
            }
        }
    }
    /**
     * Update oracle on-chain if conditions met
     */
    async updateOracleIfNeeded(best) {
        const state = await this.client.getOracleState(this.oracleAddress);
        if (!state) {
            this.log('ERROR', 'Could not fetch oracle state');
            return;
        }
        const currentAdjusted = Math.round(state.currentApyBps * (100 - state.riskScore) / 100);
        const improvement = best.adjustedApyBps - currentAdjusted;
        const isStale = Date.now() / 1000 - Number(state.lastUpdate) > 3600;
        console.log(`\n📋 Oracle State:`);
        console.log(`   Current: ${PROTOCOL_NAMES[state.bestProtocol]} @ ${(state.currentApyBps / 100).toFixed(2)}%`);
        console.log(`   Decisions: ${state.decisionsCount}`);
        console.log(`   Stale: ${isStale ? 'Yes' : 'No'}`);
        const shouldUpdate = improvement >= this.config.minYieldDifferenceBps || isStale;
        if (shouldUpdate) {
            this.log('INFO', '🔄 Updating oracle on-chain...');
            try {
                const sig = await this.client.monitorYields(this.oracleAddress, best.protocol, best.apyBps, best.riskScore);
                this.log('INFO', `✅ Oracle updated`, { signature: sig, reason: isStale ? 'stale' : 'better_yield' });
            }
            catch (error) {
                this.log('ERROR', 'Failed to update oracle', { error: String(error) });
            }
        }
    }
    /**
     * Evaluate trading opportunity and execute if conditions met
     */
    async evaluateAndTrade(bestYield, allYields) {
        const balance = await this.connection.getBalance(this.payer.publicKey);
        console.log(`\n💰 Wallet: ${(balance / 1e9).toFixed(4)} SOL`);
        if (this.traderState.currentPosition) {
            await this.evaluateRebalance(bestYield, allYields);
        }
        else {
            await this.evaluateEntry(bestYield, balance);
        }
    }
    /**
     * Evaluate entering a new position
     */
    async evaluateEntry(bestYield, balanceLamports) {
        const targetToken = PROTOCOL_TO_TOKEN[bestYield.protocol];
        if (!targetToken) {
            this.log('WARN', `No swap available for ${bestYield.protocolName}`);
            return;
        }
        // Position size: smaller of maxPosition or 50% of balance
        const maxAmount = this.config.maxPositionLamports;
        const halfBalance = BigInt(Math.floor(balanceLamports / 2));
        const positionSize = halfBalance < maxAmount ? halfBalance : maxAmount;
        if (positionSize < 10000000n) { // Min 0.01 SOL
            this.log('WARN', 'Insufficient balance for trade');
            return;
        }
        this.log('INFO', `🚀 ENTERING POSITION`, {
            protocol: bestYield.protocolName,
            amount: `${Number(positionSize) / 1e9} SOL`,
            apy: `${(bestYield.apyBps / 100).toFixed(2)}%`,
        });
        try {
            const result = await this.jupiter.swapSolTo(targetToken, positionSize);
            if (result.success && result.signature) {
                this.log('TRADE', '✅ Trade executed', {
                    signature: result.signature,
                    amountIn: positionSize.toString(),
                    amountOut: result.outputAmount.toString(),
                });
                // Update state
                this.traderState.currentPosition = {
                    token: bestYield.pool || bestYield.protocolName,
                    mint: targetToken.toBase58(),
                    amount: result.outputAmount.toString(),
                    entryPrice: Number(positionSize) / Number(result.outputAmount),
                    entryTime: Date.now(),
                    protocol: bestYield.protocol,
                };
                this.traderState.tradesExecuted++;
                this.traderState.lastTradeTime = Date.now();
                this.traderState.history.push({
                    timestamp: Date.now(),
                    action: 'enter',
                    fromToken: 'SOL',
                    toToken: bestYield.pool || bestYield.protocolName,
                    amountIn: positionSize.toString(),
                    amountOut: result.outputAmount.toString(),
                    signature: result.signature,
                    reason: `Best yield: ${bestYield.protocolName} @ ${(bestYield.apyBps / 100).toFixed(2)}%`,
                });
                this.saveTraderState();
            }
            else {
                this.log('ERROR', 'Trade failed', { error: result.error });
            }
        }
        catch (error) {
            this.log('ERROR', 'Trade execution error', { error: String(error) });
        }
    }
    /**
     * Evaluate rebalancing current position
     */
    async evaluateRebalance(bestYield, allYields) {
        const pos = this.traderState.currentPosition;
        console.log(`\n📊 Current Position: ${pos.token}`);
        console.log(`   Amount: ${(Number(pos.amount) / 1e9).toFixed(6)}`);
        console.log(`   Since: ${new Date(pos.entryTime).toISOString()}`);
        // Check minimum hold time
        const holdTime = Date.now() - pos.entryTime;
        if (holdTime < this.config.minHoldTimeMs) {
            const remaining = Math.round((this.config.minHoldTimeMs - holdTime) / 60000);
            console.log(`   ⏳ Hold time: ${remaining}m remaining`);
            return;
        }
        // Find current position's yield
        const currentYield = allYields.find(y => y.protocol === pos.protocol);
        const currentAdjusted = currentYield?.adjustedApyBps || 0;
        const improvement = bestYield.adjustedApyBps - currentAdjusted;
        console.log(`   Current APY: ${(currentAdjusted / 100).toFixed(2)}%`);
        console.log(`   Best APY: ${(bestYield.adjustedApyBps / 100).toFixed(2)}%`);
        console.log(`   Improvement: ${(improvement / 100).toFixed(2)}%`);
        if (improvement < this.config.minRebalanceImprovementBps) {
            console.log('   ✓ No rebalance needed');
            return;
        }
        const newToken = PROTOCOL_TO_TOKEN[bestYield.protocol];
        if (!newToken || newToken.toBase58() === pos.mint) {
            console.log('   ⚠️ Cannot rebalance to same/unavailable protocol');
            return;
        }
        this.log('INFO', `🔄 REBALANCING`, {
            from: pos.token,
            to: bestYield.protocolName,
            improvement: `${(improvement / 100).toFixed(2)}%`,
        });
        try {
            // Exit current position
            const exitResult = await this.jupiter.swapToSol(new PublicKey(pos.mint), BigInt(pos.amount));
            if (!exitResult.success) {
                this.log('ERROR', 'Exit failed', { error: exitResult.error });
                return;
            }
            this.log('INFO', `Exit TX: ${exitResult.signature}`);
            // Enter new position
            const entryResult = await this.jupiter.swapSolTo(newToken, exitResult.outputAmount);
            if (entryResult.success && entryResult.signature) {
                this.log('TRADE', '✅ Rebalance complete', {
                    exitSig: exitResult.signature,
                    entrySig: entryResult.signature,
                });
                // Calculate P&L
                const pnl = exitResult.outputAmount - BigInt(Math.round(pos.entryPrice * Number(pos.amount)));
                const totalPnl = BigInt(this.traderState.totalPnlLamports) + pnl;
                // Update state
                this.traderState.totalPnlLamports = totalPnl.toString();
                this.traderState.currentPosition = {
                    token: bestYield.pool || bestYield.protocolName,
                    mint: newToken.toBase58(),
                    amount: entryResult.outputAmount.toString(),
                    entryPrice: Number(exitResult.outputAmount) / Number(entryResult.outputAmount),
                    entryTime: Date.now(),
                    protocol: bestYield.protocol,
                };
                this.traderState.tradesExecuted++;
                this.traderState.lastTradeTime = Date.now();
                this.traderState.history.push({
                    timestamp: Date.now(),
                    action: 'rebalance',
                    fromToken: pos.token,
                    toToken: bestYield.pool || bestYield.protocolName,
                    amountIn: pos.amount,
                    amountOut: entryResult.outputAmount.toString(),
                    signature: entryResult.signature,
                    reason: `Rebalance for ${(improvement / 100).toFixed(2)}% improvement`,
                });
                this.saveTraderState();
            }
        }
        catch (error) {
            this.log('ERROR', 'Rebalance error', { error: String(error) });
        }
    }
    /**
     * Stop the agent gracefully
     */
    stop() {
        this.log('INFO', '🛑 Stopping agent...');
        this.isRunning = false;
    }
    /**
     * Get current stats (for external queries)
     */
    getStats() {
        return {
            ...this.traderState,
            oracleAddress: this.oracleAddress?.toBase58() || null,
        };
    }
    logOracleState(state) {
        console.log(`   Protocol: ${PROTOCOL_NAMES[state.bestProtocol]}`);
        console.log(`   APY: ${(state.currentApyBps / 100).toFixed(2)}%`);
        console.log(`   Risk: ${state.riskScore}`);
        console.log(`   Decisions: ${state.decisionsCount}`);
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
// Main entry point
async function main() {
    const keypairPath = process.env.KEYPAIR_PATH ||
        `${process.env.HOME}/.config/solana/turbinete-wallet.json`;
    if (!existsSync(keypairPath)) {
        console.error(`❌ Keypair not found: ${keypairPath}`);
        process.exit(1);
    }
    const agentConfig = {
        keypairPath,
        oracleAddress: process.env.ORACLE_ADDRESS || '7Ezsv1Etg3rk5WQvenCAjrArHp8zdacBFmKWj2iEn7pd',
        rpcUrl: process.env.RPC_URL || DEFAULT_CONFIG.rpcUrl,
        monitorIntervalMs: parseInt(process.env.MONITOR_INTERVAL_MS || '') || 300_000, // 5 minutes default
        maxRiskScore: parseInt(process.env.MAX_RISK_SCORE || '') || DEFAULT_CONFIG.maxRiskScore,
        minYieldDifferenceBps: parseInt(process.env.MIN_YIELD_DIFF_BPS || '') || DEFAULT_CONFIG.minYieldDifferenceBps,
        tradingEnabled: process.env.TRADING_ENABLED !== 'false', // Default true
        maxPositionLamports: BigInt(process.env.MAX_POSITION_LAMPORTS || '1000000000'), // 1 SOL
        minHoldTimeMs: parseInt(process.env.MIN_HOLD_TIME_MS || '') || 3600_000, // 1 hour
        minRebalanceImprovementBps: parseInt(process.env.MIN_REBALANCE_BPS || '') || 100, // 1%
    };
    const agent = new YieldOracleAgent(agentConfig);
    // Handle graceful shutdown
    process.on('SIGINT', () => agent.stop());
    process.on('SIGTERM', () => agent.stop());
    await agent.initialize();
    await agent.run();
}
main().catch(console.error);
