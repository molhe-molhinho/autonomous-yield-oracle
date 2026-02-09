/**
 * Telegram Alerts - Real-time notifications for the Autonomous Yield Oracle
 *
 * Sends alerts when:
 * - Trades are executed
 * - Significant signals detected (TVL compression, breakouts)
 * - Position changes
 * - Errors occur
 *
 * Built by Turbinete 🚀 for the Colosseum Agent Hackathon 2026
 */
import { GravityAnalysis } from './gravity.js';
export interface AlertConfig {
    botToken: string;
    chatId: string;
    enabled: boolean;
    alertOnTrades: boolean;
    alertOnSignals: boolean;
    alertOnErrors: boolean;
    minSignalImpact: number;
}
export interface TradeAlert {
    action: 'enter' | 'exit' | 'rebalance';
    fromToken: string;
    toToken: string;
    amountIn: string;
    amountOut: string;
    reason: string;
    signature: string;
}
export declare class TelegramAlerts {
    private config;
    private lastAlertTime;
    private alertCooldownMs;
    constructor(config?: Partial<AlertConfig>);
    /**
     * Check if alerts are properly configured
     */
    isEnabled(): boolean;
    /**
     * Send a trade execution alert
     */
    alertTrade(trade: TradeAlert): Promise<boolean>;
    /**
     * Alert on significant gravity signals
     */
    alertSignals(analyses: GravityAnalysis[]): Promise<boolean>;
    /**
     * Send daily status summary
     */
    alertDailySummary(data: {
        solBalance: number;
        positions: {
            token: string;
            amount: number;
            apy: number;
        }[];
        totalValueSol: number;
        decisionsCount: number;
        tradesCount: number;
    }): Promise<boolean>;
    /**
     * Send error alert
     */
    alertError(error: string, context?: string): Promise<boolean>;
    /**
     * Send startup notification
     */
    alertStartup(oracleAddress: string, balance: number): Promise<boolean>;
    /**
     * Send a message via Telegram Bot API
     */
    private sendMessage;
}
