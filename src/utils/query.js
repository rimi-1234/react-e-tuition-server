import mongoose from 'mongoose';

/** Escape user text before using it inside a RegExp (prevents ReDoS / regex errors). */
export const escapeRegex = (text = '') => String(text).replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');

/** Case-insensitive "contains" matcher, or undefined when the term is empty. */
export const contains = (term) => (term ? new RegExp(escapeRegex(term.trim()), 'i') : undefined);

/** Builds the pagination meta block returned alongside list payloads. */
export function pageMeta({ page, limit, total }) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 };
}

/** Drops undefined keys so optional filters never end up as `{ field: undefined }`. */
export const compact = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

export const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));
export const isObjectId = (id) => mongoose.isValidObjectId(id) && /^[a-f\d]{24}$/i.test(String(id));
