import { z } from 'zod';
import { TEACHING_MODES } from '../config/constants.js';
import { booleanish, idParam, objectId, optionalEnum, pagination, searchTerm, text } from './common.js';

/* ── Tutors directory ─────────────────────────────────────────────── */
export const TUTOR_SORTS = {
  rating: { verified: -1, ratingAvg: -1, ratingCount: -1 },
  experience: { experienceYears: -1, ratingAvg: -1 },
  newest: { createdAt: -1 },
  salary_asc: { expectedSalary: 1 },
  salary_desc: { expectedSalary: -1 },
};

export const listTutorsSchema = {
  query: z.object({
    search: searchTerm,
    subject: searchTerm,
    location: searchTerm,
    teachingMode: optionalEnum(TEACHING_MODES),
    verified: booleanish,
    sort: z.enum(Object.keys(TUTOR_SORTS)).default('rating'),
    ...pagination(12, 48),
  }),
};

export const featuredTutorsSchema = {
  query: z.object({ limit: z.coerce.number().int().min(1).max(12).default(4) }),
};

export const tutorIdSchema = { params: idParam };

/* ── Payments ─────────────────────────────────────────────────────── */
export const checkoutSchema = { body: z.object({ applicationId: objectId }) };
export const confirmPaymentSchema = {
  body: z.object({ sessionId: z.string().trim().regex(/^cs_[A-Za-z0-9_]+$/, 'Invalid session id') }),
};
export const listPaymentsSchema = { query: z.object({ ...pagination(20, 100) }) };

/* ── Reviews ──────────────────────────────────────────────────────── */
export const createReviewSchema = {
  body: z.object({
    applicationId: objectId,
    rating: z.coerce.number().int().min(1).max(5),
    comment: text(1000).default(''),
  }),
};
export const listReviewsSchema = {
  query: z.object({ tutorId: objectId.optional(), ...pagination(10, 50) }),
};

/* ── Bookmarks ────────────────────────────────────────────────────── */
export const bookmarkBodySchema = { body: z.object({ tuitionId: objectId }) };
export const bookmarkParamSchema = { params: z.object({ tuitionId: objectId }) };

/* ── Notifications ────────────────────────────────────────────────── */
export const listNotificationsSchema = {
  query: z.object({ limit: z.coerce.number().int().min(1).max(50).default(20), unread: booleanish }),
};
export const notificationIdSchema = { params: idParam };

/* ── Contact ──────────────────────────────────────────────────────── */
export const contactSchema = {
  body: z.object({
    name: text(80, 2),
    email: z.email('Enter a valid email').max(120),
    subject: text(120).default(''),
    message: text(2000, 10),
    // Honeypot: real users never fill this hidden field.
    website: z.string().max(0, 'Spam detected').optional(),
  }),
};

export const listContactSchema = {
  query: z.object({ status: optionalEnum(['new', 'read', 'archived']), ...pagination(20, 100) }),
};
export const contactStatusSchema = {
  params: idParam,
  body: z.object({ status: z.enum(['new', 'read', 'archived']) }),
};

/* ── Admin analytics ──────────────────────────────────────────────── */
export const adminStatsSchema = {
  query: z.object({ days: z.coerce.number().int().min(7).max(365).default(30) }),
};

export { searchTerm };
