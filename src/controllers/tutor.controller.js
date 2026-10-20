import * as tutorService from '../services/tutor.service.js';
import { ok } from '../utils/response.js';

export async function list(req, res) {
  const { items, meta } = await tutorService.list(req.valid.query);
  ok(res, items, { meta });
}

export async function featured(req, res) {
  ok(res, await tutorService.featured(req.valid.query.limit));
}

export async function getById(req, res) {
  ok(res, await tutorService.getById(req.params.id));
}
