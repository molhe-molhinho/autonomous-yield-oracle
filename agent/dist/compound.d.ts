/**
 * Auto-Compound - Automatically reinvest earned yield
 *
 * Compound interest is the 8th wonder of the world!
 * This module tracks yield earnings and reinvests them.
 *
 * Built by Turbinete 🚀 for the Colosseum Agent Hackathon 2026
 */
import { Connection, Keypair } from '@solana/web3.js';
export interface CompoundState {
    positions: CompoundPosition[];
    totalCompounded: string;
    compoundCount: number;
    lastCompound: number;
    history: CompoundRecord[];
}
export interface CompoundPosition {
    token: string;
    mint: string;
    initialAmount: string;
    currentAmount: string;
    earnedYield: string;
    lastUpdate: number;
    apy: number;
}
export interface CompoundRecord {
    timestamp: number;
    token: string;
    yieldEarned: string;
    compoundedAmount: string;
    newTotal: string;
    signature?: string;
}
export interface CompoundConfig {
    enabled: boolean;
    minCompoundSol: bigint;
    checkIntervalMs: number;
    autoReinvest: boolean;
}
export declare class AutoCompound {
    private connection;
    private payer;
    private jupiter;
    private state;
    private config;
    constructor(connection: Connection, payer: Keypair, config?: Partial<CompoundConfig>);
    /**
     * Load state from disk
     */
    private loadState;
    /**
     * Save state to disk
     */
    private saveState;
    /**
     * Track a new position for compounding
     */
    trackPosition(token: string, amount: bigint): Promise<void>;
    /**
     * Calculate yield earned since last update
     */
    calculateYieldEarned(position: CompoundPosition): bigint;
    /**
     * Check all positions and compound if needed
     */
    checkAndCompound(): Promise<{
        compounded: boolean;
        totalYield: bigint;
        details: string[];
    }>;
    /**
     * Get compound statistics
     */
    getStats(): {
        positions: number;
        totalTracked: string;
        totalYieldEarned: string;
        compoundCount: number;
        lastCompound: number;
        effectiveApy: number;
    };
    /**
     * Format stats for display
     */
    static formatStats(stats: ReturnType<AutoCompound['getStats']>): string;
    /**
     * Project future earnings
     */
    projectEarnings(days: number): {
        projected: string;
        withCompounding: string;
        compoundBonus: string;
    };
}
