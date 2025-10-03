import "dotenv/config";
import { buildApp } from "./app";
import { config } from "./config/env";
import { WhatsAppManager } from "./services/whatsapp-manager";
import { setWhatsAppManager } from "./services/runtime";

async function start() {
  let whatsappManager: WhatsAppManager | null = null;

  try {
    const app = await buildApp();

    await app.listen({
      port: config.server.port,
      host: config.server.host,
    });

    app.log.info(
      `🚀 Server running at http://${config.server.host}:${config.server.port}`,
    );

    // Initialize WhatsApp
    app.log.info("\ud83d\udcf1 Initializing WhatsApp...");
    whatsappManager = new WhatsAppManager();
    await whatsappManager.initialize();
    // Expose manager for other services
    setWhatsAppManager(whatsappManager);

    // Graceful shutdown
    const signals = ["SIGINT", "SIGTERM"];
    signals.forEach((signal) => {
      process.on(signal, async () => {
        if (whatsappManager) {
          await whatsappManager.shutdown();
        }

        await app.close();
        process.exit(0);
      });
    });
  } catch (error) {
    console.error("Error starting server:", error);

    if (whatsappManager) {
      await whatsappManager.shutdown();
    }

    process.exit(1);
  }
}

start();
