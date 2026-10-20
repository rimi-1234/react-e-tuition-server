import { cache } from '../services/cache.service.js';

/**
 * Response cache for public GET endpoints.
 *
 *  - Server side: the JSON body is stored in the LRU under `namespace` and
 *    keyed by the full URL, so filtered/paginated variants cache separately.
 *  - Client/CDN side: Cache-Control with stale-while-revalidate, and Express's
 *    automatic ETag gives cheap 304s on repeat visits.
 *
 * Authenticated requests bypass it so a personalised view is never shared.
 */
export const cacheResponse =
  (namespace, { ttl = 60, maxAge = 30, swr = 120 } = {}) =>
  (req, res, next) => {
    if (req.method !== 'GET' || req.headers.authorization) return next();

    const key = req.originalUrl;
    const hit = cache.get(namespace, key);
    res.setHeader('Cache-Control', `public, max-age=${maxAge}, stale-while-revalidate=${swr}`);

    if (hit) {
      res.setHeader('X-Cache', 'HIT');
      return res.status(200).json(hit);
    }

    res.setHeader('X-Cache', 'MISS');
    const json = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode === 200 && body?.success) cache.set(namespace, key, body, ttl);
      return json(body);
    };
    next();
  };

/** Marks personalised responses as never cacheable by shared caches. */
export const noStore = (_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  next();
};
