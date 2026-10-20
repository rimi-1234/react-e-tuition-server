import mongoose from 'mongoose';
import { CLASS_LEVELS, EXPERIENCE_LEVELS, TEACHING_MODES, TUTOR_PREFERENCES } from '../config/constants.js';
import { connectDB, dbState } from '../config/db.js';
import { isFirebaseReady } from '../config/firebase.js';
import { isStripeReady } from '../config/stripe.js';
import { cache } from '../services/cache.service.js';
import * as statsService from '../services/stats.service.js';
import { ok } from '../utils/response.js';

const startedAt = Date.now();

export async function health(_req, res) {
  let healthy = false;
  try {
    await connectDB();
    healthy = Boolean(await mongoose.connection.db?.admin().ping());
  } catch {
    /* reported as degraded */
  }
  res.setHeader('Cache-Control', 'no-store');
  res.status(healthy ? 200 : 503).json({
    success: healthy,
    status: healthy ? 'ok' : 'degraded',
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    services: {
      database: dbState(),
      auth: isFirebaseReady() ? 'ready' : 'not-configured',
      payments: isStripeReady() ? 'ready' : 'not-configured',
    },
    cache: cache.stats(),
  });
}

export async function stats(_req, res) {
  ok(res, await statsService.publicStats());
}

export async function subjects(_req, res) {
  ok(res, await statsService.subjects());
}

export async function locations(_req, res) {
  ok(res, await statsService.locations());
}

/** Option lists, so the client never hard-codes enums the API validates. */
export function options(_req, res) {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  ok(res, {
    classLevels: CLASS_LEVELS,
    teachingModes: TEACHING_MODES,
    tutorPreferences: TUTOR_PREFERENCES,
    experienceLevels: EXPERIENCE_LEVELS,
  });
}
