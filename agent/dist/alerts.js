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
// Telegram Bot Configuration
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
// Alert thresholds
const SIGNIFICANT_TVL_CHANGE_PERCENT = 5; // Alert if TVL changes >5%
const SIGNIFICANT_YIELD_CHANGE_BPS = 50; // Alert if yield changes >0.5%
export class TelegramAlerts {
    config;
    lastAlertTime = new Map();
    alertCooldownMs = 300_000; // 5 min cooldown per alert type
    constructor(config) {
        this.config = {
            botToken: config?.botToken || TELEGRAM_BOT_TOKEN,
            chatId: config?.chatId || TELEGRAM_CHAT_ID,
            enabled: config?.enabled ?? true,
            alertOnTrades: config?.alertOnTrades ?? true,
            alertOnSignals: config?.alertOnSignals ?? true,
            alertOnErrors: config?.alertOnErrors ?? true,
            minSignalImpact: config?.minSignalImpact ?? 20, // 0.2% minimum impact
        };
        if (this.config.enabled && (!this.config.botToken || !this.config.chatId)) {
            console.warn('⚠️ Telegram alerts disabled: missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
            this.config.enabled = false;
        }
    }
    /**
     * Check if alerts are properly configured
     */
    isEnabled() {
        return this.config.enabled && !!this.config.botToken && !!this.config.chatId;
    }
    /**
     * Send a trade execution alert
     */
    async alertTrade(trade) {
        if (!this.config.alertOnTrades)
            return false;
        const emoji = trade.action === 'enter' ? '🟢' :
            trade.action === 'exit' ? '🔴' : '🔄';
        const actionText = trade.action === 'enter' ? 'ENTERED POSITION' :
            trade.action === 'exit' ? 'EXITED POSITION' : 'REBALANCED';
        const message = `
${emoji} <b>${actionText}</b>

<b>From:</b> ${trade.fromToken}
<b>To:</b> ${trade.toToken}
<b>Amount In:</b> ${(Number(trade.amountIn) / 1e9).toFixed(4)}
<b>Amount Out:</b> ${(Number(trade.amountOut) / 1e9).toFixed(6)}

<b>Reason:</b> ${trade.reason}

🔗 <a href="https://solscan.io/tx/${trade.signature}">View Transaction</a>

🤖 <i>Autonomous Yield Oracle</i>
`.trim();
        return this.sendMessage(message);
    }
    /**
     * Alert on significant gravity signals
     */
    async alertSignals(analyses) {
        if (!this.config.alertOnSignals)
            return false;
        // Collect significant signals
        const significantSignals = [];
        for (const analysis of analyses) {
            for (const signal of analysis.signals) {
                if (Math.abs(signal.impact) >= this.config.minSignalImpact) {
                    // Check cooldown
                    const key = `${analysis.protocol}-${signal.type}`;
                    const lastAlert = this.lastAlertTime.get(key) || 0;
                    if (Date.now() - lastAlert < this.alertCooldownMs)
                        continue;
                    significantSignals.push({
                        protocol: analysis.protocolName,
                        signal,
                    });
                    this.lastAlertTime.set(key, Date.now());
                }
            }
        }
        if (significantSignals.length === 0)
            return false;
        const signalLines = significantSignals.map(s => `• <b>${s.protocol}:</b> ${s.signal.message} (${s.signal.impact > 0 ? '+' : ''}${s.signal.impact}bps)`).join('\n');
        const message = `
🔮 <b>YIELD GRAVITY SIGNALS</b>

${signalLines}

🤖 <i>Autonomous Yield Oracle</i>
`.trim();
        return this.sendMessage(message);
    }
    /**
     * Send daily status summary
     */
    async alertDailySummary(data) {
        const positionLines = data.positions.map(p => `• ${p.token}: ${p.amount.toFixed(4)} (${p.apy.toFixed(2)}% APY)`).join('\n');
        const message = `
📊 <b>DAILY STATUS</b>

<b>Portfolio:</b>
• SOL: ${data.solBalance.toFixed(4)}
${positionLines}

<b>Total Value:</b> ~${data.totalValueSol.toFixed(2)} SOL

<b>Stats:</b>
• Oracle Decisions: ${data.decisionsCount}
• Trades Executed: ${data.tradesCount}

🤖 <i>Autonomous Yield Oracle</i>
`.trim();
        return this.sendMessage(message);
    }
    /**
     * Send error alert
     */
    async alertError(error, context) {
        if (!this.config.alertOnErrors)
            return false;
        // Cooldown for errors
        const key = `error-${error.slice(0, 50)}`;
        const lastAlert = this.lastAlertTime.get(key) || 0;
        if (Date.now() - lastAlert < this.alertCooldownMs)
            return false;
        this.lastAlertTime.set(key, Date.now());
        const message = `
⚠️ <b>ALERT: Error Detected</b>

<b>Error:</b> ${error}
${context ? `<b>Context:</b> ${context}` : ''}

🤖 <i>Autonomous Yield Oracle</i>
`.trim();
        return this.sendMessage(message);
    }
    /**
     * Send startup notification
     */
    async alertStartup(oracleAddress, balance) {
        const message = `
🚀 <b>YIELD ORACLE STARTED</b>

<b>Oracle:</b> <code>${oracleAddress}</code>
<b>Balance:</b> ${balance.toFixed(4)} SOL
<b>Mode:</b> 24/7 Autonomous Trading

🤖 <i>Ready to optimize yields!</i>
`.trim();
        return this.sendMessage(message);
    }
    /**
     * Send a message via Telegram Bot API
     */
    async sendMessage(text) {
        if (!this.isEnabled())
            return false;
        try {
            const url = `https://api.telegram.org/bot${this.config.botToken}/sendMessage`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: this.config.chatId,
                    text,
                    parse_mode: 'HTML',
                    disable_web_page_preview: true,
                }),
            });
            if (!response.ok) {
                const error = await response.text();
                console.warn('⚠️ Telegram alert failed:', error);
                return false;
            }
            console.log('📱 Telegram alert sent');
            return true;
        }
        catch (error) {
            console.warn('⚠️ Failed to send Telegram alert:', error);
            return false;
        }
    }
}
