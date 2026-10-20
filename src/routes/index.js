import { Router } from 'express';
import { applicationRouter } from './application.routes.js';
import { bookmarkRouter, dashboardRouter, notificationRouter } from './account.routes.js';
import { authRouter, profileRouter } from './auth.routes.js';
import { chatRouter } from './chat.routes.js';
import { paymentRouter } from './payment.routes.js';
import { contactRouter, metaRouter, reviewRouter, tutorRouter } from './public.routes.js';
import { tuitionRouter } from './tuition.routes.js';
import { userRouter } from './user.routes.js';

/** API v1. New versions get their own router so old clients keep working. */
export const v1 = Router();

v1.use('/auth', authRouter);
v1.use('/profile', profileRouter);
v1.use('/users', userRouter);
v1.use('/tuitions', tuitionRouter);
v1.use('/applications', applicationRouter);
v1.use('/payments', paymentRouter);
v1.use('/tutors', tutorRouter);
v1.use('/reviews', reviewRouter);
v1.use('/bookmarks', bookmarkRouter);
v1.use('/notifications', notificationRouter);
v1.use('/dashboard', dashboardRouter);
v1.use('/meta', metaRouter);
v1.use('/contact', contactRouter);
v1.use('/chat', chatRouter);
