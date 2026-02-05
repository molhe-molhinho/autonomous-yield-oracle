/**
 * 24/7 Autonomous Trading Loop
 * 
 * Production-ready continuous operation with:
 * - Yield monitoring every interval
 * - Automatic rebalancing when yields shift
 * - Error recovery and retry logic
 * - Comprehensive logging
 * - State persistence
 * 
 * Built by Turbinete 🚀
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { OracleClient } from './client.js';
import { YieldFetcher, YieldData } from './yields.js';
import { JupiterSwap, YIELD_TOKENS } from './jupiter.js';
import { DEFAULT_CONFIG, PROTOCOL, PROTOCOL_NAMES, ProtocolId, TOKENS } from './config.js';

// ============= Configuration =============

const CONFIG = {
  // Timing
  monitorIntervalMs: 5 * 60 * 1000, // 5 minutes between checks
  
  // Trading parameters
  minRebalanceImprovement: 100,     // 1% min improvement to rebalance (in bps)
  minHoldTimeMs: 60 * 60 * 1000,    // 1 hour minimum hold time
  maxPositionSol: 1_000_000_000n,   // 1 SOL max per position
  minTradeSize: 100_000_000n,       // 0.1 SOL minimum trade
  
  // Risk
  maxRiskScore: 70,
  
  // Retry logic
  maxRetries: 3,
  retryDelayMs: 5000,
  
  // Paths
  stateFile: '/Users/molhemolinho/clawd/projects/autonomous-yield-oracle/agent/loop-state.json',
  logDir: '/Users/molhemolinho/clawd/projects/autonomous-yield-oracle/agent/logs',
};

// Map protocols to their yield tokens
const PROTOCOL_TO_TOKEN: Partial<Record<ProtocolId, PublicKey>> = {
  [PROTOCOL.MARINADE]: TOKENS.mSOL,
  [PROTOCOL.JITO]: TOKENS.jitoSOL,
};

// ============= Types =============

interface Position {
  token: string;
  mint: string;
  amount: string; // stored as string for JSON serialization
  entryPrice: number;
  entryTime: number;
  protocol: ProtocolId;
}

interface LoopState {
  currentPosition: Position | null;
  totalPnlLamports: string;
  tradesExecuted: number;
  lastCheckTime: number;
  lastTradeTime: number;
  cycleCount: number;
  errors: number;
}

interface TradeRecord {
  timestamp: number;
  action: 'enter' | 'exit' | 'rebalance';
  fromToken: string;
  toToken: string;
  amountIn: string;
  amountOut: string;
  signature: string;
  reason: string;
}

// ============= Logger =============

class Logger {
  private logFile: string;
  
  constructor() {
    if (!existsSync(CONFIG.logDir)) {
      mkdirSync(CONFIG.logDir, { recursive: true });
    }
    const date = new Date().toISOString().split('T')[0];
    this.logFile = `${CONFIG.logDir}/agent-${date}.log`;
  }
  
  private format(level: string, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level}] ${message}`;
  }
  
  info(message: string) {
    const line = this.format('INFO', message);
    console.log(line);
    appendFileSync(this.logFile, line + '\n');
  }
  
  warn(message: string) {
    const line = this.format('WARN', message);
    console.warn(line);
    appendFileSync(this.logFile, line + '\n');
  }
  
  error(message: string) {
    const line = this.format('ERROR', message);
    console.error(line);
    appendFileSync(this.logFile, line + '\n');
  }
  
  trade(record: TradeRecord) {
    const line = this.format('TRADE', JSON.stringify(record));
    console.log('🔄 ' + line);
    appendFileSync(this.logFile, line + '\n');
    
    // Also append to trades log
    const tradesFile = `${CONFIG.logDir}/trades.jsonl`;
    appendFileSync(tradesFile, JSON.stringify(record) + '\n');
  }
}

// ============= Main Loop =============

class AutonomousLoop {
  private connection: Connection;
  private payer: Keypair;
  private jupiter: JupiterSwap;
  private oracleClient: OracleClient;
  private fetcher: YieldFetcher;
  private oracleAddress: PublicKey;
  private state: LoopState;
  private logger: Logger;
  private isRunning: boolean = false;

  constructor(
    connection: Connection,
    payer: Keypair,
    oracleAddress: PublicKey
  ) {
    this.connection = connection;
    this.payer = payer;
    this.oracleAddress = oracleAddress;
    this.jupiter = new JupiterSwap(connection, payer);
    this.oracleClient = new OracleClient(connection, payer);
    this.fetcher = new YieldFetcher();
    this.logger = new Logger();
    this.state = this.loadState();
  }

  // ============= State Management =============

  private loadState(): LoopState {
    if (existsSync(CONFIG.stateFile)) {
      try {
        const data = JSON.parse(readFileSync(CONFIG.stateFile, 'utf-8'));
        this.logger.info(`Loaded state: ${data.cycleCount} cycles, ${data.tradesExecuted} trades`);
        return data;
      } catch (e) {
        this.logger.warn('Could not load state, starting fresh');
      }
    }
    return {
      currentPosition: null,
      totalPnlLamports: '0',
      tradesExecuted: 0,
      lastCheckTime: 0,
      lastTradeTime: 0,
      cycleCount: 0,
      errors: 0,
    };
  }

  private saveState(): void {
    writeFileSync(CONFIG.stateFile, JSON.stringify(this.state, null, 2));
  }

  // ============= Main Loop =============

  async start(): Promise<void> {
    this.isRunning = true;
    
    this.logger.info('═══════════════════════════════════════════════════════');
    this.logger.info('🚀 AUTONOMOUS YIELD ORACLE - 24/7 LOOP STARTING');
    this.logger.info('═══════════════════════════════════════════════════════');
    this.logger.info(`Wallet: ${this.payer.publicKey.toBase58()}`);
    this.logger.info(`Oracle: ${this.oracleAddress.toBase58()}`);
    this.logger.info(`Interval: ${CONFIG.monitorIntervalMs / 1000}s`);
    this.logger.info(`Min rebalance improvement: ${CONFIG.minRebalanceImprovement / 100}%`);
    
    const balance = await this.connection.getBalance(this.payer.publicKey);
    this.logger.info(`Balance: ${(balance / 1e9).toFixed(4)} SOL`);
    
    if (this.state.currentPosition) {
      this.logger.info(`Current position: ${this.state.currentPosition.token}`);
    }
    
    this.logger.info('═══════════════════════════════════════════════════════');

    while (this.isRunning) {
      try {
        await this.cycle();
      } catch (error) {
        this.state.errors++;
        this.logger.error(`Cycle error: ${error}`);
        this.saveState();
      }
      
      // Wait for next cycle
      await this.sleep(CONFIG.monitorIntervalMs);
    }
  }

  stop(): void {
    this.logger.info('🛑 Stopping loop...');
    this.isRunning = false;
  }

  // ============= Trading Cycle =============

  private async cycle(): Promise<void> {
    this.state.cycleCount++;
    this.state.lastCheckTime = Date.now();
    
    this.logger.info(`━━━ Cycle #${this.state.cycleCount} ━━━`);

    // Fetch yields
    const yields = await this.fetcher.fetchAllYields();
    
    // Filter to swappable protocols
    const swappableYields = yields.filter(y => PROTOCOL_TO_TOKEN[y.protocol]);
    
    if (swappableYields.length === 0) {
      this.logger.warn('No swappable yields found');
      this.saveState();
      return;
    }

    // Find best swappable yield
    const bestYield = swappableYields.reduce((best, curr) => 
      curr.adjustedApyBps > best.adjustedApyBps ? curr : best
    );

    this.logger.info(`Best yield: ${bestYield.protocolName} @ ${(bestYield.apyBps / 100).toFixed(2)}% (adj: ${(bestYield.adjustedApyBps / 100).toFixed(2)}%)`);

    // Get wallet balance
    const balance = await this.connection.getBalance(this.payer.publicKey);

    // Decide action
    if (this.state.currentPosition) {
      await this.evaluateRebalance(bestYield, swappableYields, balance);
    } else {
      await this.evaluateEntry(bestYield, balance);
    }

    // Record decision on-chain
    await this.recordDecision(bestYield);
    
    this.saveState();
  }

  // ============= Entry Logic =============

  private async evaluateEntry(bestYield: YieldData, balanceLamports: number): Promise<void> {
    const targetToken = PROTOCOL_TO_TOKEN[bestYield.protocol];
    if (!targetToken) {
      this.logger.info('No direct swap available for best yield');
      return;
    }

    // Calculate position size
    const maxAmount = CONFIG.maxPositionSol;
    const halfBalance = BigInt(Math.floor(balanceLamports / 2));
    const positionSize = halfBalance < maxAmount ? halfBalance : maxAmount;

    if (positionSize < CONFIG.minTradeSize) {
      this.logger.warn(`Insufficient balance for trade (${positionSize} < ${CONFIG.minTradeSize})`);
      return;
    }

    this.logger.info(`🎯 ENTERING POSITION: ${bestYield.protocolName}`);
    this.logger.info(`   Amount: ${Number(positionSize) / 1e9} SOL`);
    this.logger.info(`   Expected APY: ${(bestYield.apyBps / 100).toFixed(2)}%`);

    // Execute swap with retry
    const result = await this.executeWithRetry(() => 
      this.jupiter.swapSolTo(targetToken, positionSize)
    );

    if (result?.success && result.signature) {
      this.logger.info(`✅ TRADE EXECUTED: ${result.signature}`);
      
      this.state.currentPosition = {
        token: bestYield.pool || bestYield.protocolName,
        mint: targetToken.toBase58(),
        amount: result.outputAmount.toString(),
        entryPrice: Number(positionSize) / Number(result.outputAmount),
        entryTime: Date.now(),
        protocol: bestYield.protocol,
      };
      this.state.tradesExecuted++;
      this.state.lastTradeTime = Date.now();
      
      this.logger.trade({
        timestamp: Date.now(),
        action: 'enter',
        fromToken: 'SOL',
        toToken: bestYield.pool || bestYield.protocolName,
        amountIn: positionSize.toString(),
        amountOut: result.outputAmount.toString(),
        signature: result.signature,
        reason: `Best yield: ${bestYield.protocolName} @ ${(bestYield.apyBps / 100).toFixed(2)}%`,
      });
    } else {
      this.logger.error(`Trade failed: ${result?.error || 'Unknown error'}`);
    }
  }

  // ============= Rebalance Logic =============

  private async evaluateRebalance(
    bestYield: YieldData, 
    allYields: YieldData[],
    balanceLamports: number
  ): Promise<void> {
    const pos = this.state.currentPosition!;
    
    // Check minimum hold time
    const holdTime = Date.now() - pos.entryTime;
    if (holdTime < CONFIG.minHoldTimeMs) {
      const remaining = Math.round((CONFIG.minHoldTimeMs - holdTime) / 60000);
      this.logger.info(`Hold time: ${Math.round(holdTime / 60000)}m (${remaining}m remaining)`);
      return;
    }

    // Find current position's yield
    const currentYield = allYields.find(y => y.protocol === pos.protocol);
    const currentAdjusted = currentYield?.adjustedApyBps || 0;
    const improvement = bestYield.adjustedApyBps - currentAdjusted;

    this.logger.info(`Current: ${pos.token} @ ${(currentAdjusted / 100).toFixed(2)}%`);
    this.logger.info(`Best: ${bestYield.protocolName} @ ${(bestYield.adjustedApyBps / 100).toFixed(2)}%`);
    this.logger.info(`Improvement: ${(improvement / 100).toFixed(2)}%`);

    // Check if rebalance is worth it
    if (improvement < CONFIG.minRebalanceImprovement) {
      this.logger.info('✓ No rebalance needed');
      return;
    }

    // Check if we can swap to the new protocol
    const newToken = PROTOCOL_TO_TOKEN[bestYield.protocol];
    if (!newToken || newToken.toBase58() === pos.mint) {
      this.logger.info('Cannot rebalance to same/unavailable protocol');
      return;
    }

    this.logger.info(`🔄 REBALANCING: ${pos.token} → ${bestYield.protocolName}`);

    // Exit current position
    const exitResult = await this.executeWithRetry(() =>
      this.jupiter.swapToSol(new PublicKey(pos.mint), BigInt(pos.amount))
    );

    if (!exitResult?.success) {
      this.logger.error(`Exit failed: ${exitResult?.error}`);
      return;
    }

    this.logger.info(`Exited: ${exitResult.signature}`);

    // Enter new position
    const entryResult = await this.executeWithRetry(() =>
      this.jupiter.swapSolTo(newToken, exitResult.outputAmount)
    );

    if (entryResult?.success && entryResult.signature) {
      this.logger.info(`✅ REBALANCE COMPLETE: ${entryResult.signature}`);

      // Calculate P&L
      const entryValue = BigInt(Math.round(pos.entryPrice * Number(pos.amount)));
      const pnl = exitResult.outputAmount - entryValue;
      this.state.totalPnlLamports = (BigInt(this.state.totalPnlLamports) + pnl).toString();

      // Update position
      this.state.currentPosition = {
        token: bestYield.pool || bestYield.protocolName,
        mint: newToken.toBase58(),
        amount: entryResult.outputAmount.toString(),
        entryPrice: Number(exitResult.outputAmount) / Number(entryResult.outputAmount),
        entryTime: Date.now(),
        protocol: bestYield.protocol,
      };
      this.state.tradesExecuted++;
      this.state.lastTradeTime = Date.now();

      this.logger.trade({
        timestamp: Date.now(),
        action: 'rebalance',
        fromToken: pos.token,
        toToken: bestYield.pool || bestYield.protocolName,
        amountIn: pos.amount,
        amountOut: entryResult.outputAmount.toString(),
        signature: entryResult.signature,
        reason: `Rebalance: +${(improvement / 100).toFixed(2)}% improvement`,
      });
    } else {
      this.logger.error(`Entry failed after exit: ${entryResult?.error}`);
    }
  }

  // ============= Helpers =============

  private async recordDecision(yield_: YieldData): Promise<void> {
    try {
      const sig = await this.oracleClient.monitorYields(
        this.oracleAddress,
        yield_.protocol,
        yield_.apyBps,
        yield_.riskScore
      );
      this.logger.info(`📝 On-chain: ${sig.slice(0, 20)}...`);
    } catch (error) {
      this.logger.warn(`Failed to record on-chain: ${error}`);
    }
  }

  private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T | null> {
    for (let i = 0; i < CONFIG.maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        this.logger.warn(`Attempt ${i + 1}/${CONFIG.maxRetries} failed: ${error}`);
        if (i < CONFIG.maxRetries - 1) {
          await this.sleep(CONFIG.retryDelayMs);
        }
      }
    }
    return null;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============= Status =============

  getStatus(): {
    running: boolean;
    cycles: number;
    trades: number;
    position: Position | null;
    pnl: number;
    errors: number;
  } {
    return {
      running: this.isRunning,
      cycles: this.state.cycleCount,
      trades: this.state.tradesExecuted,
      position: this.state.currentPosition,
      pnl: Number(this.state.totalPnlLamports) / 1e9,
      errors: this.state.errors,
    };
  }
}

// ============= Entry Point =============

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║     🚀 AUTONOMOUS YIELD ORACLE - 24/7 LOOP 🚀                     ║
║                                                                   ║
║     Built by Turbinete for Colosseum Hackathon 2026              ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
`);

  const keypairPath = process.env.KEYPAIR_PATH || 
    `${process.env.HOME}/.config/solana/turbinete-wallet.json`;
  const oracleAddress = process.env.ORACLE_ADDRESS || 
    '7Ezsv1Etg3rk5WQvenCAjrArHp8zdacBFmKWj2iEn7pd';

  if (!existsSync(keypairPath)) {
    console.error(`❌ Keypair not found: ${keypairPath}`);
    process.exit(1);
  }

  const keypairData = JSON.parse(readFileSync(keypairPath, 'utf-8'));
  const payer = Keypair.fromSecretKey(Uint8Array.from(keypairData));

  const connection = new Connection(DEFAULT_CONFIG.rpcUrl, 'confirmed');
  
  const loop = new AutonomousLoop(
    connection,
    payer,
    new PublicKey(oracleAddress)
  );

  // Handle graceful shutdown
  process.on('SIGINT', () => loop.stop());
  process.on('SIGTERM', () => loop.stop());

  await loop.start();
}

main().catch(console.error);
