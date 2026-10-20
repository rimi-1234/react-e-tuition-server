import * as reviewService from '../services/review.service.js';
import { created, ok } from '../utils/response.js';

export async function list(req, res) {
  const { items, meta } = await reviewService.list(req.valid.query);
  ok(res, items, { meta });
}

export async function create(req, res) {
  created(res, await reviewService.create(req.user, req.body), 'Thanks for your review');
}
