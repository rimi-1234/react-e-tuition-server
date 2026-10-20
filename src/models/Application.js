import mongoose from 'mongoose';
import { APPLICATION_STATUS, APPLICATION_STATUS_LIST } from '../config/constants.js';
import { toJSONPlugin } from './plugins.js';

const { ObjectId } = mongoose.Schema.Types;

const applicationSchema = new mongoose.Schema(
  {
    tuition: { type: ObjectId, ref: 'Tuition', required: true },
    tutor: { type: ObjectId, ref: 'User', required: true },
    student: { type: ObjectId, ref: 'User', required: true },

    // Snapshots so list views render without joins and survive later edits.
    tuitionTitle: { type: String, default: '' },
    tuitionSubject: { type: String, default: '' },
    tuitionLocation: { type: String, default: '' },
    tutorName: { type: String, default: '' },
    tutorPhoto: { type: String, default: '' },
    tutorEmail: { type: String, lowercase: true, required: true },
    studentEmail: { type: String, lowercase: true, required: true },

    qualifications: { type: String, required: true, trim: true, maxlength: 300 },
    experience: { type: Number, required: true, min: 0, max: 60 },
    expectedSalary: { type: Number, required: true, min: 0 },
    message: { type: String, trim: true, maxlength: 1000, default: '' },

    status: { type: String, enum: APPLICATION_STATUS_LIST, default: APPLICATION_STATUS.PENDING },
    decidedAt: { type: Date, default: null },
    transactionId: { type: String, default: null },
    reviewed: { type: Boolean, default: false },
    isDemo: { type: Boolean, default: false, private: true },
  },
  { timestamps: true },
);

// A tutor can apply to a tuition only once.
applicationSchema.index({ tuition: 1, tutor: 1 }, { unique: true });
applicationSchema.index({ tutor: 1, status: 1, createdAt: -1 });
applicationSchema.index({ student: 1, status: 1, createdAt: -1 });

applicationSchema.plugin(toJSONPlugin);

export const Application = mongoose.model('Application', applicationSchema);
