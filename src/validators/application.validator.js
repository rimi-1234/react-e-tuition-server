import { z } from 'zod';
import { APPLICATION_STATUS_LIST } from '../config/constants.js';
import { idParam, money, objectId, optionalEnum, pagination, text } from './common.js';

export const applySchema = {
  body: z.object({
    tuitionId: objectId,
    qualifications: text(300, 3),
    experience: z.coerce.number().int().min(0).max(60),
    expectedSalary: money.refine((v) => v >= 500, { message: 'Expected salary should be at least 500 BDT' }),
    message: text(1000).default(''),
  }),
};

export const updateApplicationSchema = {
  params: idParam,
  body: z
    .object({
      qualifications: text(300, 3),
      experience: z.coerce.number().int().min(0).max(60),
      expectedSalary: money.refine((v) => v >= 500, { message: 'Expected salary should be at least 500 BDT' }),
      message: text(1000),
    })
    .partial()
    .refine((b) => Object.keys(b).length > 0, { message: 'Nothing to update' }),
};

export const listApplicationsSchema = {
  query: z.object({
    status: optionalEnum(APPLICATION_STATUS_LIST),
    tuitionId: objectId.optional(),
    ...pagination(20, 100),
  }),
};

export const applicationIdSchema = { params: idParam };
export const tuitionParamSchema = { params: z.object({ tuitionId: objectId }) };
