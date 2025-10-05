import TelegramBot from "node-telegram-bot-api";
import pino from "pino";
import { TelegramServiceConfig } from "./types";
export class TelegramConnection {
  private bot: TelegramBot | null = null;
  private config: TelegramServiceConfig;
  private logger = pino({ level: "info" });
  private isConnected = false;
  constructor(config: TelegramServiceConfig) {
    this.config = config;
  }
  async connect(): Promise<TelegramBot> {
    try {
      this.logger.info("Connecting to Telegram...");
      this.bot = new TelegramBot(this.config.botToken, {
        polling: {
          interval: 300,
          autoStart: true,
          params: {
            timeout: 10,
          },
        },
      });
      const botInfo = await this.bot.getMe();
      this.logger.info(
        { username: botInfo.username, id: botInfo.id },
        "✅ Telegram bot connected",
      );
      this.isConnected = true;
      this.config.onConnectionUpdate?.(true);
      this.bot.on("polling_error", (error) => {
        this.logger.error({ error }, "Telegram polling error");
      });
      this.bot.on("webhook_error", (error) => {
        this.logger.error({ error }, "Telegram webhook error");
      });
      return this.bot;
    } catch (error) {
      this.logger.error({ error }, "Failed to connect to Telegram");
      this.isConnected = false;
      this.config.onConnectionUpdate?.(false);
      throw error;
    }
  }
  getBot(): TelegramBot | null {
    return this.bot;
  }
  isConnectedStatus(): boolean {
    return this.isConnected && this.bot !== null;
  }
  async disconnect(): Promise<void> {
    if (this.bot) {
      try {
        await this.bot.stopPolling();
        this.bot = null;
        this.isConnected = false;
        this.logger.info("Telegram bot disconnected");
        this.config.onConnectionUpdate?.(false);
      } catch (error) {
        this.logger.error({ error }, "Error disconnecting Telegram bot");
      }
    }
  }
}
