/**
 * Yield Fetcher - Gets real APY data from DeFi protocols
 *
 * Uses DeFiLlama for reliable yield data across Solana protocols.
 *
 * Built by Turbinete 🚀
 */
import { PROTOCOL, PROTOCOL_NAMES } from './config.js';
const DEFILLAMA_YIELDS = 'https://yields.llama.fi/pools';
export class YieldFetcher {
    cache = new Map();
    lastFetch = 0;
    cacheDurationMs = 30_000; // 30 seconds
    /**
     * Fetch yields from all supported protocols via DeFiLlama
     */
    async fetchAllYields() {
        const now = Date.now();
        // Return cache if fresh
        if (now - this.lastFetch < this.cacheDurationMs && this.cache.size > 0) {
            return Array.from(this.cache.values());
        }
        try {
            const response = await fetch(DEFILLAMA_YIELDS, {
                headers: { 'User-Agent': 'AutonomousYieldOracle/1.0' }
            });
            if (!response.ok) {
                console.warn(`⚠️ DeFiLlama API returned ${response.status}, using simulated data`);
                return this.getSimulatedYields();
            }
            const data = await response.json();
            const pools = data.data || [];
            // Filter for Solana protocols we care about
            const yields = [];
            // Find Marinade mSOL
            const marinade = pools.find((p) => p.chain === 'Solana' &&
                p.project === 'marinade-finance' &&
                p.symbol?.includes('mSOL'));
            if (marinade && marinade.apy > 0) {
                yields.push(this.poolToYield(marinade, PROTOCOL.MARINADE, 15));
            }
            // Find Jito jitoSOL
            const jito = pools.find((p) => p.chain === 'Solana' &&
                p.project === 'jito' &&
                p.symbol?.includes('jitoSOL'));
            if (jito && jito.apy > 0) {
                yields.push(this.poolToYield(jito, PROTOCOL.JITO, 18));
            }
            // Find Raydium pools
            const raydium = pools
                .filter((p) => p.chain === 'Solana' &&
                p.project === 'raydium' &&
                p.apy > 0)
                .sort((a, b) => b.apy - a.apy)
                .slice(0, 3);
            for (const pool of raydium) {
                yields.push(this.poolToYield(pool, PROTOCOL.RAYDIUM_CPMM, 35));
            }
            // Find Kamino pools
            const kamino = pools
                .filter((p) => p.chain === 'Solana' &&
                p.project === 'kamino' &&
                p.apy > 0)
                .sort((a, b) => b.apy - a.apy)
                .slice(0, 2);
            for (const pool of kamino) {
                yields.push(this.poolToYield(pool, PROTOCOL.KAMINO, 30));
            }
            // Use simulated if nothing found
            if (yields.length === 0) {
                console.warn('⚠️ No Solana yields found in DeFiLlama, using simulated data');
                return this.getSimulatedYields();
            }
            // Update cache
            for (const y of yields) {
                this.cache.set(y.protocol, y);
            }
            this.lastFetch = now;
            return yields;
        }
        catch (error) {
            console.warn('⚠️ Failed to fetch DeFiLlama yields:', error);
            return this.getSimulatedYields();
        }
    }
    /**
     * Convert DeFiLlama pool to YieldData
     */
    poolToYield(pool, protocol, riskScore) {
        const apyBps = Math.round(pool.apy * 100); // Convert % to bps
        return {
            protocol,
            protocolName: PROTOCOL_NAMES[protocol],
            apyBps,
            riskScore,
            adjustedApyBps: Math.round(apyBps * (100 - riskScore) / 100),
            pool: pool.symbol || pool.pool || 'Unknown',
            timestamp: Math.floor(Date.now() / 1000),
            tvlUsd: pool.tvlUsd || undefined, // TVL from DeFiLlama for TVL Gravity
        };
    }
    /**
     * Get the best yield opportunity (risk-adjusted)
     */
    async getBestYield(maxRisk = 70) {
        const yields = await this.fetchAllYields();
        // Filter by risk and find best adjusted yield
        const eligible = yields.filter(y => y.riskScore <= maxRisk);
        if (eligible.length === 0)
            return null;
        return eligible.reduce((best, current) => current.adjustedApyBps > best.adjustedApyBps ? current : best);
    }
    /**
     * Get simulated yields for demo/fallback
     */
    getSimulatedYields() {
        const timestamp = Math.floor(Date.now() / 1000);
        return [
            {
                protocol: PROTOCOL.MARINADE,
                protocolName: PROTOCOL_NAMES[PROTOCOL.MARINADE],
                apyBps: 680 + Math.round(Math.random() * 40 - 20), // ~6.6-7.0%
                riskScore: 15,
                adjustedApyBps: 0, // Will be calculated
                pool: 'mSOL',
                timestamp,
                tvlUsd: 850_000_000 + Math.round(Math.random() * 50_000_000), // ~$850M
            },
            {
                protocol: PROTOCOL.JITO,
                protocolName: PROTOCOL_NAMES[PROTOCOL.JITO],
                apyBps: 760 + Math.round(Math.random() * 60 - 30), // ~7.3-7.9%
                riskScore: 18,
                adjustedApyBps: 0,
                pool: 'jitoSOL',
                timestamp,
                tvlUsd: 1_200_000_000 + Math.round(Math.random() * 100_000_000), // ~$1.2B
            },
            {
                protocol: PROTOCOL.RAYDIUM_CPMM,
                protocolName: PROTOCOL_NAMES[PROTOCOL.RAYDIUM_CPMM],
                apyBps: 1500 + Math.round(Math.random() * 200 - 100), // ~14-16%
                riskScore: 35,
                adjustedApyBps: 0,
                pool: 'SOL-USDC',
                timestamp,
                tvlUsd: 45_000_000 + Math.round(Math.random() * 10_000_000), // ~$45M
            },
            {
                protocol: PROTOCOL.KAMINO,
                protocolName: PROTOCOL_NAMES[PROTOCOL.KAMINO],
                apyBps: 1200 + Math.round(Math.random() * 150 - 75), // ~11-13.5%
                riskScore: 30,
                adjustedApyBps: 0,
                pool: 'SOL-USDC',
                timestamp,
                tvlUsd: 180_000_000 + Math.round(Math.random() * 20_000_000), // ~$180M
            },
        ].map(y => ({
            ...y,
            adjustedApyBps: Math.round(y.apyBps * (100 - y.riskScore) / 100),
        }));
    }
    /**
     * Format yield for display
     */
    static formatYield(y) {
        const apy = (y.apyBps / 100).toFixed(2);
        const adjusted = (y.adjustedApyBps / 100).toFixed(2);
        return `${y.protocolName} (${y.pool}): ${apy}% APY | Risk: ${y.riskScore} | Adjusted: ${adjusted}%`;
    }
}
