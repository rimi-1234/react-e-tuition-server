import * as userService from '../services/user.service.js';
import { ok } from '../utils/response.js';

export async function getProfile(req, res) {
  ok(res, await userService.getProfile(req.user));
}

export async function updateProfile(req, res) {
  ok(res, await userService.updateProfile(req.user, req.body), { message: 'Profile updated' });
}
