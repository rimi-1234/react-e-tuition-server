import { APPLICATION_STATUS, NOTIFICATION_TYPES, ROLES, TUITION_STATUS } from '../config/constants.js';
import { firebaseAuth, isFirebaseReady } from '../config/firebase.js';
import { forgetUser } from '../middlewares/auth.js';
import { Application, Bookmark, Notification, Tuition, User } from '../models/index.js';
import { serialize } from '../models/plugins.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { compact, contains, pageMeta } from '../utils/query.js';
import { NS, cache } from './cache.service.js';
import { notify } from './notification.service.js';
import { profileStats } from './stats.service.js';

const TUTOR_ONLY_FIELDS = ['subjects', 'experienceYears', 'qualification', 'institution', 'expectedSalary', 'teachingMode'];

/* ── Self-service profile ────────────────────────────────────────── */

export async function getProfile(user) {
  const stats = await profileStats(user);
  return { ...serialize(user), stats };
}

export async function updateProfile(user, body) {
  const update = { ...body };
  if (user.role !== ROLES.TUTOR) TUTOR_ONLY_FIELDS.forEach((f) => delete update[f]);
  if (update.subjects) update.subjects = [...new Set(update.subjects.map((s) => s.trim()).filter(Boolean))];

  const doc = await User.findByIdAndUpdate(user._id, { $set: update }, { returnDocument: 'after', runValidators: true }).lean();
  forgetUser(user.uid);

  // Keep the name/photo snapshot on open applications current.
  if (user.role === ROLES.TUTOR && (update.displayName || update.photoURL !== undefined)) {
    await Application.updateMany(
      { tutor: user._id, status: APPLICATION_STATUS.PENDING },
      { $set: compact({ tutorName: update.displayName, tutorPhoto: update.photoURL }) },
    );
    cache.invalidate(NS.TUTORS);
  }
  return serialize(doc);
}

/* ── Admin user management ───────────────────────────────────────── */

export async function list({ search, role, page, limit }) {
  const filter = compact({ role });
  if (search) {
    const rx = contains(search);
    filter.$or = [{ displayName: rx }, { email: rx }, { phone: rx }];
  }
  const [items, total, roleCounts] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    User.countDocuments(filter),
    User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
  ]);
  return {
    items: serialize(items),
    meta: {
      ...pageMeta({ page, limit, total }),
      roles: Object.fromEntries(roleCounts.map((r) => [r._id, r.count])),
    },
  };
}

async function findTarget(admin, id, action) {
  const target = await User.findById(id);
  if (!target) throw ApiError.notFound('User');
  if (String(target._id) === String(admin._id)) throw ApiError.badRequest(`You cannot ${action} your own account`);
  return target;
}

const afterChange = (target) => {
  forgetUser(target.uid);
  cache.invalidate(NS.TUTORS, NS.STATS);
};

export async function changeRole(admin, id, role) {
  const target = await findTarget(admin, id, 'change the role of');
  if (target.role === role) return target.toJSON();
  target.role = role;
  if (role !== ROLES.TUTOR) target.verified = false;
  await target.save();
  afterChange(target);
  notify(target._id, NOTIFICATION_TYPES.ROLE_CHANGED, `Your account role is now ${role}.`, '/dashboard');
  return target.toJSON();
}

export async function setVerified(id, verified) {
  const target = await User.findById(id);
  if (!target) throw ApiError.notFound('User');
  if (target.role !== ROLES.TUTOR) throw ApiError.badRequest('Only tutors can be verified');
  target.verified = verified;
  target.verifiedAt = verified ? new Date() : null;
  await target.save();
  afterChange(target);
  if (verified) {
    notify(target._id, NOTIFICATION_TYPES.VERIFIED, 'Your tutor profile is verified. The badge now shows on your profile.', '/profile');
  }
  return target.toJSON();
}

export async function setActive(admin, id, isActive) {
  const target = await findTarget(admin, id, 'suspend');
  target.isActive = isActive;
  await target.save();
  afterChange(target);
  return target.toJSON();
}

export async function adminUpdate(id, body) {
  const doc = await User.findByIdAndUpdate(id, { $set: body }, { returnDocument: 'after', runValidators: true });
  if (!doc) throw ApiError.notFound('User');
  afterChange(doc);
  return doc.toJSON();
}

export async function remove(admin, id) {
  const target = await findTarget(admin, id, 'delete');

  // Payments and reviews are kept as financial / public records.
  await Promise.all([
    Bookmark.deleteMany({ user: target._id }),
    Notification.deleteMany({ recipient: target._id }),
    Application.deleteMany({ tutor: target._id, status: APPLICATION_STATUS.PENDING }),
    Tuition.deleteMany({ student: target._id, status: { $ne: TUITION_STATUS.BOOKED } }),
  ]);
  await target.deleteOne();
  afterChange(target);
  cache.invalidate(NS.TUITIONS, NS.META);

  if (target.uid && isFirebaseReady()) {
    firebaseAuth()
      .deleteUser(target.uid)
      .catch((err) => logger.warn({ err, uid: target.uid }, 'Could not delete Firebase user'));
  }
}
