/**
 * Standalone Yield Monitor
 * 
 * Quick script to check current yields without running the full agent.
 * 
 * Usage: npm run monitor
 * 
 * Built by Turbinete 🚀
 */

import { YieldFetcher, YieldData } from './yields.js';
import { PROTOCOL_NAMES, ProtocolId } from './config.js';

async function main() {
  console.log('\n🔍 YIELD MONITOR - Autonomous Yield Oracle');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const fetcher = new YieldFetcher();
  
  console.log('📡 Fetching yields from protocols...\n');
  
  const yields = await fetcher.fetchAllYields();
  
  // Sort by adjusted APY
  yields.sort((a, b) => b.adjustedApyBps - a.adjustedApyBps);

  console.log('📊 YIELD COMPARISON (sorted by risk-adjusted APY):\n');
  console.log('┌─────────────────┬─────────┬──────────┬──────────┬─────────────────┐');
  console.log('│ Protocol        │ APY     │ Risk     │ Adjusted │ Pool            │');
  console.log('├─────────────────┼─────────┼──────────┼──────────┼─────────────────┤');
  
  for (const y of yields) {
    const protocol = y.protocolName.padEnd(15);
    const apy = `${(y.apyBps / 100).toFixed(2)}%`.padStart(6);
    const risk = `${y.riskScore}`.padStart(3);
    const adjusted = `${(y.adjustedApyBps / 100).toFixed(2)}%`.padStart(7);
    const pool = (y.pool || 'N/A').substring(0, 15).padEnd(15);
    
    console.log(`│ ${protocol} │ ${apy} │    ${risk}   │ ${adjusted} │ ${pool} │`);
  }
  
  console.log('└─────────────────┴─────────┴──────────┴──────────┴─────────────────┘\n');

  // Best opportunity
  const best = await fetcher.getBestYield(70);
  if (best) {
    console.log('🏆 RECOMMENDATION:');
    console.log(`   Protocol: ${best.protocolName}`);
    console.log(`   Pool: ${best.pool}`);
    console.log(`   APY: ${(best.apyBps / 100).toFixed(2)}%`);
    console.log(`   Risk Score: ${best.riskScore}/100`);
    console.log(`   Risk-Adjusted APY: ${(best.adjustedApyBps / 100).toFixed(2)}%`);
    console.log(`\n   💡 This is the optimal yield within risk tolerance (max 70)\n`);
  }

  // Formula explanation
  console.log('📐 FORMULA:');
  console.log('   Risk-Adjusted APY = APY × (100 - Risk Score) / 100');
  console.log('   Example: 15% APY with 35 risk = 15% × 65% = 9.75%\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Built by Turbinete 🚀 | Colosseum Hackathon 2026');
}

main().catch(console.error);
