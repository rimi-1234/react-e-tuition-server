import { z } from 'zod';
import { isObjectId } from '../utils/query.js';

export const objectId = z
  .string()
  .trim()
  .refine(isObjectId, { message: 'Invalid id' });

export const idParam = z.object({ id: objectId });

/** Trimmed text with a max length; empty strings are kept as ''. */
export const text = (max, min = 0) => z.string().trim().min(min).max(max);

/** Optional search term: trimmed, capped, empty → undefined. */
export const searchTerm = z
  .string()
  .trim()
  .max(80)
  .optional()
  .transform((v) => v || undefined);

/** Optional enum from the query string; '' or 'all' → undefined. */
export const optionalEnum = (values) =>
  z
    .union([z.enum(values), z.literal(''), z.literal('all')])
    .optional()
    .transform((v) => (v && v !== 'all' ? v : undefined));

export const httpUrl = z
  .string()
  .trim()
  .max(1000)
  .refine((v) => /^https?:\/\//i.test(v), { message: 'Must be an http(s) URL' });

export const optionalUrl = z.union([httpUrl, z.literal('')]).optional();

export const money = z.coerce.number().int('Must be a whole number').min(0).max(1_000_000);

export const pagination = (defaultLimit = 12, maxLimit = 50) => ({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(maxLimit).default(defaultLimit),
});

export const booleanish = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === true || v === 'true' || v === '1'));
