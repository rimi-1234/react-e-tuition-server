import { createHash } from 'node:crypto';
import mongoose from 'mongoose';

/**
 * Determinism helpers: the same seed version produces byte-identical data on
 * every database, so URLs like /tutors/<id> are shareable across environments.
 */

/** Stable ObjectId derived from a key, e.g. oid('user:demo.tutor@etuition.com'). */
export const oid = (key) => new mongoose.Types.ObjectId(createHash('md5').update(`edurock-seed:${key}`).digest('hex').slice(0, 24));

/** mulberry32: tiny, fast, seedable PRNG. */
export function createRandom(seed = 20261017) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p,
    /** n distinct items, order preserved from a shuffled copy. */
    sample(list, n) {
      const copy = [...list];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy.slice(0, n);
    },
    /** Round to a "human" price step. */
    price: (min, max, step = 500) => Math.round((min + next() * (max - min)) / step) * step,
  };
}

const DAY = 86_400_000;

/**
 * Dates are expressed as "days before the anchor" so the dataset always looks
 * fresh. Pin SEED_ANCHOR (ISO date) to reproduce exact timestamps.
 */
export function createClock(anchor = process.env.SEED_ANCHOR ? new Date(process.env.SEED_ANCHOR) : new Date()) {
  const base = new Date(anchor);
  base.setUTCHours(10, 0, 0, 0);
  return {
    anchor: base,
    daysAgo: (days, hour = 0) => new Date(base.getTime() - days * DAY + hour * 3_600_000),
  };
}
