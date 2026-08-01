import type { FlowJob } from '@flow/contracts';
import type { FlowStore } from '@flow/db';
import { describe, expect, it, vi } from 'vitest';
import type { BookingService } from './booking-service.js';
import { WorkerEngine } from './worker-engine.js';

const job: FlowJob = {
  id: '40000000-0000-4000-8000-000000000001',
  kind: 'research_booking',
  bookingId: '40000000-0000-4000-8000-000000000002',
  userId: '40000000-0000-4000-8000-000000000003',
  status: 'leased',
  runAt: '2026-08-01T10:00:00.000Z',
  attempts: 1,
  maxAttempts: 5,
  leaseOwner: 'worker-a',
  leaseUntil: '2099-08-01T10:02:00.000Z',
  payload: {},
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-01T10:00:00.000Z',
};

function engineWith(input: {
  store: Record<string, unknown>;
  bookingService: Record<string, unknown>;
}): WorkerEngine {
  return new WorkerEngine({
    store: input.store as unknown as FlowStore,
    bookingService: input.bookingService as unknown as BookingService,
    options: { workerId: 'worker-a', pollMs: 1_000, concurrency: 4, leaseSeconds: 120 },
  });
}

describe('worker leases', () => {
  it('records completion only under the worker that owns the lease', async () => {
    const completeJob = vi.fn(async () => true);
    const worker = engineWith({
      store: {
        claimJobs: vi.fn(async () => [job]),
        completeJob,
      },
      bookingService: { researchBooking: vi.fn(async () => undefined) },
    });

    await expect(worker.runOnce()).resolves.toBe(1);
    expect(completeJob).toHaveBeenCalledWith(job.id, 'worker-a');
  });

  it('does not write a job failure audit after its lease has been reclaimed', async () => {
    const failJob = vi.fn(async () => false);
    const writeAuditEvent = vi.fn(async () => ({ id: 'audit-event-id' }));
    const worker = engineWith({
      store: {
        claimJobs: vi.fn(async () => [job]),
        failJob,
        writeAuditEvent,
      },
      bookingService: {
        researchBooking: vi.fn(async () => {
          throw new Error('Provider timed out');
        }),
      },
    });

    await expect(worker.runOnce()).resolves.toBe(1);
    expect(failJob).toHaveBeenCalledWith(job.id, 'worker-a', 'Provider timed out');
    expect(writeAuditEvent).not.toHaveBeenCalled();
  });
});
