/**
 * Solana Program Client for Autonomous Yield Oracle
 *
 * Handles all on-chain interactions: initialize, monitor, publish, etc.
 *
 * Built by Turbinete 🚀
 */
import { PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction, SystemProgram, } from '@solana/web3.js';
import { PROGRAM_ID, DISCRIMINATOR, ORACLE_STATE_SIZE } from './config.js';
export class OracleClient {
    connection;
    payer;
    constructor(connection, payer) {
        this.connection = connection;
        this.payer = payer;
    }
    /**
     * Derive the oracle PDA address
     */
    static deriveOracleAddress(authority) {
        return PublicKey.findProgramAddressSync([Buffer.from('oracle'), authority.toBuffer()], PROGRAM_ID);
    }
    /**
     * Get oracle state from account data
     */
    async getOracleState(oracleAddress) {
        const accountInfo = await this.connection.getAccountInfo(oracleAddress);
        if (!accountInfo || accountInfo.data.length < ORACLE_STATE_SIZE) {
            return null;
        }
        const data = accountInfo.data;
        return {
            isInitialized: data[0] === 1,
            authority: new PublicKey(data.slice(1, 33)),
            bestProtocol: data[33],
            currentApyBps: data.readUInt16LE(34),
            riskScore: data[36],
            lastUpdate: data.readBigInt64LE(37),
            totalValueManaged: data.readBigUInt64LE(45),
            decisionsCount: data.readBigUInt64LE(53),
            cumulativePnl: data.readBigInt64LE(61),
        };
    }
    /**
     * Initialize a new oracle account
     */
    async initialize(oracleKeypair) {
        const space = ORACLE_STATE_SIZE;
        const lamports = await this.connection.getMinimumBalanceForRentExemption(space);
        // Create account instruction
        const createAccountIx = SystemProgram.createAccount({
            fromPubkey: this.payer.publicKey,
            newAccountPubkey: oracleKeypair.publicKey,
            lamports,
            space,
            programId: PROGRAM_ID,
        });
        // Initialize instruction
        const initializeIx = new TransactionInstruction({
            programId: PROGRAM_ID,
            keys: [
                { pubkey: oracleKeypair.publicKey, isSigner: false, isWritable: true },
                { pubkey: this.payer.publicKey, isSigner: true, isWritable: false },
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            data: Buffer.from([DISCRIMINATOR.INITIALIZE]),
        });
        const tx = new Transaction().add(createAccountIx, initializeIx);
        const sig = await sendAndConfirmTransaction(this.connection, tx, [this.payer, oracleKeypair]);
        console.log(`✅ Oracle initialized: ${oracleKeypair.publicKey.toBase58()}`);
        return sig;
    }
    /**
     * Update oracle with new yield data
     */
    async monitorYields(oracleAddress, protocol, apyBps, riskScore) {
        const timestamp = BigInt(Math.floor(Date.now() / 1000));
        // Build instruction data: discriminator + protocol + apy_bps + risk_score + timestamp
        const data = Buffer.alloc(13);
        data.writeUInt8(DISCRIMINATOR.MONITOR_YIELDS, 0);
        data.writeUInt8(protocol, 1);
        data.writeUInt16LE(apyBps, 2);
        data.writeUInt8(riskScore, 4);
        data.writeBigInt64LE(timestamp, 5);
        const ix = new TransactionInstruction({
            programId: PROGRAM_ID,
            keys: [
                { pubkey: oracleAddress, isSigner: false, isWritable: true },
                { pubkey: this.payer.publicKey, isSigner: true, isWritable: false },
            ],
            data,
        });
        const tx = new Transaction().add(ix);
        const sig = await sendAndConfirmTransaction(this.connection, tx, [this.payer]);
        return sig;
    }
    /**
     * Publish strategy recommendation
     */
    async publishStrategy(oracleAddress, protocol, expectedApyBps, riskScore) {
        const timestamp = BigInt(Math.floor(Date.now() / 1000));
        const data = Buffer.alloc(13);
        data.writeUInt8(DISCRIMINATOR.PUBLISH_STRATEGY, 0);
        data.writeUInt8(protocol, 1);
        data.writeUInt16LE(expectedApyBps, 2);
        data.writeUInt8(riskScore, 4);
        data.writeBigInt64LE(timestamp, 5);
        const ix = new TransactionInstruction({
            programId: PROGRAM_ID,
            keys: [
                { pubkey: oracleAddress, isSigner: false, isWritable: true },
                { pubkey: this.payer.publicKey, isSigner: true, isWritable: false },
            ],
            data,
        });
        const tx = new Transaction().add(ix);
        const sig = await sendAndConfirmTransaction(this.connection, tx, [this.payer]);
        return sig;
    }
    /**
     * Execute a swap decision (records decision on-chain)
     */
    async executeSwap(oracleAddress, sourceToken, destToken, amountIn, minAmountOut, protocol) {
        const data = Buffer.alloc(18);
        data.writeUInt8(DISCRIMINATOR.EXECUTE_SWAP, 0);
        data.writeBigUInt64LE(amountIn, 1);
        data.writeBigUInt64LE(minAmountOut, 9);
        data.writeUInt8(protocol, 17);
        const ix = new TransactionInstruction({
            programId: PROGRAM_ID,
            keys: [
                { pubkey: oracleAddress, isSigner: false, isWritable: true },
                { pubkey: this.payer.publicKey, isSigner: true, isWritable: false },
                { pubkey: sourceToken, isSigner: false, isWritable: true },
                { pubkey: destToken, isSigner: false, isWritable: true },
            ],
            data,
        });
        const tx = new Transaction().add(ix);
        const sig = await sendAndConfirmTransaction(this.connection, tx, [this.payer]);
        return sig;
    }
}
