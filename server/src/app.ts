import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { config } from "./config/env";
import { globalErrorHandler } from "./utils/error-handler";
import {
  validateBody,
  whatsappMessageSchema,
  rateLimitByUser,
} from "./middleware/validation";
import { registerNotificationRoutes } from "./controllers/notification-controller";
import { getWhatsAppManager } from "./services/runtime";
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.server.nodeEnv === "production" ? "info" : "debug",
      transport:
        config.server.nodeEnv === "development"
          ? {
              target: "pino-pretty",
              options: {
                colorize: true,
                translateTime: "HH:MM:ss Z",
                ignore: "pid,hostname",
              },
            }
          : undefined,
    },
  });
  await app.register(helmet, {
    contentSecurityPolicy: false,
  });
  await app.register(cors, {
    origin: true,
    credentials: true,
  });
  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });
  app.get("/health", async () => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  });
  app.get("/api/v1", async () => {
    return {
      message: "Memorae Clone API",
      version: "1.0.0",
      endpoints: {
        health: "/health",
        api: "/api/v1",
      },
    };
  });
  app.post(
    "/api/v1/whatsapp/send",
    {
      preHandler: [
        rateLimitByUser(30, 60000),
        validateBody(whatsappMessageSchema),
      ],
    },
    async (_request, reply) => {
      return reply.send({
        success: true,
        message: "Message queued for sending",
      });
    },
  );
  app.get("/api/v1/whatsapp/status", async () => {
    const manager = getWhatsAppManager();
    const connected = manager ? manager.isConnected() : false;
    return {
      connected,
      timestamp: new Date().toISOString(),
      schedulerRunning: manager ? manager.isSchedulerRunning() : false,
    };
  });
  await registerNotificationRoutes(app);
  app.setErrorHandler(globalErrorHandler);
  return app;
}
