/**
 * Autonomous Trader
 *
 * Makes REAL trades based on yield optimization decisions.
 * This is the "Most Agentic" component - actual fund management!
 *
 * Built by Turbinete 🚀
 */
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { ProtocolId } from './config.js';
interface Position {
    token: string;
    mint: string;
    amount: bigint;
    entryPrice: number;
    entryTime: number;
    protocol: ProtocolId;
}
interface TradeRecord {
    timestamp: number;
    action: 'enter' | 'exit' | 'rebalance';
    fromToken: string;
    toToken: string;
    amountIn: bigint;
    amountOut: bigint;
    signature: string;
    reason: string;
}
export declare class AutonomousTrader {
    private connection;
    private payer;
    private jupiter;
    private oracleClient;
    private fetcher;
    private state;
    private oracleAddress;
    private minRebalanceImprovement;
    private maxPositionSol;
    private minHoldTimeMs;
    constructor(connection: Connection, payer: Keypair, oracleAddress: PublicKey);
    /**
     * Load trader state from disk
     */
    private loadState;
    /**
     * Save trader state to disk
     */
    private saveState;
    /**
     * Main trading loop - analyze and potentially trade
     */
    analyzAndTrade(): Promise<void>;
    /**
     * Evaluate whether to enter a new position
     */
    private evaluateEntry;
    /**
     * Evaluate whether to rebalance current position
     */
    private evaluateRebalance;
    /**
     * Record decision on-chain for transparency
     */
    private recordDecision;
    /**
     * Get current trading stats
     */
    getStats(): {
        position: Position | null;
        totalPnl: number;
        tradesExecuted: number;
        history: TradeRecord[];
    };
}
export {};
