import { Router } from 'express';
import { ROLES } from '../config/constants.js';
import * as contact from '../controllers/contact.controller.js';
import * as meta from '../controllers/meta.controller.js';
import * as reviews from '../controllers/review.controller.js';
import * as tutors from '../controllers/tutor.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { cacheResponse, noStore } from '../middlewares/cache.js';
import { contactLimiter, writeLimiter } from '../middlewares/security.js';
import { validate } from '../middlewares/validate.js';
import { NS } from '../services/cache.service.js';
import {
  contactSchema,
  contactStatusSchema,
  createReviewSchema,
  featuredTutorsSchema,
  listContactSchema,
  listReviewsSchema,
  listTutorsSchema,
  tutorIdSchema,
} from '../validators/misc.validator.js';

/* ── Tutors directory (public) ────────────────────────────────────── */
export const tutorRouter = Router();
tutorRouter.get('/', validate(listTutorsSchema), cacheResponse(NS.TUTORS), tutors.list);
tutorRouter.get('/featured', validate(featuredTutorsSchema), cacheResponse(NS.TUTORS, { ttl: 300 }), tutors.featured);
tutorRouter.get('/:id', validate(tutorIdSchema), cacheResponse(NS.TUTORS), tutors.getById);

/* ── Reviews ──────────────────────────────────────────────────────── */
export const reviewRouter = Router();
reviewRouter.get('/', validate(listReviewsSchema), cacheResponse(NS.REVIEWS, { ttl: 300 }), reviews.list);
reviewRouter.post('/', writeLimiter, authenticate(), authorize(ROLES.STUDENT), validate(createReviewSchema), reviews.create);

/* ── Meta / lookups ───────────────────────────────────────────────── */
export const metaRouter = Router();
metaRouter.get('/stats', cacheResponse(NS.STATS, { ttl: 300, maxAge: 120 }), meta.stats);
metaRouter.get('/subjects', cacheResponse(NS.META, { ttl: 300, maxAge: 300 }), meta.subjects);
metaRouter.get('/locations', cacheResponse(NS.META, { ttl: 300, maxAge: 300 }), meta.locations);
metaRouter.get('/options', meta.options);

/* ── Contact form ─────────────────────────────────────────────────── */
export const contactRouter = Router();
contactRouter.post('/', contactLimiter, validate(contactSchema), contact.create);
contactRouter.get('/', noStore, authenticate(), authorize(ROLES.ADMIN), validate(listContactSchema), contact.list);
contactRouter.patch('/:id', authenticate(), authorize(ROLES.ADMIN), validate(contactStatusSchema), contact.setStatus);
