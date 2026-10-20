import mongoose from 'mongoose';
import { toJSONPlugin } from './plugins.js';

const { ObjectId } = mongoose.Schema.Types;

const bookmarkSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true },
    tuition: { type: ObjectId, ref: 'Tuition', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

bookmarkSchema.index({ user: 1, tuition: 1 }, { unique: true });
bookmarkSchema.index({ user: 1, createdAt: -1 });

bookmarkSchema.plugin(toJSONPlugin);

export const Bookmark = mongoose.model('Bookmark', bookmarkSchema);
