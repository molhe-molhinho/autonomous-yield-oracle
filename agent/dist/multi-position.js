/**
 * Multi-Position Manager - Hold multiple yield positions simultaneously
 *
 * Instead of all-in on one protocol, diversify across multiple:
 * - Split funds across top yield opportunities
 * - Risk diversification across protocols
 * - Partial rebalancing when yields shift
 * - Configurable allocation strategies
 *
 * Built by Turbinete 🚀 for the Colosseum Agent Hackathon 2026
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { JupiterSwap } from './jupiter.js';
import { PROTOCOL_NAMES, TOKENS, PROTOCOL } from './config.js';
// State file for multi-position tracking
const MULTI_POSITION_FILE = '/Users/molhemolinho/clawd/projects/autonomous-yield-oracle/agent/multi-position-state.json';
// Supported yield tokens for multi-position
const PROTOCOL_TO_TOKEN = {
    [PROTOCOL.MARINADE]: { mint: TOKENS.mSOL, symbol: 'mSOL' },
    [PROTOCOL.JITO]: { mint: TOKENS.jitoSOL, symbol: 'jitoSOL' },
};
const DEFAULT_CONFIG = {
    maxPositions: 3,
    minPositionSol: 100000000n, // 0.1 SOL minimum
    rebalanceThresholdPercent: 10, // Rebalance if >10% drift
    strategy: 'yield-weighted',
    enabled: true,
};
export class MultiPositionManager {
    connection;
    payer;
    jupiter;
    state;
    config;
    constructor(connection, payer, config) {
        this.connection = connection;
        this.payer = payer;
        this.jupiter = new JupiterSwap(connection, payer);
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.state = this.loadState();
    }
    /**
     * Load state from disk
     */
    loadState() {
        if (existsSync(MULTI_POSITION_FILE)) {
            try {
                return JSON.parse(readFileSync(MULTI_POSITION_FILE, 'utf-8'));
            }
            catch (e) {
                console.warn('⚠️ Could not load multi-position state');
            }
        }
        return {
            positions: [],
            totalSolAllocated: '0',
            lastRebalance: 0,
            strategy: this.config.strategy,
            history: [],
        };
    }
    /**
     * Save state to disk
     */
    saveState() {
        writeFileSync(MULTI_POSITION_FILE, JSON.stringify(this.state, null, 2));
    }
    /**
     * Calculate target allocations based on current yields
     */
    calculateAllocations(yields, totalSol) {
        const allocations = new Map();
        // Filter to swappable protocols only
        const swappable = yields.filter(y => PROTOCOL_TO_TOKEN[y.protocol]);
        if (swappable.length === 0)
            return allocations;
        // Limit to max positions
        const topYields = swappable
            .sort((a, b) => b.adjustedApyBps - a.adjustedApyBps)
            .slice(0, this.config.maxPositions);
        switch (this.config.strategy) {
            case 'equal':
                return this.equalAllocation(topYields, totalSol);
            case 'yield-weighted':
                return this.yieldWeightedAllocation(topYields, totalSol);
            case 'risk-weighted':
                return this.riskWeightedAllocation(topYields, totalSol);
            case 'gravity-weighted':
                return this.yieldWeightedAllocation(topYields, totalSol); // Default to yield for now
            default:
                return this.equalAllocation(topYields, totalSol);
        }
    }
    /**
     * Equal allocation across protocols
     */
    equalAllocation(yields, totalSol) {
        const allocations = new Map();
        const perProtocol = totalSol / BigInt(yields.length);
        for (const y of yields) {
            if (perProtocol >= this.config.minPositionSol) {
                allocations.set(y.protocol, perProtocol);
            }
        }
        return allocations;
    }
    /**
     * Yield-weighted allocation (higher yield = more allocation)
     */
    yieldWeightedAllocation(yields, totalSol) {
        const allocations = new Map();
        const totalYield = yields.reduce((sum, y) => sum + y.adjustedApyBps, 0);
        if (totalYield === 0)
            return this.equalAllocation(yields, totalSol);
        for (const y of yields) {
            const weight = y.adjustedApyBps / totalYield;
            const amount = BigInt(Math.floor(Number(totalSol) * weight));
            if (amount >= this.config.minPositionSol) {
                allocations.set(y.protocol, amount);
            }
        }
        return allocations;
    }
    /**
     * Risk-weighted allocation (lower risk = more allocation)
     */
    riskWeightedAllocation(yields, totalSol) {
        const allocations = new Map();
        const inverseRisks = yields.map(y => 100 - y.riskScore);
        const totalInverseRisk = inverseRisks.reduce((sum, r) => sum + r, 0);
        if (totalInverseRisk === 0)
            return this.equalAllocation(yields, totalSol);
        for (let i = 0; i < yields.length; i++) {
            const weight = inverseRisks[i] / totalInverseRisk;
            const amount = BigInt(Math.floor(Number(totalSol) * weight));
            if (amount >= this.config.minPositionSol) {
                allocations.set(yields[i].protocol, amount);
            }
        }
        return allocations;
    }
    /**
     * Check if rebalancing is needed
     */
    needsRebalancing(currentPositions, targetAllocations, totalValue) {
        if (totalValue === 0n)
            return false;
        for (const [protocol, target] of targetAllocations) {
            const current = currentPositions.get(protocol) || 0n;
            const driftPercent = Math.abs(Number(current - target) / Number(totalValue) * 100);
            if (driftPercent > this.config.rebalanceThresholdPercent) {
                return true;
            }
        }
        // Check for protocols we should exit
        for (const [protocol, current] of currentPositions) {
            if (!targetAllocations.has(protocol) && current > 0n) {
                return true;
            }
        }
        return false;
    }
    /**
     * Execute rebalancing trades
     */
    async rebalance(yields, availableSol) {
        if (!this.config.enabled) {
            return { success: false, signatures: [], error: 'Multi-position disabled' };
        }
        console.log('\n📊 Multi-Position Rebalance Analysis:');
        // Calculate target allocations
        const targetAllocations = this.calculateAllocations(yields, availableSol);
        console.log('   Target Allocations:');
        for (const [protocol, amount] of targetAllocations) {
            const percent = Number(amount) / Number(availableSol) * 100;
            console.log(`   • ${PROTOCOL_NAMES[protocol]}: ${(Number(amount) / 1e9).toFixed(3)} SOL (${percent.toFixed(1)}%)`);
        }
        // Get current positions
        const currentPositions = await this.getCurrentPositions();
        console.log('   Current Positions:');
        if (currentPositions.size === 0) {
            console.log('   • No positions yet');
        }
        for (const [protocol, amount] of currentPositions) {
            console.log(`   • ${PROTOCOL_NAMES[protocol]}: ${(Number(amount) / 1e9).toFixed(6)}`);
        }
        // Calculate total current value
        const totalCurrent = Array.from(currentPositions.values()).reduce((a, b) => a + b, 0n);
        const totalTarget = Array.from(targetAllocations.values()).reduce((a, b) => a + b, 0n);
        // Check if rebalancing is needed
        if (!this.needsRebalancing(currentPositions, targetAllocations, totalCurrent + availableSol)) {
            console.log('   ✓ No rebalancing needed');
            return { success: true, signatures: [] };
        }
        console.log('   🔄 Rebalancing required...');
        // Execute trades
        const signatures = [];
        const changes = [];
        // First, allocate new SOL to underweight positions
        for (const [protocol, targetAmount] of targetAllocations) {
            const currentAmount = currentPositions.get(protocol) || 0n;
            const tokenInfo = PROTOCOL_TO_TOKEN[protocol];
            if (!tokenInfo)
                continue;
            // If we need more in this protocol
            if (targetAmount > currentAmount) {
                const toAllocate = targetAmount - currentAmount;
                // Only allocate if we have enough SOL and meet minimum
                if (toAllocate >= this.config.minPositionSol && availableSol >= toAllocate) {
                    console.log(`   → Allocating ${(Number(toAllocate) / 1e9).toFixed(3)} SOL to ${PROTOCOL_NAMES[protocol]}`);
                    try {
                        const result = await this.jupiter.swapSolTo(tokenInfo.mint, toAllocate);
                        if (result.success && result.signature) {
                            signatures.push(result.signature);
                            changes.push({
                                protocol,
                                change: `+${(Number(toAllocate) / 1e9).toFixed(3)} SOL`,
                                reason: 'Target allocation increase',
                            });
                            availableSol -= toAllocate;
                            // Update position
                            this.updatePosition(protocol, tokenInfo, result.outputAmount, yields);
                        }
                    }
                    catch (error) {
                        console.warn(`   ⚠️ Failed to allocate to ${PROTOCOL_NAMES[protocol]}:`, error);
                    }
                }
            }
        }
        // Record rebalance
        if (signatures.length > 0) {
            this.state.history.push({
                timestamp: Date.now(),
                action: 'rebalance',
                changes,
                signatures,
            });
            this.state.lastRebalance = Date.now();
            this.saveState();
        }
        return { success: true, signatures };
    }
    /**
     * Get current token positions
     */
    async getCurrentPositions() {
        const positions = new Map();
        for (const [protocol, tokenInfo] of Object.entries(PROTOCOL_TO_TOKEN)) {
            if (!tokenInfo)
                continue;
            try {
                const accounts = await this.connection.getParsedTokenAccountsByOwner(this.payer.publicKey, { mint: tokenInfo.mint });
                if (accounts.value.length > 0) {
                    const accountData = accounts.value[0].account.data;
                    const balance = accountData?.parsed?.info?.tokenAmount?.amount;
                    if (balance && BigInt(balance) > 0n) {
                        positions.set(Number(protocol), BigInt(balance));
                    }
                }
            }
            catch (e) {
                // Token account doesn't exist
            }
        }
        return positions;
    }
    /**
     * Update position tracking
     */
    updatePosition(protocol, tokenInfo, amount, yields) {
        const yieldData = yields.find(y => y.protocol === protocol);
        // Find existing position or create new
        let position = this.state.positions.find(p => p.protocol === protocol);
        if (position) {
            // Update existing
            position.amount = (BigInt(position.amount) + amount).toString();
            position.currentApyBps = yieldData?.apyBps;
        }
        else {
            // Create new
            this.state.positions.push({
                protocol,
                protocolName: PROTOCOL_NAMES[protocol],
                mint: tokenInfo.mint.toBase58(),
                symbol: tokenInfo.symbol,
                amount: amount.toString(),
                solEquivalent: amount.toString(), // Approximate
                entryTime: Date.now(),
                entryApyBps: yieldData?.apyBps || 0,
                currentApyBps: yieldData?.apyBps,
            });
        }
        this.saveState();
    }
    /**
     * Get portfolio summary
     */
    getPortfolioSummary() {
        return {
            positions: this.state.positions,
            totalPositions: this.state.positions.length,
            strategy: this.state.strategy,
            lastRebalance: this.state.lastRebalance,
        };
    }
    /**
     * Format portfolio for display
     */
    static formatPortfolio(positions) {
        if (positions.length === 0)
            return 'No positions';
        return positions.map(p => {
            const amount = (Number(p.amount) / 1e9).toFixed(4);
            const apy = p.currentApyBps ? `${(p.currentApyBps / 100).toFixed(2)}%` : 'N/A';
            return `${p.symbol}: ${amount} (${apy} APY)`;
        }).join(' | ');
    }
}
