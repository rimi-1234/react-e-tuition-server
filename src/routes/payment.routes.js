import express, { Router } from 'express';
import { ROLES } from '../config/constants.js';
import * as payments from '../controllers/payment.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { noStore } from '../middlewares/cache.js';
import { writeLimiter } from '../middlewares/security.js';
import { validate } from '../middlewares/validate.js';
import { checkoutSchema, confirmPaymentSchema, listPaymentsSchema } from '../validators/misc.validator.js';

export const paymentRouter = Router();
paymentRouter.use(noStore, authenticate());

paymentRouter.get('/', validate(listPaymentsSchema), payments.list);
paymentRouter.post('/checkout', writeLimiter, authorize(ROLES.STUDENT), validate(checkoutSchema), payments.checkout);
paymentRouter.post('/confirm', authorize(ROLES.STUDENT), validate(confirmPaymentSchema), payments.confirm);

/**
 * Stripe needs the exact raw bytes to verify the signature, so this router is
 * mounted BEFORE the global JSON body parser.
 */
export const stripeWebhookRouter = Router();
stripeWebhookRouter.post('/', express.raw({ type: 'application/json', limit: '1mb' }), payments.webhook);
