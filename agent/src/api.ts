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

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { Connection, PublicKey } from '@solana/web3.js';
import { YieldFetcher } from './yields.js';
import { YieldGravity, GravityAnalysis } from './gravity.js';
import { OracleClient } from './client.js';
import { PROTOCOL_NAMES, ProtocolId } from './config.js';

const DEFAULT_PORT = 3747; // "DYOR" on phone keypad 😄

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

export class OracleApi {
  private config: ApiConfig;
  private connection: Connection;
  private fetcher: YieldFetcher;
  private gravity: YieldGravity;
  private server: ReturnType<typeof createServer> | null = null;

  constructor(config: Partial<ApiConfig>) {
    this.config = {
      port: config.port || parseInt(process.env.API_PORT || '') || DEFAULT_PORT,
      enabled: config.enabled ?? (process.env.API_ENABLED === 'true'),
      rpcUrl: config.rpcUrl || process.env.RPC_URL || 'https://api.mainnet-beta.solana.com',
      oracleAddress: config.oracleAddress || process.env.ORACLE_ADDRESS || '',
    };
    
    this.connection = new Connection(this.config.rpcUrl, 'confirmed');
    this.fetcher = new YieldFetcher();
    this.gravity = new YieldGravity();
  }

  /**
   * Start the HTTP server
   */
  async start(): Promise<void> {
    if (!this.config.enabled) {
      console.log('📡 API disabled');
      return;
    }

    this.server = createServer((req, res) => this.handleRequest(req, res));
    
    this.server.listen(this.config.port, () => {
      console.log(`📡 Oracle API running on http://localhost:${this.config.port}`);
      console.log(`   Endpoints:`);
      console.log(`   - GET /health`);
      console.log(`   - GET /yields`);
      console.log(`   - GET /oracle`);
      console.log(`   - GET /portfolio`);
      console.log(`   - GET /signals`);
    });
  }

  /**
   * Stop the server
   */
  stop(): void {
    if (this.server) {
      this.server.close();
      console.log('📡 API stopped');
    }
  }

  /**
   * Handle incoming requests
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://localhost:${this.config.port}`);
    const path = url.pathname;

    try {
      let response: ApiResponse;

      switch (path) {
        case '/':
        case '/health':
          response = await this.handleHealth();
          break;
        case '/yields':
          response = await this.handleYields();
          break;
        case '/oracle':
          response = await this.handleOracle();
          break;
        case '/portfolio':
          response = await this.handlePortfolio();
          break;
        case '/signals':
          response = await this.handleSignals();
          break;
        default:
          response = {
            success: false,
            error: `Unknown endpoint: ${path}`,
            timestamp: Date.now(),
            version: '1.0.0',
          };
          res.writeHead(404);
      }

      if (!res.headersSent) {
        res.writeHead(response.success ? 200 : 500);
      }
      res.end(JSON.stringify(response, null, 2));

    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: String(error),
        timestamp: Date.now(),
        version: '1.0.0',
      };
      res.writeHead(500);
      res.end(JSON.stringify(response, null, 2));
    }
  }

  /**
   * GET /health - Health check
   */
  private async handleHealth(): Promise<ApiResponse> {
    return {
      success: true,
      data: {
        status: 'healthy',
        uptime: process.uptime(),
        oracle: this.config.oracleAddress,
        rpc: this.config.rpcUrl.includes('mainnet') ? 'mainnet' : 'devnet',
        endpoints: ['/health', '/yields', '/oracle', '/portfolio', '/signals'],
      },
      timestamp: Date.now(),
      version: '1.0.0',
    };
  }

  /**
   * GET /yields - Current yields with Gravity analysis
   */
  private async handleYields(): Promise<ApiResponse> {
    const yields = await this.fetcher.fetchAllYields();
    const analyses = this.gravity.analyzeYields(yields);

    const formatted = analyses.map(a => ({
      protocol: PROTOCOL_NAMES[a.protocol],
      protocolId: a.protocol,
      currentApy: (a.currentApyBps / 100).toFixed(2) + '%',
      currentApyBps: a.currentApyBps,
      adjustedApy: (a.adjustedApyBps / 100).toFixed(2) + '%',
      adjustedApyBps: a.adjustedApyBps,
      tvlUsd: a.tvlUsd,
      tvlTrend: a.tvlTrend,
      velocityBpsPerHour: a.velocityBpsPerHour,
      velocityTrend: a.velocityTrend,
      momentum: a.momentum,
      momentumStrength: a.momentumStrength,
      predictedApy: (a.predictedApyBps / 100).toFixed(2) + '%',
      predictedApyBps: a.predictedApyBps,
      confidence: a.confidence,
      gravityScore: a.gravityScore,
      signals: a.signals,
    }));

    // Find best opportunities
    const bestByYield = formatted.reduce((a, b) => 
      a.adjustedApyBps > b.adjustedApyBps ? a : b
    );
    const bestByGravity = formatted.reduce((a, b) => 
      a.gravityScore > b.gravityScore ? a : b
    );

    return {
      success: true,
      data: {
        yields: formatted,
        bestByYield: bestByYield.protocol,
        bestByGravity: bestByGravity.protocol,
        recommendation: bestByGravity.protocol,
        totalProtocols: formatted.length,
      },
      timestamp: Date.now(),
      version: '1.0.0',
    };
  }

  /**
   * GET /oracle - On-chain oracle state
   */
  private async handleOracle(): Promise<ApiResponse> {
    if (!this.config.oracleAddress) {
      return {
        success: false,
        error: 'Oracle address not configured',
        timestamp: Date.now(),
        version: '1.0.0',
      };
    }

    try {
      const oracleKey = new PublicKey(this.config.oracleAddress);
      const accountInfo = await this.connection.getAccountInfo(oracleKey);

      if (!accountInfo) {
        return {
          success: false,
          error: 'Oracle account not found',
          timestamp: Date.now(),
          version: '1.0.0',
        };
      }

      // Parse oracle data (simplified - actual parsing depends on program layout)
      const data = accountInfo.data;
      
      return {
        success: true,
        data: {
          address: this.config.oracleAddress,
          lamports: accountInfo.lamports,
          dataLength: data.length,
          owner: accountInfo.owner.toBase58(),
          executable: accountInfo.executable,
          explorer: `https://solscan.io/account/${this.config.oracleAddress}`,
        },
        timestamp: Date.now(),
        version: '1.0.0',
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to fetch oracle: ${error}`,
        timestamp: Date.now(),
        version: '1.0.0',
      };
    }
  }

  /**
   * GET /portfolio - Current agent positions
   */
  private async handlePortfolio(): Promise<ApiResponse> {
    try {
      // Read trader state
      const { readFileSync, existsSync } = await import('fs');
      const statePath = '/Users/molhemolinho/clawd/projects/autonomous-yield-oracle/agent/trader-state.json';
      
      if (!existsSync(statePath)) {
        return {
          success: true,
          data: {
            positions: [],
            tradesExecuted: 0,
            message: 'No trading state found',
          },
          timestamp: Date.now(),
          version: '1.0.0',
        };
      }

      const state = JSON.parse(readFileSync(statePath, 'utf-8'));
      
      return {
        success: true,
        data: {
          currentPosition: state.currentPosition ? {
            token: state.currentPosition.token,
            amount: (Number(state.currentPosition.amount) / 1e9).toFixed(6),
            entryTime: new Date(state.currentPosition.entryTime).toISOString(),
            protocol: PROTOCOL_NAMES[state.currentPosition.protocol as ProtocolId],
          } : null,
          tradesExecuted: state.tradesExecuted,
          lastTradeTime: state.lastTradeTime ? new Date(state.lastTradeTime).toISOString() : null,
          totalPnl: (Number(state.totalPnlLamports || 0) / 1e9).toFixed(4) + ' SOL',
          history: state.history?.slice(-5).map((h: any) => ({
            action: h.action,
            from: h.fromToken,
            to: h.toToken,
            amount: (Number(h.amountIn) / 1e9).toFixed(4),
            reason: h.reason,
            time: new Date(h.timestamp).toISOString(),
          })),
        },
        timestamp: Date.now(),
        version: '1.0.0',
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to fetch portfolio: ${error}`,
        timestamp: Date.now(),
        version: '1.0.0',
      };
    }
  }

  /**
   * GET /signals - Active trading signals
   */
  private async handleSignals(): Promise<ApiResponse> {
    const yields = await this.fetcher.fetchAllYields();
    const analyses = this.gravity.analyzeYields(yields);

    // Collect all active signals
    const activeSignals: {
      protocol: string;
      type: string;
      message: string;
      impact: number;
      timestamp: number;
    }[] = [];

    for (const analysis of analyses) {
      for (const signal of analysis.signals) {
        activeSignals.push({
          protocol: PROTOCOL_NAMES[analysis.protocol],
          type: signal.type,
          message: signal.message,
          impact: signal.impact,
          timestamp: Date.now(),
        });
      }
    }

    // Sort by absolute impact
    activeSignals.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

    return {
      success: true,
      data: {
        signals: activeSignals,
        totalSignals: activeSignals.length,
        strongSignals: activeSignals.filter(s => Math.abs(s.impact) >= 30).length,
        recommendation: activeSignals.length > 0 
          ? `${activeSignals[0].protocol}: ${activeSignals[0].message}`
          : 'No significant signals',
      },
      timestamp: Date.now(),
      version: '1.0.0',
    };
  }
}

// Standalone server mode
if (process.argv[1]?.includes('api')) {
  const api = new OracleApi({ enabled: true });
  api.start();
}
