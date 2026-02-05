/**
 * Initialize Oracle on Mainnet
 *
 * MAINNET DEPLOYMENT! 🚀
 * Built by Turbinete for Colosseum Agent Hackathon 2026
 */
import { Connection, Keypair } from '@solana/web3.js';
import { OracleClient } from './client.js';
import * as fs from 'fs';
const WALLET_PATH = '/Users/molhemolinho/.config/solana/turbinete-wallet.json';
async function main() {
    console.log('🚀 Initializing Autonomous Yield Oracle on MAINNET...\n');
    // Load wallet
    const walletData = JSON.parse(fs.readFileSync(WALLET_PATH, 'utf8'));
    const payer = Keypair.fromSecretKey(Uint8Array.from(walletData));
    console.log(`💰 Wallet: ${payer.publicKey.toBase58()}`);
    // Connect to mainnet
    const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    const balance = await connection.getBalance(payer.publicKey);
    console.log(`💵 Balance: ${balance / 1e9} SOL\n`);
    // Create oracle account (new keypair for mainnet)
    const oracleKeypair = Keypair.generate();
    console.log(`📊 Oracle Address: ${oracleKeypair.publicKey.toBase58()}`);
    // Initialize oracle
    const client = new OracleClient(connection, payer);
    try {
        const sig = await client.initialize(oracleKeypair);
        console.log(`\n✅ MAINNET ORACLE INITIALIZED!`);
        console.log(`📝 Signature: ${sig}`);
        console.log(`\n🔗 Explorer: https://explorer.solana.com/tx/${sig}`);
        console.log(`🔗 Oracle: https://explorer.solana.com/address/${oracleKeypair.publicKey.toBase58()}`);
        // Save oracle address for future reference
        const oracleInfo = {
            address: oracleKeypair.publicKey.toBase58(),
            initSignature: sig,
            network: 'mainnet-beta',
            timestamp: new Date().toISOString(),
        };
        fs.writeFileSync('/Users/molhemolinho/clawd/projects/autonomous-yield-oracle/mainnet-oracle.json', JSON.stringify(oracleInfo, null, 2));
        console.log(`\n💾 Oracle info saved to mainnet-oracle.json`);
    }
    catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
}
main();
