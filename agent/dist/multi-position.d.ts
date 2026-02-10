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
import { Connection, Keypair } from '@solana/web3.js';
import { YieldData } from './yields.js';
import { ProtocolId } from './config.js';
export interface Position {
    protocol: ProtocolId;
    protocolName: string;
    mint: string;
    symbol: string;
    amount: string;
    solEquivalent: string;
    entryTime: number;
    entryApyBps: number;
    currentApyBps?: number;
}
export interface AllocationTarget {
    protocol: ProtocolId;
    targetPercent: number;
    minPercent: number;
    maxPercent: number;
}
export interface MultiPositionState {
    positions: Position[];
    totalSolAllocated: string;
    lastRebalance: number;
    strategy: AllocationStrategy;
    history: RebalanceRecord[];
}
export interface RebalanceRecord {
    timestamp: number;
    action: 'allocate' | 'rebalance' | 'withdraw';
    changes: {
        protocol: ProtocolId;
        change: string;
        reason: string;
    }[];
    signatures: string[];
}
export type AllocationStrategy = 'equal' | 'yield-weighted' | 'risk-weighted' | 'gravity-weighted';
export interface MultiPositionConfig {
    maxPositions: number;
    minPositionSol: bigint;
    rebalanceThresholdPercent: number;
    strategy: AllocationStrategy;
    enabled: boolean;
}
export declare class MultiPositionManager {
    private connection;
    private payer;
    private jupiter;
    private state;
    private config;
    constructor(connection: Connection, payer: Keypair, config?: Partial<MultiPositionConfig>);
    /**
     * Load state from disk
     */
    private loadState;
    /**
     * Save state to disk
     */
    private saveState;
    /**
     * Calculate target allocations based on current yields
     */
    calculateAllocations(yields: YieldData[], totalSol: bigint): Map<ProtocolId, bigint>;
    /**
     * Equal allocation across protocols
     */
    private equalAllocation;
    /**
     * Yield-weighted allocation (higher yield = more allocation)
     */
    private yieldWeightedAllocation;
    /**
     * Risk-weighted allocation (lower risk = more allocation)
     */
    private riskWeightedAllocation;
    /**
     * Check if rebalancing is needed
     */
    needsRebalancing(currentPositions: Map<ProtocolId, bigint>, targetAllocations: Map<ProtocolId, bigint>, totalValue: bigint): boolean;
    /**
     * Execute rebalancing trades
     */
    rebalance(yields: YieldData[], availableSol: bigint): Promise<{
        success: boolean;
        signatures: string[];
        error?: string;
    }>;
    /**
     * Get current token positions
     */
    getCurrentPositions(): Promise<Map<ProtocolId, bigint>>;
    /**
     * Update position tracking
     */
    private updatePosition;
    /**
     * Get portfolio summary
     */
    getPortfolioSummary(): {
        positions: Position[];
        totalPositions: number;
        strategy: AllocationStrategy;
        lastRebalance: number;
    };
    /**
     * Format portfolio for display
     */
    static formatPortfolio(positions: Position[]): string;
}
