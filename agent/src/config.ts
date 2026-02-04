/**
 * Configuration for the Autonomous Yield Oracle Agent
 * 
 * Built by Turbinete 🚀 for the Colosseum Agent Hackathon 2026
 */

import { PublicKey, Cluster } from '@solana/web3.js';

// Program ID on devnet (and eventually mainnet)
export const PROGRAM_ID = new PublicKey('E7nfxrs1We4muQNAbqnyJwVGFA5WvJPAtvUbt8BoCeRq');

// Protocol identifiers (must match on-chain program)
export const PROTOCOL = {
  RAYDIUM_CPMM: 0,
  JUPITER_ROUTE: 1,
  KAMINO: 2,
  MARINADE: 3,
  JITO: 4,
} as const;

export type ProtocolId = typeof PROTOCOL[keyof typeof PROTOCOL];

// Protocol names for logging
export const PROTOCOL_NAMES: Record<ProtocolId, string> = {
  [PROTOCOL.RAYDIUM_CPMM]: 'Raydium CPMM',
  [PROTOCOL.JUPITER_ROUTE]: 'Jupiter Route',
  [PROTOCOL.KAMINO]: 'Kamino',
  [PROTOCOL.MARINADE]: 'Marinade',
  [PROTOCOL.JITO]: 'Jito',
};

// Instruction discriminators
export const DISCRIMINATOR = {
  INITIALIZE: 0,
  MONITOR_YIELDS: 1,
  EXECUTE_SWAP: 2,
  REBALANCE: 3,
  PUBLISH_STRATEGY: 4,
  EMERGENCY_WITHDRAW: 5,
} as const;

// Oracle state layout
export const ORACLE_STATE_SIZE = 69; // bytes

// Default configuration
export const DEFAULT_CONFIG = {
  cluster: 'devnet' as Cluster,
  rpcUrl: 'https://api.devnet.solana.com',
  monitorIntervalMs: 60_000, // 1 minute
  minYieldDifferenceBps: 50, // 0.5% minimum improvement to trigger update
  maxRiskScore: 70, // Don't consider protocols with risk > 70
  logLevel: 'info' as 'debug' | 'info' | 'warn' | 'error',
};

// API endpoints for yield data
export const API_ENDPOINTS = {
  // Raydium API
  RAYDIUM_POOLS: 'https://api.raydium.io/v2/main/pairs',
  RAYDIUM_AMMV4: 'https://api.raydium.io/v2/ammV4/lpPrice',
  
  // Jupiter API  
  JUPITER_QUOTE: 'https://quote-api.jup.ag/v6/quote',
  JUPITER_PRICE: 'https://price.jup.ag/v6/price',
  
  // Jito (staking yields)
  JITO_STATS: 'https://www.jito.network/api/v1/stake/stats',
  
  // Marinade (liquid staking)
  MARINADE_STATS: 'https://api.marinade.finance/msol/apy',
};

// Common token mints
export const TOKENS = {
  SOL: new PublicKey('So11111111111111111111111111111111111111112'),
  USDC: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
  USDT: new PublicKey('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'),
  mSOL: new PublicKey('mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So'),
  jitoSOL: new PublicKey('J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn'),
};
