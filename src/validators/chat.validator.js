import { z } from 'zod';
import { idParam, optionalEnum, pagination, searchTerm, text } from './common.js';

const phone = z
  .string()
  .trim()
  .min(7, 'Enter a valid phone number')
  .max(20)
  .regex(/^\+?[\d\s-]{7,20}$/, 'Enter a valid phone number');

export const startChatSchema = {
  body: z.object({
    name: text(80, 2),
    phone,
    message: text(2000).optional(),
    page: z.string().trim().max(200).optional(),
  }),
};

export const sendMessageSchema = { body: z.object({ body: text(2000, 1) }) };

export const pollSchema = {
  query: z.object({ after: z.iso.datetime({ offset: true }).optional() }),
};

export const listSessionsSchema = {
  query: z.object({ status: optionalEnum(['open', 'closed']), search: searchTerm, ...pagination(30, 100) }),
};

export const sessionIdSchema = { params: idParam };
export const adminReplySchema = { params: idParam, body: z.object({ body: text(2000, 1) }) };
export const sessionStatusSchema = { params: idParam, body: z.object({ status: z.enum(['open', 'closed']) }) };
