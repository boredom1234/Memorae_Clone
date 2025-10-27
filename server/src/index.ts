import "dotenv/config";
import { buildApp } from "./app";
import { config } from "./config/env";
import { WhatsAppManager } from "./services/whatsapp-manager";
import { TelegramManager } from "./services/telegram-manager";
import { ReminderCleanupService } from "./services/reminder-cleanup.service";
import { setWhatsAppManager, setTelegramManager } from "./services/runtime";
async function start() {
  let whatsappManager: WhatsAppManager | null = null;
  let telegramManager: TelegramManager | null = null;
  let cleanupService: ReminderCleanupService | null = null;
  try {
    const app = await buildApp();
    await app.listen({
      port: config.server.port,
      host: config.server.host,
    });
    app.log.info(
      `🚀 Server running at http://${config.server.host}:${config.server.port}`,
    );
    const platform = config.messaging.platform;
    app.log.info(`📱 Messaging platform mode: ${platform}`);
    if (platform === "whatsapp" || platform === "both") {
      app.log.info("📱 Initializing WhatsApp...");
      whatsappManager = new WhatsAppManager();
      await whatsappManager.initialize();
      setWhatsAppManager(whatsappManager);
      app.log.info("✅ WhatsApp initialized");
    }
    if (platform === "telegram" || platform === "both") {
      app.log.info("🤖 Initializing Telegram...");
      telegramManager = new TelegramManager();
      await telegramManager.initialize();
      setTelegramManager(telegramManager);
      app.log.info("✅ Telegram initialized");
    }
    
    // Start reminder cleanup service (runs every 3 seconds)
    app.log.info("🧹 Starting reminder cleanup service...");
    cleanupService = new ReminderCleanupService();
    cleanupService.start();
    app.log.info("✅ Reminder cleanup service started");
    
    const signals = ["SIGINT", "SIGTERM"];
    signals.forEach((signal) => {
      process.on(signal, async () => {
        if (cleanupService) {
          app.log.info("Shutting down reminder cleanup service...");
          cleanupService.stop();
        }
        if (whatsappManager) {
          app.log.info("Shutting down WhatsApp...");
          await whatsappManager.shutdown();
        }
        if (telegramManager) {
          app.log.info("Shutting down Telegram...");
          await telegramManager.shutdown();
        }
        await app.close();
        process.exit(0);
      });
    });
  } catch (error) {
    console.error("Error starting server:", error);
    if (cleanupService) {
      cleanupService.stop();
    }
    if (whatsappManager) {
      await whatsappManager.shutdown();
    }
    if (telegramManager) {
      await telegramManager.shutdown();
    }
    process.exit(1);
  }
}
start();
