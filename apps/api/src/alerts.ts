import type { Logger } from './log';

/**
 * Operator alerts. Always logged at error level; also sent to a Telegram chat when
 * TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set. The same key is sent at most once
 * every 10 minutes. Messages must not contain codes, full phone numbers or secrets.
 */
export class Alerter {
  private readonly lastSent = new Map<string, number>();

  constructor(
    private readonly log: Logger,
    private readonly telegram?: { token: string; chatId: string },
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(key: string, message: string): Promise<void> {
    this.log.error({ alert: key }, message);
    const now = Date.now();
    if ((this.lastSent.get(key) ?? 0) > now - 10 * 60_000) return;
    this.lastSent.set(key, now);
    if (!this.telegram) return;
    try {
      await this.fetchImpl(`https://api.telegram.org/bot${this.telegram.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: this.telegram.chatId, text: `Qarta Pay: ${message}` }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      this.log.warn({ err: error }, 'telegram alert failed');
    }
  }
}
