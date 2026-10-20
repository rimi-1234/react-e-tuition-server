import { z } from 'zod';
import {
  CLASS_LEVELS,
  EXPERIENCE_LEVELS,
  GENDERS,
  TEACHING_MODES,
  TUITION_STATUS,
  TUITION_STATUS_LIST,
  TUTOR_PREFERENCES,
} from '../config/constants.js';
import { httpUrl, idParam, money, optionalEnum, pagination, searchTerm, text } from './common.js';

const tuitionFields = {
  title: text(120, 5),
  subject: text(60, 2),
  classLevel: z.enum(CLASS_LEVELS),
  location: text(80, 2),
  budget: money.refine((v) => v >= 500, { message: 'Budget should be at least 500 BDT' }),
  schedule: text(120).default(''),
  description: text(3000, 20),
  studentGender: z.enum([...GENDERS, '']).default(''),
  preferredTutor: z.enum(TUTOR_PREFERENCES).default('Any'),
  teachingMode: z.enum(TEACHING_MODES).default('Both'),
  experienceNeeded: z.enum(EXPERIENCE_LEVELS).default('Any'),
  media: z.array(httpUrl).max(4).default([]),
};

export const createTuitionSchema = { body: z.object(tuitionFields) };

export const updateTuitionSchema = {
  params: idParam,
  body: z
    .object(tuitionFields)
    .partial()
    .refine((b) => Object.keys(b).length > 0, { message: 'Nothing to update' }),
};

export const SORTS = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  budget_desc: { budget: -1, createdAt: -1 },
  budget_asc: { budget: 1, createdAt: -1 },
  popular: { applicationsCount: -1, createdAt: -1 },
};

const listFilters = {
  search: searchTerm,
  subject: searchTerm,
  location: searchTerm,
  classLevel: optionalEnum(CLASS_LEVELS),
  teachingMode: optionalEnum(TEACHING_MODES),
  minBudget: z.coerce.number().min(0).optional(),
  maxBudget: z.coerce.number().min(0).optional(),
  sort: z.enum(Object.keys(SORTS)).default('newest'),
};

export const listTuitionsSchema = {
  query: z.object({ ...listFilters, ...pagination(9, 48) }),
};

export const adminListTuitionsSchema = {
  query: z.object({ ...listFilters, status: optionalEnum(TUITION_STATUS_LIST), ...pagination(15, 100) }),
};

export const myTuitionsSchema = {
  query: z.object({ status: optionalEnum(TUITION_STATUS_LIST), ...pagination(20, 100) }),
};

export const latestTuitionsSchema = {
  query: z.object({ limit: z.coerce.number().int().min(1).max(12).default(6) }),
};

export const moderateTuitionSchema = {
  params: idParam,
  body: z
    .object({
      status: z.enum([TUITION_STATUS.APPROVED, TUITION_STATUS.REJECTED]),
      reason: text(300).optional(),
    })
    .refine((b) => b.status !== TUITION_STATUS.REJECTED || (b.reason && b.reason.length >= 3), {
      message: 'Please give a short reason when rejecting',
      path: ['reason'],
    }),
};

export const tuitionIdSchema = { params: idParam };
