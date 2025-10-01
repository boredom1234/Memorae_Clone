import 'dotenv/config';
import { buildApp } from "./app";
import { config } from "./config/env";
import { WhatsAppManager } from "./services/whatsapp-manager";

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
    app.log.info(`📝 Environment: ${config.server.nodeEnv}`);
    app.log.info(
      `🏥 Health check: http://${config.server.host}:${config.server.port}/health`,
    );

    // Initialize WhatsApp
    app.log.info("📱 Initializing WhatsApp...");
    whatsappManager = new WhatsAppManager();
    await whatsappManager.initialize();

    // Graceful shutdown
    const signals = ["SIGINT", "SIGTERM"];
    signals.forEach((signal) => {
      process.on(signal, async () => {
        app.log.info(`Received ${signal}, closing server gracefully...`);

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
