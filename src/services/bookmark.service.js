import { Bookmark, Tuition } from '../models/index.js';
import { serialize } from '../models/plugins.js';
import { ApiError } from '../utils/ApiError.js';

export async function list(user) {
  const bookmarks = await Bookmark.find({ user: user._id })
    .sort({ createdAt: -1 })
    .populate({ path: 'tuition', select: '-rejectionReason -studentEmail -studentName -studentPhoto' })
    .lean();
  // Drop bookmarks whose tuition was deleted in the meantime.
  return serialize(bookmarks.filter((b) => b.tuition));
}

export async function ids(user) {
  const rows = await Bookmark.find({ user: user._id }).select('tuition').lean();
  return rows.map((r) => String(r.tuition));
}

/** Idempotent: saving an already-saved tuition is a no-op success. */
export async function add(user, tuitionId) {
  if (!(await Tuition.exists({ _id: tuitionId }))) throw ApiError.notFound('Tuition');
  await Bookmark.updateOne({ user: user._id, tuition: tuitionId }, { $setOnInsert: { user: user._id, tuition: tuitionId } }, { upsert: true });
  return { tuitionId, saved: true };
}

export async function remove(user, tuitionId) {
  await Bookmark.deleteOne({ user: user._id, tuition: tuitionId });
  return { tuitionId, saved: false };
}
