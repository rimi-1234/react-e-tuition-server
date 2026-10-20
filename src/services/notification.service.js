import { ROLES } from '../config/constants.js';
import { Notification, User } from '../models/index.js';
import { serialize } from '../models/plugins.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';

/**
 * Notifications are best-effort side effects: a failure is logged and never
 * rolls back the business action that triggered it.
 */
export async function notify(recipientId, type, message, link = null) {
  if (!recipientId) return;
  try {
    await Notification.create({ recipient: recipientId, type, message, link });
  } catch (error) {
    logger.error({ err: error, type }, 'Failed to create notification');
  }
}

export async function notifyMany(recipientIds, type, message, link = null) {
  const docs = [...new Set(recipientIds.map(String))].map((recipient) => ({ recipient, type, message, link }));
  if (!docs.length) return;
  try {
    await Notification.insertMany(docs, { ordered: false });
  } catch (error) {
    logger.error({ err: error, type }, 'Failed to create notifications');
  }
}

export async function notifyAdmins(type, message, link = null) {
  const admins = await User.find({ role: ROLES.ADMIN, isActive: true }).select('_id').lean();
  return notifyMany(
    admins.map((a) => a._id),
    type,
    message,
    link,
  );
}

export async function listForUser(userId, { limit, unread }) {
  const filter = { recipient: userId, ...(unread && { read: false }) };
  const [items, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
    Notification.countDocuments({ recipient: userId, read: false }),
  ]);
  return { items: serialize(items), unreadCount };
}

export async function markAllRead(userId) {
  const { modifiedCount } = await Notification.updateMany({ recipient: userId, read: false }, { $set: { read: true } });
  return { updated: modifiedCount };
}

export async function markRead(userId, id) {
  const doc = await Notification.findOneAndUpdate({ _id: id, recipient: userId }, { $set: { read: true } }, { returnDocument: 'after' }).lean();
  if (!doc) throw ApiError.notFound('Notification');
  return serialize(doc);
}

export async function remove(userId, id) {
  const { deletedCount } = await Notification.deleteOne({ _id: id, recipient: userId });
  if (!deletedCount) throw ApiError.notFound('Notification');
}
