import { z } from 'zod';
import { IanaTimeZoneSchema, IdSchema, IsoDateTimeSchema } from './primitives.js';

export const UserSchema = z
  .object({
    id: IdSchema,
    email: z.email(),
    displayName: z.string().trim().min(1).max(120),
    timezone: IanaTimeZoneSchema,
    createdAt: IsoDateTimeSchema,
  })
  .strict();
export type User = z.infer<typeof UserSchema>;

export const TokenLoginSchema = z
  .object({
    token: z.string().trim().min(32).max(512),
  })
  .strict();

export const CreateTokenSchema = z
  .object({
    userId: IdSchema,
    name: z.string().trim().min(1).max(120),
    expiresAt: IsoDateTimeSchema.optional(),
  })
  .strict();
