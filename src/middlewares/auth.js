import { firebaseAuth, isFirebaseReady } from '../config/firebase.js';
import { User } from '../models/index.js';
import { NS, cache } from '../services/cache.service.js';
import { ApiError } from '../utils/ApiError.js';

const USER_CACHE_TTL = 60; // seconds; role changes invalidate explicitly

const bearer = (req) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
};

/**
 * Token verification is injectable so integration tests can run without a
 * Firebase project. Production code never calls setTokenVerifier().
 */
let verifyToken = (token) => firebaseAuth().verifyIdToken(token);
let verifierReady = isFirebaseReady;
export function setTokenVerifier(fn) {
  verifyToken = fn;
  verifierReady = () => true;
}

async function decode(token) {
  if (!verifierReady()) throw ApiError.unavailable('Authentication service is not configured');
  try {
    // checkRevoked=false keeps this a local signature check (no network round-trip).
    return await verifyToken(token);
  } catch {
    throw ApiError.unauthorized('Your session has expired. Please sign in again.');
  }
}

/** Loads the Mongo user for a Firebase identity, cached briefly by uid. */
export const loadUser = (decoded) =>
  cache.wrap(
    NS.USERS,
    decoded.uid,
    async () => {
      const user =
        (await User.findOne({ uid: decoded.uid }).lean()) ||
        (decoded.email && (await User.findOne({ email: decoded.email.toLowerCase() }).lean()));
      return user || null;
    },
    USER_CACHE_TTL,
  );

/** Forget a cached auth lookup after the user's role/profile/status changes. */
export const forgetUser = (uid) => uid && cache.delete(NS.USERS, uid);

/**
 * Requires a valid Firebase ID token.
 *   req.auth = { uid, email }   (always)
 *   req.user = Mongo user       (unless { requireProfile: false } and none exists yet)
 */
export const authenticate =
  ({ requireProfile = true } = {}) =>
  async (req, _res, next) => {
    const token = bearer(req);
    if (!token) throw ApiError.unauthorized();

    const decoded = await decode(token);
    req.auth = { uid: decoded.uid, email: decoded.email?.toLowerCase(), name: decoded.name, picture: decoded.picture };

    const user = await loadUser(decoded);
    if (user && !user.isActive) throw ApiError.forbidden('Your account has been suspended. Contact support.');
    if (!user && requireProfile) throw ApiError.forbidden('Please finish creating your account first.');
    req.user = user;
    next();
  };

/** Attaches req.user when a valid token is present; never rejects. */
export const optionalAuth = async (req, _res, next) => {
  const token = bearer(req);
  if (!token || !verifierReady()) return next();
  try {
    const decoded = await verifyToken(token);
    req.auth = { uid: decoded.uid, email: decoded.email?.toLowerCase() };
    req.user = await loadUser(decoded);
  } catch {
    /* anonymous */
  }
  next();
};

/** Role gate; must run after authenticate(). */
export const authorize =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw ApiError.forbidden(`This action is only available to ${roles.join(' or ')} accounts`);
    }
    next();
  };
