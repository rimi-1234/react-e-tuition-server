import * as applicationService from '../services/application.service.js';
import { created, ok } from '../utils/response.js';

export async function apply(req, res) {
  created(res, await applicationService.apply(req.user, req.body), 'Application sent');
}

const listWith = (fn) => async (req, res) => {
  const { items, meta } = await fn(req.user, req.valid.query);
  ok(res, items, { meta });
};

export const listMine = listWith(applicationService.listMine);
export const listReceived = listWith(applicationService.listReceived);
export const listOngoing = listWith(applicationService.listOngoing);

export async function checkApplied(req, res) {
  ok(res, await applicationService.checkApplied(req.user, req.params.tuitionId));
}

export async function update(req, res) {
  ok(res, await applicationService.update(req.user, req.params.id, req.body), { message: 'Application updated' });
}

export async function withdraw(req, res) {
  await applicationService.withdraw(req.user, req.params.id);
  ok(res, { id: req.params.id }, { message: 'Application withdrawn' });
}

export async function reject(req, res) {
  ok(res, await applicationService.reject(req.user, req.params.id), { message: 'Application declined' });
}
