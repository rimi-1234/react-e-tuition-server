import { APPLICATION_STATUS, NOTIFICATION_TYPES, ROLES, TUITION_STATUS } from '../config/constants.js';
import { Application, Bookmark, Tuition } from '../models/index.js';
import { serialize } from '../models/plugins.js';
import { SORTS } from '../validators/tuition.validator.js';
import { ApiError } from '../utils/ApiError.js';
import { compact, contains, pageMeta } from '../utils/query.js';
import { NS, cache } from './cache.service.js';
import { notify, notifyAdmins } from './notification.service.js';

const invalidate = () => cache.invalidate(NS.TUITIONS, NS.META, NS.STATS);

/** Translates validated list filters into a Mongo filter. */
function buildFilter({ search, subject, location, classLevel, teachingMode, minBudget, maxBudget, status }) {
  const filter = compact({
    status,
    subject: contains(subject),
    location: contains(location),
    classLevel,
    teachingMode: teachingMode && teachingMode !== 'Both' ? { $in: [teachingMode, 'Both'] } : teachingMode,
  });
  if (minBudget !== undefined || maxBudget !== undefined) {
    filter.budget = compact({ $gte: minBudget, $lte: maxBudget });
  }
  if (search) {
    const rx = contains(search);
    filter.$or = [{ title: rx }, { subject: rx }, { location: rx }, { classLevel: rx }];
  }
  return filter;
}

async function paginate(filter, { page, limit, sort = 'newest' }, projection = '') {
  const [items, total] = await Promise.all([
    Tuition.find(filter)
      .select(projection)
      .sort(SORTS[sort] || SORTS.newest)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Tuition.countDocuments(filter),
  ]);
  return { items: serialize(items), meta: pageMeta({ page, limit, total }) };
}

// Public views never include who posted the tuition (privacy): only owners and admins see that.
const POSTER_FIELDS = ['studentEmail', 'studentName', 'studentPhoto'];
const LIST_PROJECTION = '-rejectionReason -views -studentEmail -studentName -studentPhoto';
const stripPoster = (doc) => {
  const copy = { ...doc };
  POSTER_FIELDS.forEach((f) => delete copy[f]);
  return copy;
};

/** Public feed: approved tuitions only. */
export const listPublic = (query) =>
  paginate(buildFilter({ ...query, status: TUITION_STATUS.APPROVED }), query, LIST_PROJECTION);

export const listForAdmin = (query) => paginate(buildFilter(query), query);

export async function latest(limit) {
  const items = await Tuition.find({ status: TUITION_STATUS.APPROVED })
    .select(LIST_PROJECTION)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
  return serialize(items);
}

export const listMine = (user, query) =>
  paginate(compact({ student: user._id, status: query.status }), { ...query, sort: 'newest' });

const canSeeUnpublished = (tuition, viewer) =>
  viewer && (viewer.role === ROLES.ADMIN || String(tuition.student) === String(viewer._id));

export async function getById(id, viewer) {
  const tuition = await Tuition.findById(id).lean();
  if (!tuition) throw ApiError.notFound('Tuition');

  const isPublic = [TUITION_STATUS.APPROVED, TUITION_STATUS.BOOKED].includes(tuition.status);
  if (!isPublic && !canSeeUnpublished(tuition, viewer)) throw ApiError.notFound('Tuition');

  const isOwner = viewer && String(tuition.student) === String(viewer._id);
  if (!isOwner) {
    // Fire-and-forget counter; never blocks or fails the read.
    Tuition.updateOne({ _id: id }, { $inc: { views: 1 } }).catch(() => {});
  }

  const similar = await Tuition.find({
    _id: { $ne: tuition._id },
    status: TUITION_STATUS.APPROVED,
    $or: [{ subject: tuition.subject }, { classLevel: tuition.classLevel }],
  })
    .select(LIST_PROJECTION)
    .sort({ createdAt: -1 })
    .limit(3)
    .lean();

  const visible = canSeeUnpublished(tuition, viewer) ? tuition : stripPoster(tuition);
  return { ...serialize(visible), similar: serialize(similar) };
}

export async function create(user, body) {
  const tuition = await Tuition.create({
    ...body,
    student: user._id,
    studentEmail: user.email,
    studentName: user.displayName,
    studentPhoto: user.photoURL,
    status: TUITION_STATUS.PENDING,
  });
  invalidate();
  notifyAdmins(
    NOTIFICATION_TYPES.TUITION_SUBMITTED,
    `New tuition "${tuition.title}" is waiting for review.`,
    '/dashboard/admin/tuitions',
  );
  return tuition.toJSON();
}

async function findOwned(user, id) {
  const tuition = await Tuition.findById(id);
  if (!tuition) throw ApiError.notFound('Tuition');
  if (String(tuition.student) !== String(user._id)) throw ApiError.forbidden('You can only manage your own tuition posts');
  return tuition;
}

export async function update(user, id, body) {
  const tuition = await findOwned(user, id);
  if (tuition.status === TUITION_STATUS.BOOKED) {
    throw ApiError.conflict('This tuition is already booked and can no longer be edited');
  }
  tuition.set(body);
  // Any edit to a published or rejected post goes back through moderation.
  if (tuition.status !== TUITION_STATUS.PENDING) {
    tuition.status = TUITION_STATUS.PENDING;
    tuition.rejectionReason = '';
    tuition.approvedAt = null;
  }
  await tuition.save();
  invalidate();
  return tuition.toJSON();
}

export async function remove(user, id) {
  const tuition = await Tuition.findById(id);
  if (!tuition) throw ApiError.notFound('Tuition');

  const isAdmin = user.role === ROLES.ADMIN;
  if (!isAdmin && String(tuition.student) !== String(user._id)) {
    throw ApiError.forbidden('You can only delete your own tuition posts');
  }
  if (tuition.status === TUITION_STATUS.BOOKED && !isAdmin) {
    throw ApiError.conflict('Booked tuitions keep their payment history and cannot be deleted');
  }

  const pending = await Application.find({ tuition: id, status: APPLICATION_STATUS.PENDING }).select('tutor').lean();
  await Promise.all([
    tuition.deleteOne(),
    Application.deleteMany({ tuition: id, status: APPLICATION_STATUS.PENDING }),
    Bookmark.deleteMany({ tuition: id }),
  ]);
  pending.forEach((app) =>
    notify(app.tutor, NOTIFICATION_TYPES.POSITION_FILLED, `"${tuition.title}" was removed by its poster.`, '/dashboard/my-applications'),
  );
  invalidate();
}

export async function moderate(id, { status, reason }) {
  const tuition = await Tuition.findById(id);
  if (!tuition) throw ApiError.notFound('Tuition');
  if (tuition.status === TUITION_STATUS.BOOKED) throw ApiError.conflict('Booked tuitions cannot be re-moderated');

  tuition.status = status;
  tuition.rejectionReason = status === TUITION_STATUS.REJECTED ? reason : '';
  tuition.approvedAt = status === TUITION_STATUS.APPROVED ? new Date() : null;
  await tuition.save();
  invalidate();

  const approved = status === TUITION_STATUS.APPROVED;
  notify(
    tuition.student,
    approved ? NOTIFICATION_TYPES.TUITION_APPROVED : NOTIFICATION_TYPES.TUITION_REJECTED,
    approved
      ? `Your tuition "${tuition.title}" is now live and visible to tutors.`
      : `Your tuition "${tuition.title}" was not approved: ${reason}`,
    '/dashboard/my-posts',
  );
  return tuition.toJSON();
}
