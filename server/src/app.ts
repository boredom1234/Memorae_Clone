import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { globalErrorHandler } from "./utils/error-handler";
import {
  validateBody,
  whatsappMessageSchema,
  rateLimitByUser,
} from "./middleware/validation";
import { registerNotificationRoutes } from "./controllers/notification-controller";
import { getWhatsAppManager } from "./services/runtime";
const isProd = process.env.NODE_ENV === "production";
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || (isProd ? "info" : "debug"),
      base: { service: "memorae-server" },
      redact: {
        paths: [
          "*.password",
          "*.token",
          "*.accessToken",
          "*.refreshToken",
          "*.apiKey",
          "headers.authorization",
          "req.headers.authorization",
          "request.headers.authorization",
          "config.ai.*ApiKey",
          "config.*.*ApiKey",
          "process.env.*_KEY",
          "process.env.*_TOKEN",
        ],
        censor: "[REDACTED]",
      },
      transport: !isProd
        ? {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "UTC:yyyy-mm-dd'T'HH:MM:ss.l'Z'",
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
