import { Router } from 'express';
import { ROLES } from '../config/constants.js';
import * as bookmarks from '../controllers/bookmark.controller.js';
import * as dashboard from '../controllers/dashboard.controller.js';
import * as notifications from '../controllers/notification.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { noStore } from '../middlewares/cache.js';
import { validate } from '../middlewares/validate.js';
import {
  adminStatsSchema,
  bookmarkBodySchema,
  bookmarkParamSchema,
  listNotificationsSchema,
  notificationIdSchema,
} from '../validators/misc.validator.js';

/* ── Bookmarks (any signed-in user) ───────────────────────────────── */
export const bookmarkRouter = Router();
bookmarkRouter.use(noStore, authenticate());
bookmarkRouter.get('/', bookmarks.list);
bookmarkRouter.get('/ids', bookmarks.ids);
bookmarkRouter.post('/', validate(bookmarkBodySchema), bookmarks.add);
bookmarkRouter.delete('/:tuitionId', validate(bookmarkParamSchema), bookmarks.remove);

/* ── Notifications ────────────────────────────────────────────────── */
export const notificationRouter = Router();
notificationRouter.use(noStore, authenticate());
notificationRouter.get('/', validate(listNotificationsSchema), notifications.list);
notificationRouter.patch('/read-all', notifications.markAllRead);
notificationRouter.patch('/:id/read', validate(notificationIdSchema), notifications.markRead);
notificationRouter.delete('/:id', validate(notificationIdSchema), notifications.remove);

/* ── Role dashboards ──────────────────────────────────────────────── */
export const dashboardRouter = Router();
dashboardRouter.use(noStore, authenticate());
dashboardRouter.get('/student', authorize(ROLES.STUDENT), dashboard.student);
dashboardRouter.get('/tutor', authorize(ROLES.TUTOR), dashboard.tutor);
dashboardRouter.get('/admin', authorize(ROLES.ADMIN), validate(adminStatsSchema), dashboard.admin);
