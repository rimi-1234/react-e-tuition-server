import dns from 'node:dns';
import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

// Atlas SRV lookups fail on some Windows resolvers; public DNS fixes it locally.
const dnsServers = env.DNS_SERVERS.length ? env.DNS_SERVERS : env.isDev ? ['8.8.8.8', '1.1.1.1'] : [];
if (dnsServers.length) dns.setServers(dnsServers);

// Unknown filter keys are dropped. Operator injection is blocked earlier:
// every input passes a Zod schema and the sanitize middleware strips `$` keys.
mongoose.set('strictQuery', true);

/**
 * The connection promise is cached on globalThis so serverless invocations
 * that reuse a warm container also reuse the socket pool.
 */
const cache = (globalThis.__edurockMongo ??= { promise: null });

export function connectDB() {
  if (mongoose.connection.readyState === 1) return Promise.resolve(mongoose.connection);
  if (cache.promise) return cache.promise;

  if (!env.mongoUri) {
    return Promise.reject(new Error('MongoDB is not configured. Set MONGODB_URI or MONGO_USER/MONGO_PASS.'));
  }

  cache.promise = mongoose
    .connect(env.mongoUri, {
      dbName: env.DB_NAME,
      maxPoolSize: env.isServerless ? 5 : 20,
      serverSelectionTimeoutMS: 10_000,
      autoIndex: !env.isProd,
    })
    .then((instance) => {
      logger.info({ db: env.DB_NAME }, 'MongoDB connected');
      return instance.connection;
    })
    .catch((error) => {
      cache.promise = null;
      throw error;
    });

  return cache.promise;
}

export async function disconnectDB() {
  cache.promise = null;
  await mongoose.disconnect();
}

export const dbState = () =>
  ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] ?? 'unknown';

/**
 * Runs `work(session)` inside a transaction when the deployment supports it
 * (Atlas replica sets do), and falls back to a plain session on standalone servers.
 */
export async function withTransaction(work) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } catch (error) {
    if (/Transaction numbers are only allowed|replica set/i.test(error?.message || '')) {
      logger.warn('Transactions unsupported on this MongoDB deployment; running without one');
      return work(undefined);
    }
    throw error;
  } finally {
    await session.endSession();
  }
}
