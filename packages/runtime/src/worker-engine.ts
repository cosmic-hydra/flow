import type { FlowJob } from '@flow/contracts';
import type { FlowStore } from '@flow/db';
import type { BookingService } from './booking-service.js';
import type { RuntimeLogger } from './logger.js';
import { silentLogger } from './logger.js';

export interface WorkerEngineOptions {
  workerId: string;
  pollMs: number;
  concurrency: number;
  leaseSeconds: number;
}

export class WorkerEngine {
  readonly #store: FlowStore;
  readonly #bookingService: BookingService;
  readonly #options: WorkerEngineOptions;
  readonly #logger: RuntimeLogger;
  #stopping = false;
  #loop: Promise<void> | undefined;
  #wake: (() => void) | undefined;

  constructor(input: {
    store: FlowStore;
    bookingService: BookingService;
    options: WorkerEngineOptions;
    logger?: RuntimeLogger;
  }) {
    this.#store = input.store;
    this.#bookingService = input.bookingService;
    this.#options = input.options;
    this.#logger = input.logger ?? silentLogger;
  }

  start(): void {
    if (this.#loop !== undefined) return;
    this.#stopping = false;
    this.#loop = this.#run();
  }

  async stop(): Promise<void> {
    this.#stopping = true;
    this.#wake?.();
    await this.#loop;
    this.#loop = undefined;
  }

  async runOnce(): Promise<number> {
    const jobs = await this.#store.claimJobs(
      this.#options.workerId,
      this.#options.concurrency,
      this.#options.leaseSeconds,
    );
    await Promise.all(jobs.map((job) => this.#process(job)));
    return jobs.length;
  }

  async #run(): Promise<void> {
    this.#logger.info({ workerId: this.#options.workerId }, 'Worker started');
    while (!this.#stopping) {
      let count = 0;
      try {
        count = await this.runOnce();
      } catch (error) {
        this.#logger.error(
          { error: error instanceof Error ? error.message : String(error) },
          'Worker poll failed',
        );
      }
      if (this.#stopping) break;
      if (count === this.#options.concurrency) continue;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, this.#options.pollMs);
        this.#wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });
      this.#wake = undefined;
    }
    this.#logger.info({ workerId: this.#options.workerId }, 'Worker stopped');
  }

  async #process(job: FlowJob): Promise<void> {
    const heartbeatIntervalMs = Math.max(
      1_000,
      Math.floor((this.#options.leaseSeconds * 1_000) / 3),
    );
    let heartbeatStopped = false;
    const heartbeat = setInterval(() => {
      if (heartbeatStopped) return;
      void this.#store
        .extendJobLease(job.id, this.#options.workerId, this.#options.leaseSeconds)
        .then((extended) => {
          if (heartbeatStopped) return;
          if (extended) return;
          heartbeatStopped = true;
          clearInterval(heartbeat);
          this.#logger.warn(
            { jobId: job.id, kind: job.kind },
            'Job lease was lost while work was still running',
          );
        })
        .catch((error: unknown) => {
          if (heartbeatStopped) return;
          this.#logger.error(
            {
              jobId: job.id,
              error: error instanceof Error ? error.message : String(error),
            },
            'Unable to extend job lease',
          );
        });
    }, heartbeatIntervalMs);
    try {
      switch (job.kind) {
        case 'research_booking':
        case 'refresh_offers':
          await this.#bookingService.researchBooking(job.userId, job.bookingId);
          break;
        case 'execute_booking':
          await this.#bookingService.executeBooking(job.userId, job.bookingId);
          break;
      }
      const completed = await this.#store.completeJob(job.id, this.#options.workerId);
      if (!completed) {
        this.#logger.warn(
          { jobId: job.id, kind: job.kind },
          'Job lease was lost before completion could be recorded',
        );
        return;
      }
      this.#logger.info({ jobId: job.id, kind: job.kind }, 'Job completed');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failed = await this.#store.failJob(job.id, this.#options.workerId, message);
      if (!failed) {
        this.#logger.warn(
          { jobId: job.id, kind: job.kind, error: message },
          'Job lease was lost before failure could be recorded',
        );
        return;
      }
      await this.#store.writeAuditEvent({
        userId: job.userId,
        bookingId: job.bookingId,
        actorType: 'worker',
        actorId: this.#options.workerId,
        action: `job.${job.kind}`,
        outcome: 'failure',
        metadata: { jobId: job.id, attempt: job.attempts, error: message },
      });
      this.#logger.warn({ jobId: job.id, kind: job.kind, error: message }, 'Job failed');
    } finally {
      heartbeatStopped = true;
      clearInterval(heartbeat);
    }
  }
}
