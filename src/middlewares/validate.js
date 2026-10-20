import { ApiError } from '../utils/ApiError.js';

/**
 * Validates request parts against Zod schemas.
 * Parsed (coerced, defaulted, stripped) values land on `req.valid.{body,query,params}`;
 * `req.body` is replaced too. Express 5 makes `req.query` read-only, so
 * controllers must read query input from `req.valid.query`.
 */
export const validate =
  (schemas = {}) =>
  (req, _res, next) => {
    req.valid ??= {};
    const issues = [];

    for (const part of ['params', 'query', 'body']) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part] ?? {});
      if (result.success) {
        req.valid[part] = result.data;
        if (part === 'body') req.body = result.data;
      } else {
        for (const issue of result.error.issues) {
          issues.push({ location: part, field: issue.path.join('.') || part, message: issue.message });
        }
      }
    }

    if (issues.length) {
      return next(
        new ApiError(422, issues.length === 1 ? issues[0].message : 'Some fields need your attention', {
          code: 'VALIDATION_ERROR',
          details: issues,
        }),
      );
    }
    next();
  };
