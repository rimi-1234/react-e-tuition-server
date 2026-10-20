import mongoose from 'mongoose';
import { toJSONPlugin } from './plugins.js';

const contactMessageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, lowercase: true, trim: true },
    subject: { type: String, trim: true, maxlength: 120, default: '' },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    status: { type: String, enum: ['new', 'read', 'archived'], default: 'new' },
  },
  { timestamps: true },
);

contactMessageSchema.index({ status: 1, createdAt: -1 });
contactMessageSchema.plugin(toJSONPlugin);

export const ContactMessage = mongoose.model('ContactMessage', contactMessageSchema);
