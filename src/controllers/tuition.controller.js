import * as applicationService from '../services/application.service.js';
import * as tuitionService from '../services/tuition.service.js';
import { created, ok } from '../utils/response.js';

export async function listPublic(req, res) {
  const { items, meta } = await tuitionService.listPublic(req.valid.query);
  ok(res, items, { meta });
}

export async function latest(req, res) {
  ok(res, await tuitionService.latest(req.valid.query.limit));
}

export async function listMine(req, res) {
  const { items, meta } = await tuitionService.listMine(req.user, req.valid.query);
  ok(res, items, { meta });
}

export async function listForAdmin(req, res) {
  const { items, meta } = await tuitionService.listForAdmin(req.valid.query);
  ok(res, items, { meta });
}

export async function getById(req, res) {
  ok(res, await tuitionService.getById(req.params.id, req.user));
}

export async function create(req, res) {
  created(res, await tuitionService.create(req.user, req.body), 'Tuition submitted for review');
}

export async function update(req, res) {
  ok(res, await tuitionService.update(req.user, req.params.id, req.body), {
    message: 'Tuition updated and sent for review',
  });
}

export async function remove(req, res) {
  await tuitionService.remove(req.user, req.params.id);
  ok(res, { id: req.params.id }, { message: 'Tuition deleted' });
}

export async function moderate(req, res) {
  const tuition = await tuitionService.moderate(req.params.id, req.body);
  ok(res, tuition, { message: `Tuition ${tuition.status.toLowerCase()}` });
}

/** Admin: who applied to this tuition, with contact details on both sides. */
export async function applicants(req, res) {
  const { tuition, items } = await applicationService.listForTuition(req.params.id);
  ok(res, items, { meta: { tuition, total: items.length } });
}
