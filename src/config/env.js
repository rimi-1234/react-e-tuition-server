import 'dotenv/config';
import { z } from 'zod';

/**
 * Every environment variable the API reads is declared and validated here.
 * The process fails fast on a malformed value instead of misbehaving later.
 * Optional integrations (Firebase, Stripe) degrade gracefully when absent.
 */
const csv = z
  .string()
  .optional()
  .transform((value) =>
    (value || '')
      .split(',')
      .map((item) => item.trim().replace(/\/$/, ''))
      .filter(Boolean),
  );

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  // Either a full connection string, or the legacy user/pass pair.
  MONGODB_URI: z.string().optional(),
  MONGO_USER: z.string().optional(),
  MONGO_PASS: z.string().optional(),
  MONGO_CLUSTER: z.string().default('cluster0.dw7x2dn.mongodb.net'),
  DB_NAME: z.string().default('etuition_db'),

  FB_SERVICE_KEY: z.string().optional(),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  PAYMENT_CURRENCY: z.string().default('bdt'),
  PLATFORM_FEE_PERCENT: z.coerce.number().min(0).max(50).default(10),

  CLIENT_URL: z.string().default('http://localhost:5173').transform((v) => v.replace(/\/$/, '')),
  CORS_ORIGINS: csv,

  CACHE_TTL_SECONDS: z.coerce.number().int().nonnegative().default(60),
  CACHE_MAX_ENTRIES: z.coerce.number().int().positive().default(500),

  RATE_LIMIT_WINDOW_MIN: z.coerce.number().positive().default(15),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(600),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // Node on some Windows setups cannot resolve Atlas SRV records with the OS resolver.
  DNS_SERVERS: csv,
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

const raw = parsed.data;

const mongoUri =
  raw.MONGODB_URI ||
  (raw.MONGO_USER && raw.MONGO_PASS
    ? `mongodb+srv://${encodeURIComponent(raw.MONGO_USER)}:${encodeURIComponent(raw.MONGO_PASS)}@${raw.MONGO_CLUSTER}/?retryWrites=true&w=majority&appName=Edurock`
    : '');

export const env = Object.freeze({
  ...raw,
  isProd: raw.NODE_ENV === 'production',
  isDev: raw.NODE_ENV === 'development',
  isTest: raw.NODE_ENV === 'test',
  isServerless: Boolean(process.env.VERCEL),
  mongoUri,
  allowedOrigins: [
    ...new Set([
      raw.CLIENT_URL,
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:4173',
      'https://react-e-tuition-client.vercel.app',
      'https://react-e-tution-session-client.vercel.app',
      'https://react-e-tuition-session-client.vercel.app',
      ...raw.CORS_ORIGINS,
    ]),
  ],
});
