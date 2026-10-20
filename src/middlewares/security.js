import { randomUUID } from 'node:crypto';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

export const helmetMiddleware = helmet({
  // Pure JSON API: no HTML is served, so a locked-down CSP is safe.
  contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
});

/** Vercel production + preview URLs for the Edurock client (both spellings of "tuition"). */
const VERCEL_CLIENT = /^https:\/\/react-e-(?:tuition|tution)(?:-session)?-client[\w.-]*\.vercel\.app$/i;

export function isAllowedOrigin(origin) {
  if (!origin) return true;
  const normalized = origin.replace(/\/$/, '');
  if (env.allowedOrigins.includes(normalized)) return true;
  if (VERCEL_CLIENT.test(normalized)) return true;
  return false;
}

export const corsMiddleware = cors({
  origin(origin, callback) {
    // Same-origin / server-to-server calls have no Origin header.
    if (isAllowedOrigin(origin)) return callback(null, true);
    callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Chat-Token'],
  exposedHeaders: ['X-Request-Id', 'X-Cache', 'RateLimit-Remaining'],
  maxAge: 600,
});

/** Correlation id for logs and error reports; honours an inbound X-Request-Id. */
export const requestId = (req, res, next) => {
  const incoming = req.headers['x-request-id'];
  req.id = typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
};

/**
 * Removes keys that start with `$` or contain `.` from request bodies, so a
 * payload like { "email": { "$ne": null } } can never reach a Mongo query.
 * (express-mongo-sanitize is incompatible with Express 5's read-only req.query;
 * query strings are covered by strict Zod schemas instead.)
 */
export const sanitizeBody = (req, _res, next) => {
  const clean = (value, depth = 0) => {
    if (depth > 10) throw ApiError.badRequest('Payload is nested too deeply');
    if (Array.isArray(value)) return value.map((v) => clean(v, depth + 1));
    if (value && typeof value === 'object') {
      for (const key of Object.keys(value)) {
        if (key.startsWith('$') || key.includes('.') || key === '__proto__' || key === 'constructor') delete value[key];
        else value[key] = clean(value[key], depth + 1);
      }
    }
    return value;
  };
  if (req.body && typeof req.body === 'object') req.body = clean(req.body);
  next();
};

const limiter = (options) =>
  rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MIN * 60 * 1000,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => env.isTest,
    handler: (_req, _res, next, opts) =>
      next(new ApiError(429, opts.message || 'Too many requests. Please slow down and try again shortly.', { code: 'RATE_LIMITED' })),
    ...options,
  });

/** Broad per-IP ceiling across the whole API. */
export const globalLimiter = limiter({ limit: env.RATE_LIMIT_MAX });

/** Tighter limits for endpoints attractive to abuse. */
export const authLimiter = limiter({ limit: 30, message: 'Too many sign-in attempts. Please wait a few minutes.' });
export const writeLimiter = limiter({ windowMs: 60 * 1000, limit: 30 });
export const chatStartLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 10, message: 'Too many new chats from this network. Please try again later.' });
export const chatMessageLimiter = limiter({ windowMs: 60 * 1000, limit: 20, message: 'You are sending messages too quickly. Please slow down.' });
export const contactLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 5, message: 'You have sent several messages already. Please try again later.' });
