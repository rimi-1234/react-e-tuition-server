import * as authService from '../services/auth.service.js';
import { created, ok } from '../utils/response.js';

export async function sync(req, res) {
  const { user, isNew } = await authService.syncUser(req.auth, req.body);
  return isNew ? created(res, user, 'Account created') : ok(res, user, { message: 'Welcome back' });
}

export const me = (req, res) => ok(res, authService.me(req.user));

export async function demoLogin(req, res) {
  ok(res, await authService.demoLogin(req.body.role));
}
