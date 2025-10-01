import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { config } from './config/env';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.server.nodeEnv === 'production' ? 'info' : 'debug',
      transport:
        config.server.nodeEnv === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
              },
            }
          : undefined,
    },
  });

  // Register plugins
  await app.register(helmet, {
    contentSecurityPolicy: false,
  });

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // Health check route
  app.get('/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  });

  // API routes
  app.get('/api/v1', async () => {
    return {
      message: 'Memorae Clone API',
      version: '1.0.0',
      endpoints: {
        health: '/health',
        api: '/api/v1',
      },
    };
  });

  // WhatsApp routes
  app.post('/api/v1/whatsapp/send', async (request, reply) => {
    const { to, message } = request.body as { to: string; message: string };
    
    if (!to || !message) {
      return reply.status(400).send({ error: 'Missing required fields: to, message' });
    }

    // This will be implemented when WhatsApp manager is integrated
    return reply.send({ success: true, message: 'Message queued for sending' });
  });

  app.get('/api/v1/whatsapp/status', async () => {
    return {
      connected: false, // Will be updated with actual status
      timestamp: new Date().toISOString(),
    };
  });

  // Error handler
  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    reply.status(error.statusCode || 500).send({
      error: error.message || 'Internal Server Error',
      statusCode: error.statusCode || 500,
    });
  });

  return app;
}
