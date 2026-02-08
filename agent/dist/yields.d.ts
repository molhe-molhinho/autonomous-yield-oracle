/**
 * Yield Fetcher - Gets real APY data from DeFi protocols
 *
 * Uses DeFiLlama for reliable yield data across Solana protocols.
 *
 * Built by Turbinete 🚀
 */
import { ProtocolId } from './config.js';
export interface YieldData {
    protocol: ProtocolId;
    protocolName: string;
    apyBps: number;
    riskScore: number;
    adjustedApyBps: number;
    pool?: string;
    timestamp: number;
    tvlUsd?: number;
}
export declare class YieldFetcher {
    private cache;
    private lastFetch;
    private cacheDurationMs;
    /**
     * Fetch yields from all supported protocols via DeFiLlama
     */
    fetchAllYields(): Promise<YieldData[]>;
    /**
     * Convert DeFiLlama pool to YieldData
     */
    private poolToYield;
    /**
     * Get the best yield opportunity (risk-adjusted)
     */
    getBestYield(maxRisk?: number): Promise<YieldData | null>;
    /**
     * Get simulated yields for demo/fallback
     */
    private getSimulatedYields;
    /**
     * Format yield for display
     */
    static formatYield(y: YieldData): string;
}
