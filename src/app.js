import compression from 'compression';
import express from 'express';
import { pinoHttp } from 'pino-http';
import { connectDB } from './config/db.js';
import { env } from './config/env.js';
import * as meta from './controllers/meta.controller.js';
import { errorHandler, notFound } from './middlewares/error.js';
import { corsMiddleware, globalLimiter, helmetMiddleware, requestId, sanitizeBody } from './middlewares/security.js';
import { v1 } from './routes/index.js';
import { ApiError } from './utils/ApiError.js';
import { stripeWebhookRouter } from './routes/payment.routes.js';
import { logger } from './utils/logger.js';

export function createApp() {
  const app = express();

  // Render / Vercel sit behind one proxy hop; needed for correct client IPs in rate limiting.
  app.set('trust proxy', 1);
  app.set('etag', 'weak');
  app.disable('x-powered-by');

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.id,
      autoLogging: { ignore: (req) => req.url === '/health' },
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(helmetMiddleware);
  app.use(corsMiddleware);
  app.use(compression({ threshold: 1024 }));

  app.get('/', (_req, res) => res.json({ success: true, name: 'Edurock API', version: 'v1', docs: '/api/v1' }));
  app.get('/health', meta.health);

  // Ensure the database is connected before any API route runs (no-op once connected).
  app.use('/api', async (req, _res, next) => {
    try {
      await connectDB();
    } catch (error) {
      req.log?.error({ err: error }, 'Database connection failed');
      throw ApiError.unavailable('Database is temporarily unavailable. Please try again in a moment.');
    }
    next();
  });

  // Raw body required for Stripe signature verification: mount before express.json().
  app.use('/api/v1/payments/webhook', stripeWebhookRouter);

  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(sanitizeBody);
  app.use('/api', globalLimiter);

  app.use('/api/v1', v1);

  app.use(notFound);
  app.use(errorHandler);

  if (env.isDev) logger.debug({ origins: env.allowedOrigins }, 'CORS origins');
  return app;
}
