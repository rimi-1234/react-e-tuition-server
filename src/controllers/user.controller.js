import * as userService from '../services/user.service.js';
import { ok } from '../utils/response.js';

export async function list(req, res) {
  const { items, meta } = await userService.list(req.valid.query);
  ok(res, items, { meta });
}

export async function changeRole(req, res) {
  ok(res, await userService.changeRole(req.user, req.params.id, req.body.role), { message: 'Role updated' });
}

export async function setVerified(req, res) {
  const user = await userService.setVerified(req.params.id, req.body.verified);
  ok(res, user, { message: user.verified ? 'Tutor verified' : 'Verification removed' });
}

export async function setActive(req, res) {
  const user = await userService.setActive(req.user, req.params.id, req.body.isActive);
  ok(res, user, { message: user.isActive ? 'Account reactivated' : 'Account suspended' });
}

export async function update(req, res) {
  ok(res, await userService.adminUpdate(req.params.id, req.body), { message: 'User updated' });
}

export async function remove(req, res) {
  await userService.remove(req.user, req.params.id);
  ok(res, { id: req.params.id }, { message: 'User deleted' });
}
