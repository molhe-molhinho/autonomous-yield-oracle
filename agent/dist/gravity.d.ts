/**
 * Yield Gravity™ - Predictive Yield Analysis
 *
 * Instead of just reacting to current yields, we predict where they're heading.
 *
 * Features:
 * - Historical yield tracking
 * - Velocity calculation (rate of change)
 * - Momentum detection
 * - Mean reversion signals
 * - TVL-based yield compression prediction
 *
 * Built by Turbinete 🚀 for the Colosseum Agent Hackathon 2026
 */
import { YieldData } from './yields.js';
import { ProtocolId } from './config.js';
export interface YieldSnapshot {
    timestamp: number;
    protocol: ProtocolId;
    apyBps: number;
    adjustedApyBps: number;
    tvl?: number;
}
export interface YieldHistory {
    snapshots: YieldSnapshot[];
    lastUpdated: number;
}
export interface GravityAnalysis {
    protocol: ProtocolId;
    protocolName: string;
    currentApyBps: number;
    adjustedApyBps: number;
    velocityBpsPerHour: number;
    velocityTrend: 'rising' | 'falling' | 'stable';
    momentum: number;
    momentumStrength: 'strong' | 'moderate' | 'weak';
    tvlUsd?: number;
    tvlVelocityPerHour?: number;
    tvlTrend?: 'inflow' | 'outflow' | 'stable';
    predictedApyBps: number;
    predictedAdjustedBps: number;
    confidence: number;
    signals: GravitySignal[];
    gravityScore: number;
}
export interface GravitySignal {
    type: 'momentum' | 'mean_reversion' | 'tvl_compression' | 'breakout' | 'warning';
    message: string;
    impact: number;
}
export declare class YieldGravity {
    private history;
    private lastSave;
    private saveCooldownMs;
    constructor();
    /**
     * Load historical data from disk
     */
    private loadHistory;
    /**
     * Save history to disk
     */
    private saveHistory;
    /**
     * Record current yields to history
     */
    recordYields(yields: YieldData[]): void;
    /**
     * Analyze yields with Yield Gravity™
     */
    analyzeYields(yields: YieldData[]): GravityAnalysis[];
    /**
     * Deep analysis of a single protocol
     */
    private analyzeProtocol;
    /**
     * Calculate velocity (bps change per hour)
     */
    private calculateVelocity;
    /**
     * Calculate momentum (-1 to 1 scale)
     * Positive = bullish, Negative = bearish
     */
    private calculateMomentum;
    /**
     * TVL Gravity - Analyze TVL trends to predict yield compression
     *
     * Key insight: When TVL rapidly increases, yields tend to compress.
     * We want to EXIT before the crowd arrives, not after.
     */
    private analyzeTvl;
    /**
     * Detect mean reversion opportunity
     */
    private detectMeanReversion;
    /**
     * Detect yield breakouts
     */
    private detectBreakout;
    /**
     * Predict yield 1 hour from now
     */
    private predictYield;
    /**
     * Get best opportunity based on Gravity Score
     */
    getBestByGravity(analyses: GravityAnalysis[], maxRisk?: number): GravityAnalysis | null;
    /**
     * Format analysis for display
     */
    static formatAnalysis(a: GravityAnalysis): string;
    /**
     * Get history stats for debugging
     */
    getStats(): {
        protocol: string;
        points: number;
        oldestHours: number;
    }[];
}
