import * as paymentService from '../services/payment.service.js';
import { ok } from '../utils/response.js';

export async function checkout(req, res) {
  ok(res, await paymentService.createCheckout(req.user, req.body.applicationId));
}

export async function confirm(req, res) {
  const { payment, alreadyProcessed } = await paymentService.confirm(req.user, req.body.sessionId);
  ok(res, payment, { message: alreadyProcessed ? 'Payment already confirmed' : 'Payment confirmed' });
}

/** req.body is a raw Buffer here (express.raw is mounted for this route only). */
export async function webhook(req, res) {
  ok(res, await paymentService.handleWebhook(req.body, req.headers['stripe-signature']));
}

export async function list(req, res) {
  const { items, meta, summary } = await paymentService.listForUser(req.user, req.valid.query);
  ok(res, items, { meta: { ...meta, summary } });
}
