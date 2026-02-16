/**
 * Auto-Compound - Automatically reinvest earned yield
 * 
 * Compound interest is the 8th wonder of the world!
 * This module tracks yield earnings and reinvests them.
 * 
 * Built by Turbinete 🚀 for the Colosseum Agent Hackathon 2026
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { JupiterSwap, YIELD_TOKENS } from './jupiter.js';
import { PROTOCOL, PROTOCOL_NAMES, ProtocolId, TOKENS } from './config.js';

const COMPOUND_STATE_FILE = '/Users/molhemolinho/clawd/projects/autonomous-yield-oracle/agent/compound-state.json';

// Token configurations for compounding
const COMPOUND_TOKENS: Record<string, { mint: PublicKey; protocol: ProtocolId; baseApy: number }> = {
  'jitoSOL': { mint: TOKENS.jitoSOL, protocol: PROTOCOL.JITO, baseApy: 7.5 },
  'mSOL': { mint: TOKENS.mSOL, protocol: PROTOCOL.MARINADE, baseApy: 6.8 },
};

export interface CompoundState {
  positions: CompoundPosition[];
  totalCompounded: string;        // Total SOL value compounded
  compoundCount: number;          // Number of compound events
  lastCompound: number;           // Timestamp
  history: CompoundRecord[];
}

export interface CompoundPosition {
  token: string;
  mint: string;
  initialAmount: string;          // Starting amount
  currentAmount: string;          // Current amount (including yield)
  earnedYield: string;            // Yield earned so far
  lastUpdate: number;
  apy: number;
}

export interface CompoundRecord {
  timestamp: number;
  token: string;
  yieldEarned: string;
  compoundedAmount: string;
  newTotal: string;
  signature?: string;
}

export interface CompoundConfig {
  enabled: boolean;
  minCompoundSol: bigint;         // Minimum yield to trigger compound
  checkIntervalMs: number;        // How often to check for compoundable yield
  autoReinvest: boolean;          // Whether to automatically reinvest
}

const DEFAULT_CONFIG: CompoundConfig = {
  enabled: true,
  minCompoundSol: 10_000_000n,    // 0.01 SOL minimum to compound
  checkIntervalMs: 3600_000,       // Check every hour
  autoReinvest: true,
};

export class AutoCompound {
  private connection: Connection;
  private payer: Keypair;
  private jupiter: JupiterSwap;
  private state: CompoundState;
  private config: CompoundConfig;

  constructor(
    connection: Connection,
    payer: Keypair,
    config?: Partial<CompoundConfig>
  ) {
    this.connection = connection;
    this.payer = payer;
    this.jupiter = new JupiterSwap(connection, payer);
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = this.loadState();
  }

  /**
   * Load state from disk
   */
  private loadState(): CompoundState {
    if (existsSync(COMPOUND_STATE_FILE)) {
      try {
        return JSON.parse(readFileSync(COMPOUND_STATE_FILE, 'utf-8'));
      } catch (e) {
        console.warn('⚠️ Could not load compound state');
      }
    }
    return {
      positions: [],
      totalCompounded: '0',
      compoundCount: 0,
      lastCompound: 0,
      history: [],
    };
  }

  /**
   * Save state to disk
   */
  private saveState(): void {
    writeFileSync(COMPOUND_STATE_FILE, JSON.stringify(this.state, null, 2));
  }

  /**
   * Track a new position for compounding
   */
  async trackPosition(token: string, amount: bigint): Promise<void> {
    const tokenConfig = COMPOUND_TOKENS[token];
    if (!tokenConfig) {
      console.warn(`⚠️ Token ${token} not configured for compounding`);
      return;
    }

    // Check if position already exists
    let position = this.state.positions.find(p => p.token === token);
    
    if (position) {
      // Update existing position
      position.currentAmount = (BigInt(position.currentAmount) + amount).toString();
      position.lastUpdate = Date.now();
    } else {
      // Create new position
      this.state.positions.push({
        token,
        mint: tokenConfig.mint.toBase58(),
        initialAmount: amount.toString(),
        currentAmount: amount.toString(),
        earnedYield: '0',
        lastUpdate: Date.now(),
        apy: tokenConfig.baseApy,
      });
    }

    this.saveState();
    console.log(`📈 Tracking ${token} position: ${(Number(amount) / 1e9).toFixed(4)}`);
  }

  /**
   * Calculate yield earned since last update
   */
  calculateYieldEarned(position: CompoundPosition): bigint {
    const now = Date.now();
    const elapsed = now - position.lastUpdate;
    const hoursElapsed = elapsed / (1000 * 60 * 60);
    
    // APY to hourly rate: (1 + APY)^(1/8760) - 1
    const hourlyRate = Math.pow(1 + (position.apy / 100), 1 / 8760) - 1;
    
    const currentAmount = BigInt(position.currentAmount);
    const yieldEarned = BigInt(Math.floor(Number(currentAmount) * hourlyRate * hoursElapsed));
    
    return yieldEarned;
  }

  /**
   * Check all positions and compound if needed
   */
  async checkAndCompound(): Promise<{
    compounded: boolean;
    totalYield: bigint;
    details: string[];
  }> {
    if (!this.config.enabled) {
      return { compounded: false, totalYield: 0n, details: ['Compounding disabled'] };
    }

    console.log('\n🔄 Auto-Compound Check:');
    
    const details: string[] = [];
    let totalYield = 0n;
    let anyCompounded = false;

    for (const position of this.state.positions) {
      // Get actual on-chain balance
      const tokenConfig = COMPOUND_TOKENS[position.token];
      if (!tokenConfig) continue;

      try {
        const accounts = await this.connection.getParsedTokenAccountsByOwner(
          this.payer.publicKey,
          { mint: tokenConfig.mint }
        );

        if (accounts.value.length === 0) continue;

        const onChainBalance = BigInt(
          accounts.value[0].account.data.parsed?.info?.tokenAmount?.amount || '0'
        );

        // Calculate yield as difference between on-chain and tracked
        const trackedAmount = BigInt(position.currentAmount);
        const yieldEarned = onChainBalance > trackedAmount 
          ? onChainBalance - trackedAmount 
          : this.calculateYieldEarned(position);

        const yieldSol = Number(yieldEarned) / 1e9;
        
        console.log(`   ${position.token}:`);
        console.log(`      Tracked: ${(Number(trackedAmount) / 1e9).toFixed(6)}`);
        console.log(`      On-chain: ${(Number(onChainBalance) / 1e9).toFixed(6)}`);
        console.log(`      Yield: ${yieldSol.toFixed(6)} (~$${(yieldSol * 150).toFixed(2)})`);

        totalYield += yieldEarned;

        // Update position with on-chain balance
        position.currentAmount = onChainBalance.toString();
        position.earnedYield = (BigInt(position.earnedYield) + yieldEarned).toString();
        position.lastUpdate = Date.now();

        // Check if we should compound (convert yield back to more tokens)
        if (yieldEarned >= this.config.minCompoundSol && this.config.autoReinvest) {
          details.push(`${position.token}: +${yieldSol.toFixed(4)} yield`);
          
          // For LSTs, the yield is already compounding in the token itself
          // (jitoSOL/mSOL appreciate vs SOL automatically)
          // So we just track it - no swap needed!
          
          this.state.history.push({
            timestamp: Date.now(),
            token: position.token,
            yieldEarned: yieldEarned.toString(),
            compoundedAmount: yieldEarned.toString(),
            newTotal: onChainBalance.toString(),
          });

          this.state.compoundCount++;
          this.state.totalCompounded = (
            BigInt(this.state.totalCompounded) + yieldEarned
          ).toString();
          this.state.lastCompound = Date.now();
          
          anyCompounded = true;
          console.log(`      ✅ Yield tracked and compounding!`);
        }

      } catch (error) {
        console.warn(`   ⚠️ Error checking ${position.token}:`, error);
      }
    }

    this.saveState();

    return {
      compounded: anyCompounded,
      totalYield,
      details,
    };
  }

  /**
   * Get compound statistics
   */
  getStats(): {
    positions: number;
    totalTracked: string;
    totalYieldEarned: string;
    compoundCount: number;
    lastCompound: number;
    effectiveApy: number;
  } {
    let totalTracked = 0n;
    let totalYield = 0n;

    for (const position of this.state.positions) {
      totalTracked += BigInt(position.currentAmount);
      totalYield += BigInt(position.earnedYield);
    }

    // Calculate effective APY based on actual yield
    const oldestPosition = this.state.positions.reduce(
      (oldest, p) => p.lastUpdate < oldest ? p.lastUpdate : oldest,
      Date.now()
    );
    const daysTracked = (Date.now() - oldestPosition) / (1000 * 60 * 60 * 24);
    const effectiveApy = daysTracked > 0 
      ? (Number(totalYield) / Number(totalTracked)) * (365 / daysTracked) * 100
      : 0;

    return {
      positions: this.state.positions.length,
      totalTracked: (Number(totalTracked) / 1e9).toFixed(4) + ' tokens',
      totalYieldEarned: (Number(totalYield) / 1e9).toFixed(6) + ' tokens',
      compoundCount: this.state.compoundCount,
      lastCompound: this.state.lastCompound,
      effectiveApy: Math.round(effectiveApy * 100) / 100,
    };
  }

  /**
   * Format stats for display
   */
  static formatStats(stats: ReturnType<AutoCompound['getStats']>): string {
    return [
      `📊 Auto-Compound Stats:`,
      `   Positions: ${stats.positions}`,
      `   Total Tracked: ${stats.totalTracked}`,
      `   Yield Earned: ${stats.totalYieldEarned}`,
      `   Compound Events: ${stats.compoundCount}`,
      `   Effective APY: ${stats.effectiveApy}%`,
    ].join('\n');
  }

  /**
   * Project future earnings
   */
  projectEarnings(days: number): {
    projected: string;
    withCompounding: string;
    compoundBonus: string;
  } {
    let totalValue = 0;
    let avgApy = 0;

    for (const position of this.state.positions) {
      const value = Number(BigInt(position.currentAmount)) / 1e9;
      totalValue += value;
      avgApy += position.apy * value;
    }

    if (totalValue > 0) {
      avgApy /= totalValue;
    }

    // Simple interest
    const simpleEarnings = totalValue * (avgApy / 100) * (days / 365);
    
    // Compound interest (daily compounding)
    const compoundEarnings = totalValue * (Math.pow(1 + (avgApy / 100 / 365), days) - 1);
    
    const bonus = compoundEarnings - simpleEarnings;

    return {
      projected: simpleEarnings.toFixed(4) + ' SOL',
      withCompounding: compoundEarnings.toFixed(4) + ' SOL',
      compoundBonus: '+' + bonus.toFixed(4) + ' SOL',
    };
  }
}
