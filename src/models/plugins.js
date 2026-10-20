/**
 * Shared schema plugin: exposes `id` as a string, hides `__v` and any
 * field marked `private: true` from JSON output.
 */
export function toJSONPlugin(schema) {
  const privatePaths = Object.entries(schema.paths)
    .filter(([, type]) => type.options?.private)
    .map(([path]) => path);

  const transform = (_doc, ret) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    for (const path of privatePaths) delete ret[path];
    return ret;
  };

  schema.set('toJSON', { virtuals: true, versionKey: false, transform });
  schema.set('toObject', { virtuals: true, versionKey: false });
}

const PRIVATE_KEYS = new Set(['__v', 'uid', 'isDemo', 'tokenHash']);
const isPlainObject = (value) => value !== null && Object.getPrototypeOf(value) === Object.prototype;

/**
 * Normalises lean() results (and populated sub-documents) the same way
 * toJSON does: `_id` becomes a string `id`, private keys are removed.
 */
export function serialize(doc) {
  if (doc === null || doc === undefined) return doc;
  if (Array.isArray(doc)) return doc.map(serialize);
  if (typeof doc.toJSON === 'function' && !isPlainObject(doc)) {
    // Mongoose documents carry their own transform; ObjectIds/Dates stringify natively.
    return doc.$__ ? doc.toJSON() : doc;
  }
  if (!isPlainObject(doc)) return doc;

  const out = {};
  for (const [key, value] of Object.entries(doc)) {
    if (PRIVATE_KEYS.has(key)) continue;
    if (key === '_id') out.id = String(value);
    else out[key] = serialize(value);
  }
  return out;
}
