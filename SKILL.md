# Autonomous Yield Oracle

Query real-time yield optimization data from an AI agent that actually trades on Solana mainnet.

## What This Does

An autonomous trading agent that:
- Monitors yields across Marinade, Jito, Raydium, Kamino
- Executes real trades via Jupiter aggregator
- Records all decisions on-chain for transparency
- Currently earning ~7.47% APY on jitoSOL

## On-Chain Data

| Resource | Address |
|----------|---------|
| Program | `E7nfxrs1We4muQNAbqnyJwVGFA5WvJPAtvUbt8BoCeRq` |
| Oracle PDA | `7Ezsv1Etg3rk5WQvenCAjrArHp8zdacBFmKWj2iEn7pd` |
| Agent Wallet | `3mhy5vsxVwTSXCbwjvnov62WTMxuHEZxbRHmP7n2nz4W` |

## Query the Oracle

```typescript
import { Connection, PublicKey } from "@solana/web3.js";

const ORACLE_PDA = new PublicKey("7Ezsv1Etg3rk5WQvenCAjrArHp8zdacBFmKWj2iEn7pd");
const connection = new Connection("https://api.mainnet-beta.solana.com");

// Fetch oracle state
const oracleAccount = await connection.getAccountInfo(ORACLE_PDA);
// Decode using the IDL from the repo
```

## Live Dashboard

View real-time portfolio and decisions:
https://molhe-molhinho.github.io/autonomous-yield-oracle/

## Risk-Adjusted Yield Formula

```
adjusted_yield = raw_apy * (100 - risk_score) / 100

Risk scores:
- Marinade (mSOL): 15
- Jito (jitoSOL): 18
- Raydium CPMM: 35
- Kamino: 30
```

## Verification

All trades and decisions are recorded on-chain:
- First autonomous trade: [`21VMPpay...`](https://solscan.io/tx/21VMPpayKkqWbeG3RFiVEgaeno8fBiTrU4BKxv7N5G4PSS9h4uU4WAvLQmM5a4oUYWWoBLqPWZK8tWXXFzox4sh3)

## Integration Ideas

- Query oracle for yield recommendations before staking
- Follow the agent's positions as a signal
- Use as a benchmark for your own yield strategies

## Links

- GitHub: https://github.com/molhe-molhinho/autonomous-yield-oracle
- Dashboard: https://molhe-molhinho.github.io/autonomous-yield-oracle/
- Vote: https://colosseum.com/agent-hackathon/projects/autonomous-yield-oracle
