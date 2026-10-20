import mongoose from 'mongoose';
import { toJSONPlugin } from './plugins.js';

const { ObjectId } = mongoose.Schema.Types;

/**
 * A website chat conversation. Visitors identify with name + phone; the
 * browser keeps a secret token (only its SHA-256 hash is stored) to resume.
 */
const chatSessionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, required: true, trim: true, maxlength: 20, index: true },
    user: { type: ObjectId, ref: 'User', default: null },
    tokenHash: { type: String, required: true, unique: true, private: true },
    status: { type: String, enum: ['open', 'closed'], default: 'open' },
    lastMessage: { type: String, default: '' },
    lastMessageAt: { type: Date, default: Date.now },
    lastSender: { type: String, enum: ['visitor', 'admin'], default: 'visitor' },
    unreadForAdmin: { type: Number, default: 0 },
    unreadForVisitor: { type: Number, default: 0 },
    page: { type: String, trim: true, maxlength: 200, default: '' },
    isDemo: { type: Boolean, default: false, private: true },
  },
  { timestamps: true },
);

chatSessionSchema.index({ status: 1, lastMessageAt: -1 });
chatSessionSchema.plugin(toJSONPlugin);

const chatMessageSchema = new mongoose.Schema(
  {
    session: { type: ObjectId, ref: 'ChatSession', required: true },
    sender: { type: String, enum: ['visitor', 'admin'], required: true },
    senderName: { type: String, default: '' },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    isDemo: { type: Boolean, default: false, private: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

chatMessageSchema.index({ session: 1, createdAt: 1 });
chatMessageSchema.plugin(toJSONPlugin);

export const ChatSession = mongoose.model('ChatSession', chatSessionSchema);
export const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);
