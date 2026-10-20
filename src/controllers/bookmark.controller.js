import * as bookmarkService from '../services/bookmark.service.js';
import { ok } from '../utils/response.js';

export async function list(req, res) {
  ok(res, await bookmarkService.list(req.user));
}

export async function ids(req, res) {
  ok(res, await bookmarkService.ids(req.user));
}

export async function add(req, res) {
  ok(res, await bookmarkService.add(req.user, req.body.tuitionId), { message: 'Saved to your list' });
}

export async function remove(req, res) {
  ok(res, await bookmarkService.remove(req.user, req.params.tuitionId), { message: 'Removed from saved' });
}
