import mongoose from 'mongoose';
import { GENDERS, ROLES, ROLE_LIST, TEACHING_MODES } from '../config/constants.js';
import { toJSONPlugin } from './plugins.js';

const userSchema = new mongoose.Schema(
  {
    uid: { type: String, unique: true, sparse: true, private: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    displayName: { type: String, trim: true, maxlength: 80, default: '' },
    photoURL: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, maxlength: 20, default: '' },
    role: { type: String, enum: ROLE_LIST, default: ROLES.STUDENT, index: true },
    isActive: { type: Boolean, default: true },

    bio: { type: String, trim: true, maxlength: 1000, default: '' },
    location: { type: String, trim: true, maxlength: 80, default: '' },
    gender: { type: String, enum: [...GENDERS, ''], default: '' },

    // Tutor profile. Kept top-level so the directory can filter and sort on it.
    subjects: { type: [String], default: [] },
    experienceYears: { type: Number, min: 0, max: 60, default: 0 },
    qualification: { type: String, trim: true, maxlength: 200, default: '' },
    institution: { type: String, trim: true, maxlength: 120, default: '' },
    expectedSalary: { type: Number, min: 0, default: 0 },
    teachingMode: { type: String, enum: [...TEACHING_MODES, ''], default: '' },
    verified: { type: Boolean, default: false },
    verifiedAt: { type: Date, default: null },

    // Denormalised aggregates, kept in sync by the review/payment services.
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    hiredCount: { type: Number, default: 0 },

    lastLoginAt: { type: Date },
    isDemo: { type: Boolean, default: false, private: true },
  },
  { timestamps: true },
);

userSchema.index({ role: 1, verified: -1, ratingAvg: -1 });
userSchema.index({ role: 1, createdAt: -1 });
userSchema.index({ subjects: 1 });

userSchema.plugin(toJSONPlugin);

/** Fields safe to show anyone browsing the tutor directory. */
export const PUBLIC_TUTOR_FIELDS =
  'displayName photoURL bio location gender subjects experienceYears qualification institution expectedSalary teachingMode verified ratingAvg ratingCount hiredCount createdAt';

export const User = mongoose.model('User', userSchema);
