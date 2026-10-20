import {
  APPLICATION_STATUS,
  MIN_CHARGE_AMOUNT,
  NOTIFICATION_TYPES,
  ROLES,
  TUITION_STATUS,
} from '../config/constants.js';
import { withTransaction } from '../config/db.js';
import { env } from '../config/env.js';
import { stripe } from '../config/stripe.js';
import { Application, Payment, Tuition, User } from '../models/index.js';
import { serialize } from '../models/plugins.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { pageMeta } from '../utils/query.js';
import { NS, cache } from './cache.service.js';
import { notify, notifyMany } from './notification.service.js';

const requireStripe = () => {
  if (!stripe) throw ApiError.unavailable('Payments are not configured on this server');
  return stripe;
};

/** Splits a gross amount into platform commission and tutor payout (2-decimal precision). */
export function splitAmount(gross, feePercent = env.PLATFORM_FEE_PERCENT) {
  const platformFee = Math.round(gross * feePercent) / 100;
  return { platformFee, netAmount: Math.round((gross - platformFee) * 100) / 100 };
}

export async function createCheckout(student, applicationId) {
  const application = await Application.findById(applicationId).lean();
  if (!application) throw ApiError.notFound('Application');
  if (String(application.student) !== String(student._id)) throw ApiError.forbidden('This application is not for your tuition');
  if (application.status !== APPLICATION_STATUS.PENDING) {
    throw ApiError.conflict(`This application is already ${application.status.toLowerCase()}`);
  }

  const tuition = await Tuition.findById(application.tuition).lean();
  if (!tuition) throw ApiError.notFound('Tuition');
  if (tuition.status !== TUITION_STATUS.APPROVED) throw ApiError.conflict('This tuition is no longer open for hiring');

  const amount = Number(application.expectedSalary);
  if (!amount || amount < MIN_CHARGE_AMOUNT) {
    throw ApiError.badRequest(`The amount must be at least ${MIN_CHARGE_AMOUNT} ${env.PAYMENT_CURRENCY.toUpperCase()}`);
  }

  const session = await requireStripe().checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: student.email,
    client_reference_id: String(application._id),
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: env.PAYMENT_CURRENCY,
          unit_amount: Math.round(amount * 100),
          product_data: {
            name: `Tuition: ${tuition.title}`,
            description: `${tuition.subject} · Tutor: ${application.tutorName}`,
          },
        },
      },
    ],
    // Stripe metadata values must be strings.
    metadata: {
      applicationId: String(application._id),
      tuitionId: String(tuition._id),
      studentId: String(student._id),
      tutorId: String(application.tutor),
    },
    success_url: `${env.CLIENT_URL}/dashboard/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.CLIENT_URL}/dashboard/applied-tutors?payment=cancelled`,
  });

  return { url: session.url, sessionId: session.id };
}

/**
 * Applies a paid Checkout Session exactly once. Called both from the
 * client-side confirmation and from the Stripe webhook; whichever arrives
 * first wins, the other sees the existing payment (idempotent by session id).
 */
export async function fulfill(session) {
  const existing = await Payment.findOne({ stripeSessionId: session.id }).lean();
  if (existing) return { payment: serialize(existing), alreadyProcessed: true };

  const { applicationId, tuitionId, studentId, tutorId } = session.metadata || {};
  const [application, tuition, student] = await Promise.all([
    Application.findById(applicationId).lean(),
    Tuition.findById(tuitionId).lean(),
    User.findById(studentId).select('displayName').lean(),
  ]);
  if (!application || !tuition) throw ApiError.notFound('Application or tuition for this payment');

  const gross = session.amount_total / 100;
  const { platformFee, netAmount } = splitAmount(gross);
  const transactionId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || session.id;

  let payment;
  let rejectedTutors = [];
  try {
    payment = await withTransaction(async (s) => {
      const [doc] = await Payment.create(
        [
          {
            transactionId,
            stripeSessionId: session.id,
            student: studentId,
            tutor: tutorId,
            application: applicationId,
            tuition: tuitionId,
            studentEmail: application.studentEmail,
            tutorEmail: application.tutorEmail,
            studentName: student?.displayName || '',
            tutorName: application.tutorName,
            tuitionSubject: tuition.subject,
            tuitionTitle: tuition.title,
            amount: gross,
            platformFeePercent: env.PLATFORM_FEE_PERCENT,
            platformFee,
            netAmount,
            currency: session.currency,
            paidAt: new Date(),
          },
        ],
        { session: s },
      );

      const now = new Date();
      await Application.updateOne(
        { _id: applicationId },
        { $set: { status: APPLICATION_STATUS.APPROVED, transactionId, decidedAt: now } },
        { session: s },
      );
      await Tuition.updateOne(
        { _id: tuitionId },
        { $set: { status: TUITION_STATUS.BOOKED, hiredTutor: tutorId, bookedAt: now } },
        { session: s },
      );

      const others = await Application.find({ tuition: tuitionId, _id: { $ne: applicationId }, status: APPLICATION_STATUS.PENDING })
        .select('tutor')
        .session(s)
        .lean();
      rejectedTutors = others.map((o) => o.tutor);
      await Application.updateMany(
        { tuition: tuitionId, _id: { $ne: applicationId }, status: APPLICATION_STATUS.PENDING },
        { $set: { status: APPLICATION_STATUS.REJECTED, decidedAt: now } },
        { session: s },
      );
      await User.updateOne({ _id: tutorId }, { $inc: { hiredCount: 1 } }, { session: s });
      return doc;
    });
  } catch (error) {
    // Two confirmations racing: the unique index lets exactly one through.
    if (error?.code === 11000) {
      const winner = await Payment.findOne({ stripeSessionId: session.id }).lean();
      return { payment: serialize(winner), alreadyProcessed: true };
    }
    throw error;
  }

  cache.invalidate(NS.TUITIONS, NS.TUTORS, NS.STATS, NS.META);

  notify(tutorId, NOTIFICATION_TYPES.PAYMENT_CONFIRMED, `You were hired for "${tuition.title}". The student's contact details are now available.`, '/dashboard/ongoing-tuitions');
  notify(studentId, NOTIFICATION_TYPES.HIRE_CONFIRMED, `Payment received. ${application.tutorName} is now your ${tuition.subject} tutor.`, '/dashboard/applied-tutors');
  notifyMany(rejectedTutors, NOTIFICATION_TYPES.POSITION_FILLED, `"${tuition.title}" has been filled by another tutor.`, '/dashboard/my-applications');

  return { payment: payment.toJSON(), alreadyProcessed: false };
}

export async function confirm(student, sessionId) {
  const session = await requireStripe().checkout.sessions.retrieve(sessionId);
  if (session.metadata?.studentId !== String(student._id)) throw ApiError.forbidden('This payment belongs to another account');
  if (session.payment_status !== 'paid') throw new ApiError(402, 'Payment has not been completed yet', { code: 'PAYMENT_INCOMPLETE' });
  return fulfill(session);
}

/** Stripe webhook entry point. `rawBody` must be the untouched request Buffer. */
export async function handleWebhook(rawBody, signature) {
  if (!env.STRIPE_WEBHOOK_SECRET) throw ApiError.unavailable('Webhook secret is not configured');
  let event;
  try {
    event = requireStripe().webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    throw ApiError.badRequest(`Webhook signature verification failed: ${error.message}`);
  }

  if (
    (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') &&
    event.data.object.payment_status === 'paid'
  ) {
    const result = await fulfill(event.data.object);
    logger.info({ sessionId: event.data.object.id, alreadyProcessed: result.alreadyProcessed }, 'Stripe checkout fulfilled');
  }
  return { received: true, type: event.type };
}

export async function listForUser(user, { page, limit }) {
  const filter =
    user.role === ROLES.ADMIN ? {} : user.role === ROLES.TUTOR ? { tutor: user._id } : { student: user._id };

  const [items, total, [summary]] = await Promise.all([
    Payment.find(filter).sort({ paidAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Payment.countDocuments(filter),
    Payment.aggregate([
      { $match: filter },
      { $group: { _id: null, gross: { $sum: '$amount' }, net: { $sum: '$netAmount' }, fees: { $sum: '$platformFee' }, count: { $sum: 1 } } },
    ]),
  ]);

  return {
    items: serialize(items),
    meta: pageMeta({ page, limit, total }),
    summary: { gross: summary?.gross || 0, net: summary?.net || 0, fees: summary?.fees || 0, count: summary?.count || 0 },
  };
}
