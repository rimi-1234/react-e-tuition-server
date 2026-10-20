/**
 * One response envelope for the whole API:
 *   { success: true, message?, data, meta? }
 * Errors use the same shape with success: false (see errorHandler).
 */
export function ok(res, data, { message, meta, status = 200 } = {}) {
  const body = { success: true };
  if (message) body.message = message;
  body.data = data ?? null;
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

export const created = (res, data, message = 'Created') => ok(res, data, { message, status: 201 });
