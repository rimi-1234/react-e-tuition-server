/**
 * Operational error with an HTTP status. Anything thrown that is NOT an
 * ApiError is treated as a bug and reported as a generic 500.
 */
export class ApiError extends Error {
  constructor(statusCode, message, { code, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code || defaultCode(statusCode);
    this.details = details;
    this.isOperational = true;
  }

  static badRequest(message = 'Bad request', details) {
    return new ApiError(400, message, { code: 'BAD_REQUEST', details });
  }
  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, message, { code: 'UNAUTHORIZED' });
  }
  static forbidden(message = 'You do not have permission to do that') {
    return new ApiError(403, message, { code: 'FORBIDDEN' });
  }
  static notFound(resource = 'Resource') {
    return new ApiError(404, `${resource} not found`, { code: 'NOT_FOUND' });
  }
  static conflict(message = 'Conflict') {
    return new ApiError(409, message, { code: 'CONFLICT' });
  }
  static unavailable(message = 'Service unavailable') {
    return new ApiError(503, message, { code: 'SERVICE_UNAVAILABLE' });
  }
}

function defaultCode(status) {
  if (status >= 500) return 'INTERNAL_ERROR';
  return {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    422: 'VALIDATION_ERROR',
    429: 'RATE_LIMITED',
  }[status] || 'ERROR';
}
