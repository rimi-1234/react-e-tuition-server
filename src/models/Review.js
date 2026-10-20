import mongoose from 'mongoose';
import { toJSONPlugin } from './plugins.js';

const { ObjectId } = mongoose.Schema.Types;

const reviewSchema = new mongoose.Schema(
  {
    tutor: { type: ObjectId, ref: 'User', required: true },
    student: { type: ObjectId, ref: 'User', required: true },
    application: { type: ObjectId, ref: 'Application', required: true, unique: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, maxlength: 1000, default: '' },
    studentName: { type: String, default: 'Student' },
    studentPhoto: { type: String, default: '' },
    tuitionSubject: { type: String, default: '' },
    isDemo: { type: Boolean, default: false, private: true },
  },
  { timestamps: true },
);

reviewSchema.index({ tutor: 1, createdAt: -1 });
reviewSchema.index({ rating: -1, createdAt: -1 });

reviewSchema.plugin(toJSONPlugin);

export const Review = mongoose.model('Review', reviewSchema);
