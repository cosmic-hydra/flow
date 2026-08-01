import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema } from './primitives.js';

export const JobKindSchema = z.enum(['research_booking', 'refresh_offers', 'execute_booking']);
export type JobKind = z.infer<typeof JobKindSchema>;

export const JobStatusSchema = z.enum(['queued', 'leased', 'succeeded', 'failed', 'cancelled']);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const JobSchema = z
  .object({
    id: IdSchema,
    kind: JobKindSchema,
    bookingId: IdSchema,
    userId: IdSchema,
    status: JobStatusSchema,
    runAt: IsoDateTimeSchema,
    attempts: z.int().nonnegative(),
    maxAttempts: z.int().positive(),
    leaseOwner: z.string().optional(),
    leaseUntil: IsoDateTimeSchema.optional(),
    lastError: z.string().optional(),
    payload: z.record(z.string(), z.unknown()).default({}),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .strict();
export type FlowJob = z.infer<typeof JobSchema>;

export const AuditEventSchema = z
  .object({
    id: IdSchema,
    userId: IdSchema,
    bookingId: IdSchema.optional(),
    actorType: z.enum(['user', 'agent', 'worker', 'provider', 'system']),
    actorId: z.string().max(200),
    action: z.string().max(200),
    outcome: z.enum(['success', 'failure', 'denied']),
    metadata: z.record(z.string(), z.unknown()).default({}),
    createdAt: IsoDateTimeSchema,
  })
  .strict();
export type AuditEvent = z.infer<typeof AuditEventSchema>;
