import admin from 'firebase-admin';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

/** Accepts the service account as raw JSON or base64-encoded JSON. */
function parseServiceKey(raw) {
  const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  return JSON.parse(text);
}

function init() {
  if (admin.apps.length) return admin;
  if (!env.FB_SERVICE_KEY) {
    logger.warn('FB_SERVICE_KEY is not set; authenticated routes will respond 503');
    return null;
  }
  try {
    admin.initializeApp({ credential: admin.credential.cert(parseServiceKey(env.FB_SERVICE_KEY)) });
    return admin;
  } catch (error) {
    logger.error({ err: error }, 'Failed to initialise Firebase Admin');
    return null;
  }
}

export const firebase = init();
export const isFirebaseReady = () => Boolean(firebase && admin.apps.length);
export const firebaseAuth = () => admin.auth();
