import { Router } from 'express';
import * as auth from '../controllers/auth.controller.js';
import * as profile from '../controllers/profile.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { noStore } from '../middlewares/cache.js';
import { authLimiter } from '../middlewares/security.js';
import { validate } from '../middlewares/validate.js';
import { demoLoginSchema, syncUserSchema, updateProfileSchema } from '../validators/user.validator.js';

export const authRouter = Router();
authRouter.use(noStore);
authRouter.post('/sync', authLimiter, authenticate({ requireProfile: false }), validate(syncUserSchema), auth.sync);
authRouter.get('/me', authenticate(), auth.me);
authRouter.post('/demo', authLimiter, validate(demoLoginSchema), auth.demoLogin);

export const profileRouter = Router();
profileRouter.use(noStore, authenticate());
profileRouter.get('/', profile.getProfile);
profileRouter.patch('/', validate(updateProfileSchema), profile.updateProfile);
