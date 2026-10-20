import { createHash, randomBytes } from 'node:crypto';
import { NOTIFICATION_TYPES } from '../config/constants.js';
import { ChatMessage, ChatSession } from '../models/index.js';
import { serialize } from '../models/plugins.js';
import { ApiError } from '../utils/ApiError.js';
import { compact, contains, pageMeta } from '../utils/query.js';
import { notifyAdmins } from './notification.service.js';

const hashToken = (token) => createHash('sha256').update(String(token)).digest('hex');
const preview = (body) => (body.length > 120 ? `${body.slice(0, 117)}…` : body);
const GREETING = 'Hi! Thanks for reaching out to Edurock. A member of our team will reply here shortly.';

/* ── Visitor side (identified by the secret chat token) ──────────── */

/** Resolves the session for a raw token; 401 when missing or unknown. */
export async function sessionForToken(token) {
  if (!token || typeof token !== 'string' || token.length < 32) throw ApiError.unauthorized('Chat session not found. Please start a new chat.');
  const session = await ChatSession.findOne({ tokenHash: hashToken(token) });
  if (!session) throw ApiError.unauthorized('Chat session not found. Please start a new chat.');
  return session;
}

async function addMessage(session, sender, body, senderName) {
  const message = await ChatMessage.create({ session: session._id, sender, body, senderName });
  session.lastMessage = preview(body);
  session.lastMessageAt = message.createdAt;
  session.lastSender = sender;
  if (sender === 'visitor') {
    session.unreadForAdmin += 1;
    session.status = 'open'; // a visitor writing again reopens a closed chat
  } else {
    session.unreadForVisitor += 1;
  }
  await session.save();
  return message.toJSON();
}

/**
 * Starts a conversation. The raw token is returned exactly once; only its
 * hash is stored, so a database leak cannot be used to read conversations.
 */
export async function start({ name, phone, message, page }, user) {
  const token = randomBytes(32).toString('hex');
  const session = await ChatSession.create({
    name,
    phone,
    page: page || '',
    user: user?._id || null,
    tokenHash: hashToken(token),
  });

  await ChatMessage.create({ session: session._id, sender: 'admin', senderName: 'Edurock', body: GREETING });
  if (message) await addMessage(session, 'visitor', message, name);
  else {
    session.lastMessage = preview(GREETING);
    session.lastSender = 'admin';
    await session.save();
  }

  notifyAdmins(NOTIFICATION_TYPES.CHAT_STARTED, `${name} started a live chat${message ? `: “${preview(message)}”` : '.'}`, '/dashboard/admin/chats');
  return { token, ...(await snapshot(session)) };
}

/** Session + messages (optionally only those after a timestamp), marking admin replies as read. */
export async function snapshot(session, after) {
  const filter = { session: session._id, ...(after && { createdAt: { $gt: new Date(after) } }) };
  const messages = await ChatMessage.find(filter).sort({ createdAt: 1 }).limit(200).lean();
  if (session.unreadForVisitor) {
    session.unreadForVisitor = 0;
    await session.save();
  }
  return { session: session.toJSON(), messages: serialize(messages) };
}

export const sendFromVisitor = async (session, body) => addMessage(session, 'visitor', body, session.name);

/* ── Admin side ──────────────────────────────────────────────────── */

export async function listSessions({ status, search, page, limit }) {
  const filter = compact({ status });
  if (search) {
    const rx = contains(search);
    filter.$or = [{ name: rx }, { phone: rx }, { lastMessage: rx }];
  }
  const [items, total, unread] = await Promise.all([
    ChatSession.find(filter).sort({ lastMessageAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ChatSession.countDocuments(filter),
    ChatSession.aggregate([{ $group: { _id: null, sum: { $sum: '$unreadForAdmin' } } }]),
  ]);
  return { items: serialize(items), meta: { ...pageMeta({ page, limit, total }), unread: unread[0]?.sum || 0 } };
}

export async function adminThread(id) {
  const session = await ChatSession.findById(id);
  if (!session) throw ApiError.notFound('Chat');
  const messages = await ChatMessage.find({ session: id }).sort({ createdAt: 1 }).limit(500).lean();
  if (session.unreadForAdmin) {
    session.unreadForAdmin = 0;
    await session.save();
  }
  return { session: session.toJSON(), messages: serialize(messages) };
}

export async function adminReply(id, admin, body) {
  const session = await ChatSession.findById(id);
  if (!session) throw ApiError.notFound('Chat');
  return addMessage(session, 'admin', body, admin.displayName?.split(' ')[0] || 'Edurock');
}

export async function setStatus(id, status) {
  const session = await ChatSession.findByIdAndUpdate(id, { $set: { status } }, { returnDocument: 'after' });
  if (!session) throw ApiError.notFound('Chat');
  return session.toJSON();
}
