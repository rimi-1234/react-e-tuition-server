import { LRUCache } from 'lru-cache';
import { env } from '../config/env.js';

/**
 * In-process LRU cache with namespace-based invalidation.
 *
 * Every key is prefixed with its namespace's current version. Invalidating a
 * namespace just bumps that version, so stale entries become unreachable at
 * O(1) cost and age out of the LRU on their own.
 *
 * On Render's free tier the process sleeps when idle, so the cache warms up
 * again after each wake-up; correctness never depends on a cache hit.
 * The interface (get/set/wrap/invalidate) is deliberately small so a Redis
 * adapter can replace it later without touching callers.
 */
const store = new LRUCache({
  max: env.CACHE_MAX_ENTRIES,
  ttl: env.CACHE_TTL_SECONDS * 1000,
  updateAgeOnGet: false,
});

const versions = new Map();
const inflight = new Map();
const stats = { hits: 0, misses: 0 };

const versionOf = (ns) => versions.get(ns) ?? 0;
const fullKey = (ns, key) => `${ns}:v${versionOf(ns)}:${key}`;

export const NS = Object.freeze({
  TUITIONS: 'tuitions',
  TUTORS: 'tutors',
  META: 'meta',
  REVIEWS: 'reviews',
  USERS: 'users', // auth lookups by uid
  STATS: 'stats',
});

export const cache = {
  get(ns, key) {
    const value = store.get(fullKey(ns, key));
    value === undefined ? stats.misses++ : stats.hits++;
    return value;
  },

  set(ns, key, value, ttlSeconds) {
    store.set(fullKey(ns, key), value, ttlSeconds ? { ttl: ttlSeconds * 1000 } : undefined);
    return value;
  },

  delete(ns, key) {
    store.delete(fullKey(ns, key));
  },

  /**
   * Read-through helper. Concurrent misses for the same key share a single
   * loader call (request coalescing / cache-stampede protection).
   */
  async wrap(ns, key, loader, ttlSeconds) {
    const k = fullKey(ns, key);
    const hit = store.get(k);
    if (hit !== undefined) {
      stats.hits++;
      return hit;
    }
    stats.misses++;
    if (inflight.has(k)) return inflight.get(k);

    const promise = Promise.resolve()
      .then(loader)
      .then((value) => {
        if (value !== undefined) store.set(k, value, ttlSeconds ? { ttl: ttlSeconds * 1000 } : undefined);
        return value;
      })
      .finally(() => inflight.delete(k));

    inflight.set(k, promise);
    return promise;
  },

  invalidate(...namespaces) {
    for (const ns of namespaces) versions.set(ns, versionOf(ns) + 1);
  },

  clear() {
    store.clear();
    versions.clear();
  },

  stats() {
    const total = stats.hits + stats.misses;
    return { size: store.size, ...stats, hitRate: total ? Number((stats.hits / total).toFixed(3)) : 0 };
  },
};
