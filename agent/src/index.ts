/**
 * Autonomous Yield Oracle Agent
 * 
 * 24/7 yield monitoring and optimization for Solana DeFi.
 * Monitors yields across protocols and records decisions on-chain.
 * 
 * Built by Turbinete 🚀 for the Colosseum Agent Hackathon 2026
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { config } from 'dotenv';
import { readFileSync, existsSync } from 'fs';
import { OracleClient, OracleState } from './client.js';
import { YieldFetcher, YieldData } from './yields.js';
import { DEFAULT_CONFIG, PROTOCOL_NAMES, PROGRAM_ID, ProtocolId } from './config.js';

// Load environment
config();

// ASCII Art Banner
const BANNER = `
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║     🚀 AUTONOMOUS YIELD ORACLE 🚀                                 ║
║                                                                   ║
║     24/7 AI-Powered Yield Optimization                            ║
║     Built by Turbinete for Colosseum Hackathon 2026              ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
`;

interface AgentConfig {
  keypairPath: string;
  oracleAddress?: string;
  rpcUrl: string;
  monitorIntervalMs: number;
  maxRiskScore: number;
  minYieldDifferenceBps: number;
}

class YieldOracleAgent {
  private connection: Connection;
  private payer: Keypair;
  private client: OracleClient;
  private fetcher: YieldFetcher;
  private oracleAddress: PublicKey | null = null;
  private config: AgentConfig;
  private isRunning: boolean = false;
  private decisionsCount: number = 0;

  constructor(agentConfig: AgentConfig) {
    this.config = agentConfig;
    this.connection = new Connection(agentConfig.rpcUrl, 'confirmed');
    
    // Load keypair
    const keypairData = JSON.parse(readFileSync(agentConfig.keypairPath, 'utf-8'));
    this.payer = Keypair.fromSecretKey(Uint8Array.from(keypairData));
    
    this.client = new OracleClient(this.connection, this.payer);
    this.fetcher = new YieldFetcher();

    if (agentConfig.oracleAddress) {
      this.oracleAddress = new PublicKey(agentConfig.oracleAddress);
    }
  }

  /**
   * Initialize the agent - create oracle if needed
   */
  async initialize(): Promise<void> {
    console.log(BANNER);
    console.log(`🔑 Authority: ${this.payer.publicKey.toBase58()}`);
    console.log(`📡 RPC: ${this.config.rpcUrl}`);
    console.log(`📋 Program: ${PROGRAM_ID.toBase58()}`);
    
    const balance = await this.connection.getBalance(this.payer.publicKey);
    console.log(`💰 Balance: ${(balance / 1e9).toFixed(4)} SOL\n`);

    // Check if oracle exists
    if (this.oracleAddress) {
      const state = await this.client.getOracleState(this.oracleAddress);
      if (state && state.isInitialized) {
        console.log(`✅ Oracle found: ${this.oracleAddress.toBase58()}`);
        this.logOracleState(state);
        return;
      }
    }

    // Create new oracle
    console.log('📝 Creating new oracle account...');
    const oracleKeypair = Keypair.generate();
    await this.client.initialize(oracleKeypair);
    this.oracleAddress = oracleKeypair.publicKey;
    console.log(`✅ Oracle created: ${this.oracleAddress.toBase58()}\n`);
  }

  /**
   * Run the main monitoring loop
   */
  async run(): Promise<void> {
    if (!this.oracleAddress) {
      throw new Error('Oracle not initialized. Call initialize() first.');
    }

    this.isRunning = true;
    console.log('🚀 Starting yield monitoring loop...');
    console.log(`⏱️  Interval: ${this.config.monitorIntervalMs / 1000}s`);
    console.log(`📊 Max Risk: ${this.config.maxRiskScore}`);
    console.log(`📈 Min Improvement: ${this.config.minYieldDifferenceBps / 100}%\n`);

    while (this.isRunning) {
      try {
        await this.monitorAndUpdate();
      } catch (error) {
        console.error('❌ Error in monitoring loop:', error);
      }

      await this.sleep(this.config.monitorIntervalMs);
    }
  }

  /**
   * Single monitoring iteration
   */
  async monitorAndUpdate(): Promise<void> {
    const timestamp = new Date().toISOString();
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📊 Yield Check @ ${timestamp}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // Fetch current yields
    const yields = await this.fetcher.fetchAllYields();
    console.log(`\n📈 Current Yields (${yields.length} protocols):`);
    for (const y of yields) {
      console.log(`   ${YieldFetcher.formatYield(y)}`);
    }

    // Get best yield
    const best = await this.fetcher.getBestYield(this.config.maxRiskScore);
    if (!best) {
      console.log('\n⚠️ No eligible yields found within risk tolerance');
      return;
    }

    console.log(`\n🏆 Best Opportunity: ${YieldFetcher.formatYield(best)}`);

    // Get current oracle state
    const state = await this.client.getOracleState(this.oracleAddress!);
    if (!state) {
      console.log('❌ Could not fetch oracle state');
      return;
    }

    // Calculate if update is needed
    const currentAdjusted = Math.round(
      state.currentApyBps * (100 - state.riskScore) / 100
    );
    const improvement = best.adjustedApyBps - currentAdjusted;
    const isStale = Date.now() / 1000 - Number(state.lastUpdate) > 3600;

    console.log(`\n📋 Oracle State:`);
    console.log(`   Current: ${PROTOCOL_NAMES[state.bestProtocol as ProtocolId]} @ ${(state.currentApyBps / 100).toFixed(2)}% (adjusted: ${(currentAdjusted / 100).toFixed(2)}%)`);
    console.log(`   Decisions: ${state.decisionsCount}`);
    console.log(`   Stale: ${isStale ? 'Yes (>1hr)' : 'No'}`);
    console.log(`   Improvement: ${improvement > 0 ? '+' : ''}${(improvement / 100).toFixed(2)}%`);

    // Decide whether to update
    const shouldUpdate = improvement >= this.config.minYieldDifferenceBps || isStale;

    if (shouldUpdate) {
      console.log(`\n🔄 Updating oracle...`);
      const sig = await this.client.monitorYields(
        this.oracleAddress!,
        best.protocol,
        best.apyBps,
        best.riskScore
      );
      this.decisionsCount++;
      console.log(`✅ Update TX: ${sig}`);
      console.log(`   Reason: ${isStale ? 'Stale data refresh' : 'Better yield found'}`);
    } else {
      console.log(`\n✓ No update needed (improvement below threshold)`);
    }
  }

  /**
   * Stop the agent
   */
  stop(): void {
    console.log('\n🛑 Stopping agent...');
    this.isRunning = false;
  }

  /**
   * Log oracle state
   */
  private logOracleState(state: OracleState): void {
    console.log(`   Protocol: ${PROTOCOL_NAMES[state.bestProtocol as ProtocolId]}`);
    console.log(`   APY: ${(state.currentApyBps / 100).toFixed(2)}%`);
    console.log(`   Risk: ${state.riskScore}`);
    console.log(`   Decisions: ${state.decisionsCount}`);
    console.log(`   Last Update: ${new Date(Number(state.lastUpdate) * 1000).toISOString()}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Main entry point
async function main() {
  const keypairPath = process.env.KEYPAIR_PATH || 
    `${process.env.HOME}/.config/solana/turbinete-wallet.json`;
  
  if (!existsSync(keypairPath)) {
    console.error(`❌ Keypair not found: ${keypairPath}`);
    console.error('Set KEYPAIR_PATH environment variable or use default location.');
    process.exit(1);
  }

  const config: AgentConfig = {
    keypairPath,
    oracleAddress: process.env.ORACLE_ADDRESS,
    rpcUrl: process.env.RPC_URL || DEFAULT_CONFIG.rpcUrl,
    monitorIntervalMs: parseInt(process.env.MONITOR_INTERVAL_MS || '') || DEFAULT_CONFIG.monitorIntervalMs,
    maxRiskScore: parseInt(process.env.MAX_RISK_SCORE || '') || DEFAULT_CONFIG.maxRiskScore,
    minYieldDifferenceBps: parseInt(process.env.MIN_YIELD_DIFF_BPS || '') || DEFAULT_CONFIG.minYieldDifferenceBps,
  };

  const agent = new YieldOracleAgent(config);

  // Handle graceful shutdown
  process.on('SIGINT', () => agent.stop());
  process.on('SIGTERM', () => agent.stop());

  await agent.initialize();
  await agent.run();
}

main().catch(console.error);
