import { Router } from 'express';
import { ROLES } from '../config/constants.js';
import * as tuitions from '../controllers/tuition.controller.js';
import { authenticate, authorize, optionalAuth } from '../middlewares/auth.js';
import { cacheResponse, noStore } from '../middlewares/cache.js';
import { writeLimiter } from '../middlewares/security.js';
import { validate } from '../middlewares/validate.js';
import { NS } from '../services/cache.service.js';
import {
  adminListTuitionsSchema,
  createTuitionSchema,
  latestTuitionsSchema,
  listTuitionsSchema,
  moderateTuitionSchema,
  myTuitionsSchema,
  tuitionIdSchema,
  updateTuitionSchema,
} from '../validators/tuition.validator.js';

const { STUDENT, ADMIN } = ROLES;
export const tuitionRouter = Router();

// Public reads (cached for anonymous visitors)
tuitionRouter.get('/', validate(listTuitionsSchema), cacheResponse(NS.TUITIONS), tuitions.listPublic);
tuitionRouter.get('/latest', validate(latestTuitionsSchema), cacheResponse(NS.TUITIONS, { ttl: 120 }), tuitions.latest);

// Role-scoped lists — declared before /:id so they are not captured as ids
tuitionRouter.get('/mine', noStore, authenticate(), authorize(STUDENT), validate(myTuitionsSchema), tuitions.listMine);
tuitionRouter.get('/admin', noStore, authenticate(), authorize(ADMIN), validate(adminListTuitionsSchema), tuitions.listForAdmin);

tuitionRouter.get('/:id/applications', noStore, authenticate(), authorize(ADMIN), validate(tuitionIdSchema), tuitions.applicants);
tuitionRouter.get('/:id', validate(tuitionIdSchema), optionalAuth, cacheResponse(NS.TUITIONS), tuitions.getById);

// Writes
tuitionRouter.post('/', writeLimiter, authenticate(), authorize(STUDENT), validate(createTuitionSchema), tuitions.create);
tuitionRouter.patch('/:id/status', authenticate(), authorize(ADMIN), validate(moderateTuitionSchema), tuitions.moderate);
tuitionRouter.patch('/:id', writeLimiter, authenticate(), authorize(STUDENT), validate(updateTuitionSchema), tuitions.update);
tuitionRouter.delete('/:id', authenticate(), authorize(STUDENT, ADMIN), validate(tuitionIdSchema), tuitions.remove);
