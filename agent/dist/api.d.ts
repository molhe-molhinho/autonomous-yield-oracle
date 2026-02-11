/**
 * Oracle HTTP API - Query yield predictions via REST
 *
 * Endpoints:
 * - GET /health - Health check
 * - GET /yields - Current yields with Gravity analysis
 * - GET /oracle - On-chain oracle state
 * - GET /portfolio - Current positions
 * - GET /signals - Active trading signals
 *
 * Built by Turbinete 🚀 for the Colosseum Agent Hackathon 2026
 */
export interface ApiConfig {
    port: number;
    enabled: boolean;
    rpcUrl: string;
    oracleAddress: string;
}
export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    timestamp: number;
    version: string;
}
export declare class OracleApi {
    private config;
    private connection;
    private fetcher;
    private gravity;
    private server;
    constructor(config: Partial<ApiConfig>);
    /**
     * Start the HTTP server
     */
    start(): Promise<void>;
    /**
     * Stop the server
     */
    stop(): void;
    /**
     * Handle incoming requests
     */
    private handleRequest;
    /**
     * GET /health - Health check
     */
    private handleHealth;
    /**
     * GET /yields - Current yields with Gravity analysis
     */
    private handleYields;
    /**
     * GET /oracle - On-chain oracle state
     */
    private handleOracle;
    /**
     * GET /portfolio - Current agent positions
     */
    private handlePortfolio;
    /**
     * GET /signals - Active trading signals
     */
    private handleSignals;
}
