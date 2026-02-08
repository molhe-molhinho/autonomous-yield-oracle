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
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { PROTOCOL_NAMES } from './config.js';
// History file path
const HISTORY_FILE = '/Users/molhemolinho/clawd/projects/autonomous-yield-oracle/agent/yield-history.json';
// Configuration
const MAX_HISTORY_POINTS = 288; // 24 hours at 5-minute intervals
const MIN_POINTS_FOR_PREDICTION = 6; // Need at least 30 min of data
const VELOCITY_WINDOW = 6; // Last 30 minutes for velocity calc
const MOMENTUM_THRESHOLD_BPS = 20; // 0.2% change = significant momentum
export class YieldGravity {
    history = new Map();
    lastSave = 0;
    saveCooldownMs = 60_000; // Save at most every minute
    constructor() {
        this.loadHistory();
    }
    /**
     * Load historical data from disk
     */
    loadHistory() {
        if (!existsSync(HISTORY_FILE)) {
            console.log('📊 Yield Gravity: Starting fresh history');
            return;
        }
        try {
            const data = JSON.parse(readFileSync(HISTORY_FILE, 'utf-8'));
            // Organize by protocol
            for (const snapshot of data.snapshots) {
                if (!this.history.has(snapshot.protocol)) {
                    this.history.set(snapshot.protocol, []);
                }
                this.history.get(snapshot.protocol).push(snapshot);
            }
            // Sort by timestamp
            for (const [protocol, snapshots] of this.history) {
                snapshots.sort((a, b) => a.timestamp - b.timestamp);
                // Trim to max length
                if (snapshots.length > MAX_HISTORY_POINTS) {
                    this.history.set(protocol, snapshots.slice(-MAX_HISTORY_POINTS));
                }
            }
            const totalPoints = Array.from(this.history.values()).reduce((sum, arr) => sum + arr.length, 0);
            console.log(`📊 Yield Gravity: Loaded ${totalPoints} historical data points`);
        }
        catch (error) {
            console.warn('⚠️ Could not load yield history:', error);
        }
    }
    /**
     * Save history to disk
     */
    saveHistory() {
        const now = Date.now();
        if (now - this.lastSave < this.saveCooldownMs)
            return;
        try {
            const allSnapshots = [];
            for (const snapshots of this.history.values()) {
                allSnapshots.push(...snapshots);
            }
            const data = {
                snapshots: allSnapshots,
                lastUpdated: now,
            };
            writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2));
            this.lastSave = now;
        }
        catch (error) {
            console.warn('⚠️ Could not save yield history:', error);
        }
    }
    /**
     * Record current yields to history
     */
    recordYields(yields) {
        const timestamp = Math.floor(Date.now() / 1000);
        for (const y of yields) {
            if (!this.history.has(y.protocol)) {
                this.history.set(y.protocol, []);
            }
            const snapshots = this.history.get(y.protocol);
            // Don't record duplicate timestamps
            if (snapshots.length > 0 && snapshots[snapshots.length - 1].timestamp === timestamp) {
                continue;
            }
            snapshots.push({
                timestamp,
                protocol: y.protocol,
                apyBps: y.apyBps,
                adjustedApyBps: y.adjustedApyBps,
                tvl: y.tvlUsd, // Track TVL for TVL Gravity!
            });
            // Trim old data
            if (snapshots.length > MAX_HISTORY_POINTS) {
                snapshots.shift();
            }
        }
        this.saveHistory();
    }
    /**
     * Analyze yields with Yield Gravity™
     */
    analyzeYields(yields) {
        // First record the new data
        this.recordYields(yields);
        // Then analyze each protocol
        return yields.map(y => this.analyzeProtocol(y));
    }
    /**
     * Deep analysis of a single protocol
     */
    analyzeProtocol(current) {
        const snapshots = this.history.get(current.protocol) || [];
        const signals = [];
        // Calculate velocity (rate of change)
        const velocity = this.calculateVelocity(snapshots);
        const velocityTrend = velocity > MOMENTUM_THRESHOLD_BPS ? 'rising'
            : velocity < -MOMENTUM_THRESHOLD_BPS ? 'falling'
                : 'stable';
        // Calculate momentum
        const momentum = this.calculateMomentum(snapshots);
        const momentumStrength = Math.abs(momentum) > 0.6 ? 'strong'
            : Math.abs(momentum) > 0.3 ? 'moderate'
                : 'weak';
        // Generate signals
        if (velocityTrend === 'rising' && momentumStrength !== 'weak') {
            signals.push({
                type: 'momentum',
                message: `🚀 Strong upward momentum (+${velocity.toFixed(0)}bps/hr)`,
                impact: Math.min(50, velocity / 2), // Cap at 50bps boost
            });
        }
        else if (velocityTrend === 'falling' && momentumStrength !== 'weak') {
            signals.push({
                type: 'warning',
                message: `⚠️ Yields declining (${velocity.toFixed(0)}bps/hr)`,
                impact: Math.max(-50, velocity / 2), // Cap at 50bps penalty
            });
        }
        // Mean reversion signal
        const meanReversion = this.detectMeanReversion(snapshots, current.apyBps);
        if (meanReversion) {
            signals.push(meanReversion);
        }
        // Breakout detection
        const breakout = this.detectBreakout(snapshots, current.apyBps);
        if (breakout) {
            signals.push(breakout);
        }
        // TVL Gravity Analysis (NEW!)
        const tvlAnalysis = this.analyzeTvl(snapshots, current.tvlUsd);
        if (tvlAnalysis.signal) {
            signals.push(tvlAnalysis.signal);
        }
        // Calculate prediction
        const { predictedApy, confidence } = this.predictYield(snapshots, current, velocity, momentum);
        // Calculate gravity score (now includes TVL impact)
        const signalImpact = signals.reduce((sum, s) => sum + s.impact, 0);
        const gravityScore = current.adjustedApyBps + signalImpact + (momentum * 20);
        return {
            protocol: current.protocol,
            protocolName: current.protocolName,
            currentApyBps: current.apyBps,
            adjustedApyBps: current.adjustedApyBps,
            velocityBpsPerHour: velocity,
            velocityTrend,
            momentum,
            momentumStrength,
            tvlUsd: current.tvlUsd,
            tvlVelocityPerHour: tvlAnalysis.velocityPerHour,
            tvlTrend: tvlAnalysis.trend,
            predictedApyBps: predictedApy,
            predictedAdjustedBps: Math.round(predictedApy * (100 - current.riskScore) / 100),
            confidence,
            signals,
            gravityScore,
        };
    }
    /**
     * Calculate velocity (bps change per hour)
     */
    calculateVelocity(snapshots) {
        if (snapshots.length < 2)
            return 0;
        const recent = snapshots.slice(-VELOCITY_WINDOW);
        if (recent.length < 2)
            return 0;
        const first = recent[0];
        const last = recent[recent.length - 1];
        const timeDeltaHours = (last.timestamp - first.timestamp) / 3600;
        if (timeDeltaHours < 0.1)
            return 0; // Need at least 6 minutes
        return (last.apyBps - first.apyBps) / timeDeltaHours;
    }
    /**
     * Calculate momentum (-1 to 1 scale)
     * Positive = bullish, Negative = bearish
     */
    calculateMomentum(snapshots) {
        if (snapshots.length < MIN_POINTS_FOR_PREDICTION)
            return 0;
        const recent = snapshots.slice(-12); // Last hour
        let upMoves = 0;
        let downMoves = 0;
        for (let i = 1; i < recent.length; i++) {
            const delta = recent[i].apyBps - recent[i - 1].apyBps;
            if (delta > 0)
                upMoves++;
            else if (delta < 0)
                downMoves++;
        }
        const totalMoves = upMoves + downMoves;
        if (totalMoves === 0)
            return 0;
        return (upMoves - downMoves) / totalMoves;
    }
    /**
     * TVL Gravity - Analyze TVL trends to predict yield compression
     *
     * Key insight: When TVL rapidly increases, yields tend to compress.
     * We want to EXIT before the crowd arrives, not after.
     */
    analyzeTvl(snapshots, currentTvl) {
        // Need TVL data and history
        const tvlSnapshots = snapshots.filter(s => s.tvl !== undefined && s.tvl > 0);
        if (tvlSnapshots.length < 2 || !currentTvl) {
            return { signal: null };
        }
        // Calculate TVL velocity (change per hour)
        const recent = tvlSnapshots.slice(-VELOCITY_WINDOW);
        if (recent.length < 2) {
            return { velocityPerHour: 0, trend: 'stable', signal: null };
        }
        const first = recent[0];
        const last = recent[recent.length - 1];
        const timeDeltaHours = (last.timestamp - first.timestamp) / 3600;
        if (timeDeltaHours < 0.1) {
            return { velocityPerHour: 0, trend: 'stable', signal: null };
        }
        const tvlChange = (last.tvl - first.tvl);
        const velocityPerHour = tvlChange / timeDeltaHours;
        const changePercent = (tvlChange / first.tvl) * 100;
        // Determine trend
        const trend = changePercent > 2 ? 'inflow' :
            changePercent < -2 ? 'outflow' :
                'stable';
        // Generate signals based on TVL movement
        let signal = null;
        // Large inflow = yield compression coming (NEGATIVE signal)
        if (changePercent > 5) {
            signal = {
                type: 'tvl_compression',
                message: `💰 TVL surging +${changePercent.toFixed(1)}% - yield compression likely`,
                impact: Math.max(-40, -changePercent * 3), // Penalize heavily
            };
        }
        // Large outflow = yield expansion coming (POSITIVE signal)
        else if (changePercent < -5) {
            signal = {
                type: 'tvl_compression',
                message: `📤 TVL dropping ${changePercent.toFixed(1)}% - yield expansion likely`,
                impact: Math.min(40, Math.abs(changePercent) * 3), // Boost score
            };
        }
        // Moderate inflow warning
        else if (changePercent > 2) {
            signal = {
                type: 'warning',
                message: `📊 TVL growing +${changePercent.toFixed(1)}%/hr - watch for compression`,
                impact: -10,
            };
        }
        return { velocityPerHour, trend, signal };
    }
    /**
     * Detect mean reversion opportunity
     */
    detectMeanReversion(snapshots, currentApy) {
        if (snapshots.length < MIN_POINTS_FOR_PREDICTION * 2)
            return null;
        // Calculate mean over last 2 hours
        const mean = snapshots.slice(-24).reduce((sum, s) => sum + s.apyBps, 0) / Math.min(24, snapshots.length);
        const deviation = currentApy - mean;
        const deviationPercent = Math.abs(deviation) / mean * 100;
        // If >10% below mean, expect reversion up
        if (deviationPercent > 10 && deviation < 0) {
            return {
                type: 'mean_reversion',
                message: `📈 Below average (${deviationPercent.toFixed(1)}%), expect reversion`,
                impact: Math.min(30, deviationPercent * 2),
            };
        }
        // If >10% above mean, expect reversion down
        if (deviationPercent > 10 && deviation > 0) {
            return {
                type: 'mean_reversion',
                message: `📉 Above average (${deviationPercent.toFixed(1)}%), may compress`,
                impact: Math.max(-30, -deviationPercent * 2),
            };
        }
        return null;
    }
    /**
     * Detect yield breakouts
     */
    detectBreakout(snapshots, currentApy) {
        if (snapshots.length < MIN_POINTS_FOR_PREDICTION * 2)
            return null;
        const recent = snapshots.slice(-24); // Last 2 hours
        const max = Math.max(...recent.map(s => s.apyBps));
        const min = Math.min(...recent.map(s => s.apyBps));
        // Breakout above recent high
        if (currentApy > max * 1.05) {
            return {
                type: 'breakout',
                message: `🔥 Breakout! New high above ${(max / 100).toFixed(2)}%`,
                impact: 40,
            };
        }
        // Breakdown below recent low
        if (currentApy < min * 0.95) {
            return {
                type: 'warning',
                message: `⚠️ Breakdown below ${(min / 100).toFixed(2)}%`,
                impact: -40,
            };
        }
        return null;
    }
    /**
     * Predict yield 1 hour from now
     */
    predictYield(snapshots, current, velocity, momentum) {
        if (snapshots.length < MIN_POINTS_FOR_PREDICTION) {
            return { predictedApy: current.apyBps, confidence: 0 };
        }
        // Base prediction: current + velocity * time
        let predicted = current.apyBps + velocity;
        // Apply momentum dampening (mean reversion tendency)
        const meanReversion = 0.3; // 30% pull toward mean
        const mean = snapshots.slice(-24).reduce((sum, s) => sum + s.apyBps, 0) / Math.min(24, snapshots.length);
        predicted = predicted * (1 - meanReversion) + mean * meanReversion;
        // Confidence based on data quality
        const dataPoints = snapshots.length;
        const consistentDirection = Math.abs(momentum) > 0.5;
        let confidence = Math.min(0.9, dataPoints / MAX_HISTORY_POINTS);
        if (!consistentDirection)
            confidence *= 0.7;
        return {
            predictedApy: Math.round(predicted),
            confidence,
        };
    }
    /**
     * Get best opportunity based on Gravity Score
     */
    getBestByGravity(analyses, maxRisk = 70) {
        // Filter by swappable protocols (for now just filter by having data)
        const eligible = analyses.filter(a => a.confidence > 0.1);
        if (eligible.length === 0)
            return analyses[0] || null;
        return eligible.reduce((best, current) => current.gravityScore > best.gravityScore ? current : best);
    }
    /**
     * Format analysis for display
     */
    static formatAnalysis(a) {
        const trend = a.velocityTrend === 'rising' ? '📈'
            : a.velocityTrend === 'falling' ? '📉'
                : '➡️';
        // Format TVL if available
        const tvlStr = a.tvlUsd
            ? ` | TVL: $${(a.tvlUsd / 1_000_000).toFixed(1)}M${a.tvlTrend === 'inflow' ? '⬆️' : a.tvlTrend === 'outflow' ? '⬇️' : ''}`
            : '';
        return `${a.protocolName}: ${(a.currentApyBps / 100).toFixed(2)}% ${trend} ` +
            `| Gravity: ${a.gravityScore.toFixed(0)}${tvlStr} | ` +
            `Predict: ${(a.predictedApyBps / 100).toFixed(2)}% (${(a.confidence * 100).toFixed(0)}% conf)`;
    }
    /**
     * Get history stats for debugging
     */
    getStats() {
        return Array.from(this.history.entries()).map(([protocol, snapshots]) => ({
            protocol: PROTOCOL_NAMES[protocol] || `Protocol ${protocol}`,
            points: snapshots.length,
            oldestHours: snapshots.length > 0
                ? (Date.now() / 1000 - snapshots[0].timestamp) / 3600
                : 0,
        }));
    }
}
