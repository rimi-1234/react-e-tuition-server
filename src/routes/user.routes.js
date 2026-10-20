import { Router } from 'express';
import { ROLES } from '../config/constants.js';
import * as users from '../controllers/user.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { noStore } from '../middlewares/cache.js';
import { validate } from '../middlewares/validate.js';
import {
  adminUpdateUserSchema,
  changeRoleSchema,
  listUsersSchema,
  setActiveSchema,
  userIdSchema,
  verifyTutorSchema,
} from '../validators/user.validator.js';

/** Admin-only user management. */
export const userRouter = Router();
userRouter.use(noStore, authenticate(), authorize(ROLES.ADMIN));

userRouter.get('/', validate(listUsersSchema), users.list);
userRouter.patch('/:id/role', validate(changeRoleSchema), users.changeRole);
userRouter.patch('/:id/verify', validate(verifyTutorSchema), users.setVerified);
userRouter.patch('/:id/status', validate(setActiveSchema), users.setActive);
userRouter.patch('/:id', validate(adminUpdateUserSchema), users.update);
userRouter.delete('/:id', validate(userIdSchema), users.remove);
