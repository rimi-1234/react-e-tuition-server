import { createApp } from './app.js';
import { connectDB, disconnectDB } from './config/db.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';

const app = createApp();

async function start() {
  try {
    await connectDB();
  } catch (error) {
    // Keep serving: /health reports "degraded" and API routes retry the connection per request.
    logger.error({ err: error }, 'Initial MongoDB connection failed');
  }

  const server = app.listen(env.PORT, () => {
    logger.info(`Edurock API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });

  // Render sends SIGTERM on deploys and free-tier spin-down: finish in-flight requests first.
  const shutdown = (signal) => {
    logger.info({ signal }, 'Shutting down gracefully');
    server.close(async () => {
      await disconnectDB().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

process.on('unhandledRejection', (reason) => logger.error({ err: reason }, 'Unhandled promise rejection'));
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception');
  process.exit(1);
});

start();

export default app;
