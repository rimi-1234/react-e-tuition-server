import mongoose from 'mongoose';
import { PAYMENT_STATUS } from '../config/constants.js';
import { toJSONPlugin } from './plugins.js';

const { ObjectId } = mongoose.Schema.Types;

const paymentSchema = new mongoose.Schema(
  {
    transactionId: { type: String, required: true, unique: true },
    stripeSessionId: { type: String, required: true, unique: true },

    student: { type: ObjectId, ref: 'User', required: true },
    tutor: { type: ObjectId, ref: 'User', required: true },
    application: { type: ObjectId, ref: 'Application', required: true },
    tuition: { type: ObjectId, ref: 'Tuition', required: true },

    studentEmail: { type: String, lowercase: true },
    tutorEmail: { type: String, lowercase: true },
    studentName: { type: String, default: '' },
    tutorName: { type: String, default: '' },
    tuitionSubject: { type: String, default: '' },
    tuitionTitle: { type: String, default: '' },

    amount: { type: Number, required: true }, // gross, what the student paid
    platformFeePercent: { type: Number, required: true },
    platformFee: { type: Number, required: true }, // platform commission
    netAmount: { type: Number, required: true }, // tutor payout
    currency: { type: String, default: 'bdt' },
    status: { type: String, enum: Object.values(PAYMENT_STATUS), default: PAYMENT_STATUS.PAID },
    paidAt: { type: Date, default: Date.now },
    isDemo: { type: Boolean, default: false, private: true },
  },
  { timestamps: true },
);

paymentSchema.index({ student: 1, paidAt: -1 });
paymentSchema.index({ tutor: 1, paidAt: -1 });
paymentSchema.index({ paidAt: -1 });

paymentSchema.plugin(toJSONPlugin);

export const Payment = mongoose.model('Payment', paymentSchema);
