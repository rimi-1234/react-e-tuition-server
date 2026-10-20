import { z } from 'zod';
import { GENDERS, ROLE_LIST, SELF_ASSIGNABLE_ROLES, TEACHING_MODES } from '../config/constants.js';
import { booleanish, idParam, money, optionalEnum, optionalUrl, pagination, searchTerm, text } from './common.js';

const phone = z
  .string()
  .trim()
  .max(20)
  .refine((v) => v === '' || /^\+?[\d\s-]{7,20}$/.test(v), { message: 'Enter a valid phone number' });

/** Called right after Firebase sign-up / sign-in. Role is honoured only on first sync. */
export const syncUserSchema = {
  body: z.object({
    displayName: text(80).optional(),
    photoURL: optionalUrl,
    phone: phone.optional(),
    role: z.enum(SELF_ASSIGNABLE_ROLES).optional(),
  }),
};

export const demoLoginSchema = {
  body: z.object({ role: z.enum(['Student', 'Tutor', 'Admin']) }),
};

export const updateProfileSchema = {
  body: z
    .object({
      displayName: text(80, 2),
      photoURL: optionalUrl,
      phone,
      location: text(80),
      bio: text(1000),
      gender: z.enum([...GENDERS, '']),
      // Tutor-only fields; ignored for other roles by the service.
      subjects: z.array(text(40, 1)).max(12),
      experienceYears: z.coerce.number().int().min(0).max(60),
      qualification: text(200),
      institution: text(120),
      expectedSalary: money,
      teachingMode: z.enum([...TEACHING_MODES, '']),
    })
    .partial()
    .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update' }),
};

export const listUsersSchema = {
  query: z.object({
    search: searchTerm,
    role: optionalEnum(ROLE_LIST),
    ...pagination(15, 100),
  }),
};

export const changeRoleSchema = {
  params: idParam,
  body: z.object({ role: z.enum(ROLE_LIST) }),
};

export const verifyTutorSchema = {
  params: idParam,
  body: z.object({ verified: booleanish.pipe(z.boolean()) }),
};

export const setActiveSchema = {
  params: idParam,
  body: z.object({ isActive: booleanish.pipe(z.boolean()) }),
};

export const adminUpdateUserSchema = {
  params: idParam,
  body: z
    .object({ displayName: text(80, 2), photoURL: optionalUrl, phone })
    .partial()
    .refine((b) => Object.keys(b).length > 0, { message: 'Nothing to update' }),
};

export const userIdSchema = { params: idParam };
