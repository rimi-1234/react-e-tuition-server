import { Router } from 'express';
import { ROLES } from '../config/constants.js';
import * as applications from '../controllers/application.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { noStore } from '../middlewares/cache.js';
import { writeLimiter } from '../middlewares/security.js';
import { validate } from '../middlewares/validate.js';
import {
  applicationIdSchema,
  applySchema,
  listApplicationsSchema,
  tuitionParamSchema,
  updateApplicationSchema,
} from '../validators/application.validator.js';

const tutorOnly = authorize(ROLES.TUTOR);
const studentOnly = authorize(ROLES.STUDENT);

export const applicationRouter = Router();
applicationRouter.use(noStore, authenticate());

applicationRouter.post('/', writeLimiter, tutorOnly, validate(applySchema), applications.apply);
applicationRouter.get('/mine', tutorOnly, validate(listApplicationsSchema), applications.listMine);
applicationRouter.get('/ongoing', tutorOnly, validate(listApplicationsSchema), applications.listOngoing);
applicationRouter.get('/received', studentOnly, validate(listApplicationsSchema), applications.listReceived);
applicationRouter.get('/check/:tuitionId', tutorOnly, validate(tuitionParamSchema), applications.checkApplied);
applicationRouter.patch('/:id/reject', studentOnly, validate(applicationIdSchema), applications.reject);
applicationRouter.patch('/:id', tutorOnly, validate(updateApplicationSchema), applications.update);
applicationRouter.delete('/:id', tutorOnly, validate(applicationIdSchema), applications.withdraw);
