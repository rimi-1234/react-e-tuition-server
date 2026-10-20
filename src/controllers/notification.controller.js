import * as notificationService from '../services/notification.service.js';
import { ok } from '../utils/response.js';

export async function list(req, res) {
  const { items, unreadCount } = await notificationService.listForUser(req.user._id, req.valid.query);
  ok(res, items, { meta: { unreadCount } });
}

export async function markAllRead(req, res) {
  ok(res, await notificationService.markAllRead(req.user._id));
}

export async function markRead(req, res) {
  ok(res, await notificationService.markRead(req.user._id, req.params.id));
}

export async function remove(req, res) {
  await notificationService.remove(req.user._id, req.params.id);
  ok(res, { id: req.params.id });
}
