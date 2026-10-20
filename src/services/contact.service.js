import { ContactMessage } from '../models/index.js';
import { serialize } from '../models/plugins.js';
import { ApiError } from '../utils/ApiError.js';
import { compact, pageMeta } from '../utils/query.js';

export async function create({ website: _honeypot, ...body }) {
  const doc = await ContactMessage.create(body);
  return { id: String(doc._id) };
}

export async function list({ status, page, limit }) {
  const filter = compact({ status });
  const [items, total] = await Promise.all([
    ContactMessage.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ContactMessage.countDocuments(filter),
  ]);
  return { items: serialize(items), meta: pageMeta({ page, limit, total }) };
}

export async function setStatus(id, status) {
  const doc = await ContactMessage.findByIdAndUpdate(id, { $set: { status } }, { returnDocument: 'after' }).lean();
  if (!doc) throw ApiError.notFound('Message');
  return serialize(doc);
}
