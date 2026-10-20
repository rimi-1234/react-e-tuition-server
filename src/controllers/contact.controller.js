import * as contactService from '../services/contact.service.js';
import { created, ok } from '../utils/response.js';

export async function create(req, res) {
  created(res, await contactService.create(req.body), 'Thanks! We will get back to you within one business day.');
}

export async function list(req, res) {
  const { items, meta } = await contactService.list(req.valid.query);
  ok(res, items, { meta });
}

export async function setStatus(req, res) {
  ok(res, await contactService.setStatus(req.params.id, req.body.status));
}
