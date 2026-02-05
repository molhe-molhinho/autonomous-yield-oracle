/**
 * Configuration for the Autonomous Yield Oracle Agent
 *
 * Built by Turbinete 🚀 for the Colosseum Agent Hackathon 2026
 */
import { PublicKey, Cluster } from '@solana/web3.js';
export declare const PROGRAM_ID: PublicKey;
export declare const PROTOCOL: {
    readonly RAYDIUM_CPMM: 0;
    readonly JUPITER_ROUTE: 1;
    readonly KAMINO: 2;
    readonly MARINADE: 3;
    readonly JITO: 4;
};
export type ProtocolId = typeof PROTOCOL[keyof typeof PROTOCOL];
export declare const PROTOCOL_NAMES: Record<ProtocolId, string>;
export declare const DISCRIMINATOR: {
    readonly INITIALIZE: 0;
    readonly MONITOR_YIELDS: 1;
    readonly EXECUTE_SWAP: 2;
    readonly REBALANCE: 3;
    readonly PUBLISH_STRATEGY: 4;
    readonly EMERGENCY_WITHDRAW: 5;
};
export declare const ORACLE_STATE_SIZE = 69;
export declare const DEFAULT_CONFIG: {
    cluster: Cluster;
    rpcUrl: string;
    monitorIntervalMs: number;
    minYieldDifferenceBps: number;
    maxRiskScore: number;
    logLevel: "debug" | "info" | "warn" | "error";
};
export declare const API_ENDPOINTS: {
    RAYDIUM_POOLS: string;
    RAYDIUM_AMMV4: string;
    JUPITER_QUOTE: string;
    JUPITER_PRICE: string;
    JITO_STATS: string;
    MARINADE_STATS: string;
};
export declare const TOKENS: {
    SOL: PublicKey;
    USDC: PublicKey;
    USDT: PublicKey;
    mSOL: PublicKey;
    jitoSOL: PublicKey;
};
