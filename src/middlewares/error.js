import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';

export const notFound = (req, _res, next) => {
  next(new ApiError(404, `Route ${req.method} ${req.originalUrl} does not exist`, { code: 'ROUTE_NOT_FOUND' }));
};

/** Maps library errors onto ApiError so every failure has the same shape. */
function normalise(err) {
  if (err instanceof ApiError) return err;

  if (err instanceof mongoose.Error.CastError) {
    return ApiError.badRequest(`Invalid value for ${err.path}`);
  }
  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({ location: 'body', field: e.path, message: e.message }));
    return new ApiError(422, details[0]?.message || 'Validation failed', { code: 'VALIDATION_ERROR', details });
  }
  if (err?.code === 11000) {
    const field = Object.keys(err.keyPattern || err.keyValue || {})[0] || 'record';
    return ApiError.conflict(`A record with this ${field} already exists`);
  }
  if (err?.type === 'entity.parse.failed') return ApiError.badRequest('Malformed JSON body');
  if (err?.type === 'entity.too.large') return new ApiError(413, 'Request body is too large', { code: 'PAYLOAD_TOO_LARGE' });
  if (err?.type?.startsWith?.('Stripe')) {
    return new ApiError(err.statusCode && err.statusCode < 500 ? 400 : 502, err.message || 'Payment provider error', {
      code: 'PAYMENT_ERROR',
    });
  }
  if (
    ['MongooseServerSelectionError', 'MongoNetworkError', 'MongoServerSelectionError'].includes(err?.name) ||
    err?.codeName === 'AtlasError'
  ) {
    return ApiError.unavailable('Database is temporarily unavailable. Please try again.');
  }
  return null;
}

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, _next) => {
  const known = normalise(err);
  const error = known || new ApiError(500, 'Something went wrong on our side. Please try again.');

  const log = req.log || logger;
  if (error.statusCode >= 500) log.error({ err, requestId: req.id }, error.message);
  else log.warn({ code: error.code, path: req.originalUrl, requestId: req.id }, error.message);

  const body = {
    success: false,
    message: error.message,
    code: error.code,
    requestId: req.id,
  };
  if (error.details) body.details = error.details;
  if (!env.isProd && !known && err?.stack) body.stack = err.stack.split('\n').slice(0, 6);

  res.status(error.statusCode).json(body);
};
