import Fastify, { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import dotenv from 'dotenv';
import { connect } from './db';
import { routes } from './routes';

dotenv.config();

export interface BuildAppOptions {
  dbUri?: string;
  dbName?: string;
  enableRateLimit?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
  });

  // Connect to database (injectable URI/name for tests)
  await connect(options.dbUri, options.dbName);

  // Rate limiting: 60 requests/min per IP
  if (options.enableRateLimit !== false) {
    await app.register(rateLimit, {
      max: 60,
      timeWindow: '1 minute',
    });
  }

  // Register API routes
  await app.register(routes);

  // Custom 404 handler (JSON only)
  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({
      error: 'Not Found',
      statusCode: 404,
    });
  });

  // Global error handler (JSON only, no stack traces leaked)
  app.setErrorHandler((error: any, _request, reply) => {
    const statusCode = error?.statusCode || 500;
    reply.status(statusCode).send({
      error: error?.message || 'Internal Server Error',
      statusCode,
    });
  });

  return app;
}

async function start() {
  const port = parseInt(process.env.PORT || '3001', 10);
  try {
    const app = await buildApp();
    await app.listen({ port, host: '0.0.0.0' });
    console.log(`Backend API running on http://localhost:${port}`);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

// Start if executed directly
if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  start();
}
