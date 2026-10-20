import mongoose from 'mongoose';
import {
  CLASS_LEVELS,
  EXPERIENCE_LEVELS,
  GENDERS,
  TEACHING_MODES,
  TUITION_STATUS,
  TUITION_STATUS_LIST,
  TUTOR_PREFERENCES,
} from '../config/constants.js';
import { toJSONPlugin } from './plugins.js';

const { ObjectId } = mongoose.Schema.Types;

const tuitionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    subject: { type: String, required: true, trim: true, maxlength: 60 },
    classLevel: { type: String, required: true, enum: CLASS_LEVELS },
    location: { type: String, required: true, trim: true, maxlength: 80 },
    budget: { type: Number, required: true, min: 0 },
    schedule: { type: String, trim: true, maxlength: 120, default: '' },
    description: { type: String, required: true, trim: true, maxlength: 3000 },
    studentGender: { type: String, enum: [...GENDERS, ''], default: '' },
    preferredTutor: { type: String, enum: TUTOR_PREFERENCES, default: 'Any' },
    teachingMode: { type: String, enum: TEACHING_MODES, default: 'Both' },
    experienceNeeded: { type: String, enum: EXPERIENCE_LEVELS, default: 'Any' },
    media: { type: [String], default: [] },

    status: { type: String, enum: TUITION_STATUS_LIST, default: TUITION_STATUS.PENDING },
    rejectionReason: { type: String, trim: true, maxlength: 300, default: '' },

    student: { type: ObjectId, ref: 'User', required: true },
    studentEmail: { type: String, required: true, lowercase: true },
    studentName: { type: String, default: '' },
    studentPhoto: { type: String, default: '' },

    applicationsCount: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    hiredTutor: { type: ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    bookedAt: { type: Date, default: null },
    isDemo: { type: Boolean, default: false, private: true },
  },
  { timestamps: true },
);

tuitionSchema.index({ status: 1, createdAt: -1 });
tuitionSchema.index({ status: 1, budget: -1 });
tuitionSchema.index({ student: 1, createdAt: -1 });
tuitionSchema.index({ subject: 1, status: 1 });

tuitionSchema.plugin(toJSONPlugin);

export const Tuition = mongoose.model('Tuition', tuitionSchema);
