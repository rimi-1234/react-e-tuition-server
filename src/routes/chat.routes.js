import { Router } from 'express';
import { ROLES } from '../config/constants.js';
import * as chat from '../controllers/chat.controller.js';
import { authenticate, authorize, optionalAuth } from '../middlewares/auth.js';
import { noStore } from '../middlewares/cache.js';
import { chatMessageLimiter, chatStartLimiter } from '../middlewares/security.js';
import { validate } from '../middlewares/validate.js';
import {
  adminReplySchema,
  listSessionsSchema,
  pollSchema,
  sendMessageSchema,
  sessionIdSchema,
  sessionStatusSchema,
  startChatSchema,
} from '../validators/chat.validator.js';

/**
 * Website live chat.
 *   Visitors: POST /chat/sessions, then send the returned token as `X-Chat-Token`.
 *   Admins:   /chat/admin/* with their normal auth.
 */
export const chatRouter = Router();
chatRouter.use(noStore);

chatRouter.post('/sessions', chatStartLimiter, optionalAuth, validate(startChatSchema), chat.start);
chatRouter.get('/me', validate(pollSchema), chat.poll);
chatRouter.post('/me/messages', chatMessageLimiter, validate(sendMessageSchema), chat.send);

const admin = [authenticate(), authorize(ROLES.ADMIN)];
chatRouter.get('/admin/sessions', ...admin, validate(listSessionsSchema), chat.list);
chatRouter.get('/admin/sessions/:id', ...admin, validate(sessionIdSchema), chat.thread);
chatRouter.post('/admin/sessions/:id/messages', ...admin, validate(adminReplySchema), chat.reply);
chatRouter.patch('/admin/sessions/:id', ...admin, validate(sessionStatusSchema), chat.setStatus);
