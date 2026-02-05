/**
 * Solana Program Client for Autonomous Yield Oracle
 *
 * Handles all on-chain interactions: initialize, monitor, publish, etc.
 *
 * Built by Turbinete 🚀
 */
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { ProtocolId } from './config.js';
export interface OracleState {
    isInitialized: boolean;
    authority: PublicKey;
    bestProtocol: number;
    currentApyBps: number;
    riskScore: number;
    lastUpdate: bigint;
    totalValueManaged: bigint;
    decisionsCount: bigint;
    cumulativePnl: bigint;
}
export declare class OracleClient {
    private connection;
    private payer;
    constructor(connection: Connection, payer: Keypair);
    /**
     * Derive the oracle PDA address
     */
    static deriveOracleAddress(authority: PublicKey): [PublicKey, number];
    /**
     * Get oracle state from account data
     */
    getOracleState(oracleAddress: PublicKey): Promise<OracleState | null>;
    /**
     * Initialize a new oracle account
     */
    initialize(oracleKeypair: Keypair): Promise<string>;
    /**
     * Update oracle with new yield data
     */
    monitorYields(oracleAddress: PublicKey, protocol: ProtocolId, apyBps: number, riskScore: number): Promise<string>;
    /**
     * Publish strategy recommendation
     */
    publishStrategy(oracleAddress: PublicKey, protocol: ProtocolId, expectedApyBps: number, riskScore: number): Promise<string>;
    /**
     * Execute a swap decision (records decision on-chain)
     */
    executeSwap(oracleAddress: PublicKey, sourceToken: PublicKey, destToken: PublicKey, amountIn: bigint, minAmountOut: bigint, protocol: ProtocolId): Promise<string>;
}
