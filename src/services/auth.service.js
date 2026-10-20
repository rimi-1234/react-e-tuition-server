import { DEMO_ACCOUNTS, ROLES } from '../config/constants.js';
import { firebaseAuth, isFirebaseReady } from '../config/firebase.js';
import { forgetUser } from '../middlewares/auth.js';
import { User } from '../models/index.js';
import { serialize } from '../models/plugins.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Creates or refreshes the Mongo profile for a verified Firebase identity.
 * Identity (uid, email) always comes from the verified token, never the body.
 * The requested role is honoured only when the account is first created, and
 * only for self-assignable roles (Admin is rejected by the validator).
 */
export async function syncUser(auth, body) {
  if (!auth.email) throw ApiError.badRequest('Your sign-in provider did not share an email address');

  const existing = await User.findOne({ $or: [{ uid: auth.uid }, { email: auth.email }] });

  if (existing) {
    existing.uid ||= auth.uid;
    if (body.displayName && !existing.displayName) existing.displayName = body.displayName;
    if (body.photoURL && !existing.photoURL) existing.photoURL = body.photoURL;
    if (body.phone && !existing.phone) existing.phone = body.phone;
    existing.lastLoginAt = new Date();
    await existing.save();
    forgetUser(auth.uid);
    return { user: existing.toJSON(), isNew: false };
  }

  const user = await User.create({
    uid: auth.uid,
    email: auth.email,
    displayName: body.displayName || auth.name || auth.email.split('@')[0],
    photoURL: body.photoURL || auth.picture || '',
    phone: body.phone || '',
    role: body.role || ROLES.STUDENT,
    lastLoginAt: new Date(),
  });
  forgetUser(auth.uid); // a null "not registered yet" lookup may be cached
  return { user: user.toJSON(), isNew: true };
}

export const me = (user) => serialize(user);

/** Issues a short-lived Firebase custom token for one of the seeded demo accounts. */
export async function demoLogin(role) {
  if (!isFirebaseReady()) throw ApiError.unavailable('Authentication service is not configured');
  const email = DEMO_ACCOUNTS[role];
  try {
    const fbUser = await firebaseAuth().getUserByEmail(email);
    const token = await firebaseAuth().createCustomToken(fbUser.uid, { demo: true });
    return { token, email, role };
  } catch (error) {
    if (error?.code === 'auth/user-not-found') {
      throw ApiError.notFound('Demo account (run `npm run seed` on the backend)');
    }
    throw error;
  }
}
