import { buildApp } from './app';
import { config } from './config/env';

async function start() {
  try {
    const app = await buildApp();

    await app.listen({
      port: config.server.port,
      host: config.server.host,
    });

    app.log.info(`🚀 Server running at http://${config.server.host}:${config.server.port}`);
    app.log.info(`📝 Environment: ${config.server.nodeEnv}`);
    app.log.info(`🏥 Health check: http://${config.server.host}:${config.server.port}/health`);

    // Graceful shutdown
    const signals = ['SIGINT', 'SIGTERM'];
    signals.forEach((signal) => {
      process.on(signal, async () => {
        app.log.info(`Received ${signal}, closing server gracefully...`);
        await app.close();
        process.exit(0);
      });
    });
  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
}

start();
