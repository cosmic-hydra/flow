import type { FlowConfig } from '@flow/config';
import type { BookingCategory, CheckoutResult } from '@flow/contracts';
import type {
  BookingProvider,
  ProviderCheckoutContext,
  ProviderHealth,
  ProviderSearchContext,
  ProviderSearchResult,
} from './types.js';
import { ProviderError } from './types.js';
import { dateInTimeZone } from './webcmd/shared.js';

const categories: readonly BookingCategory[] = ['flight', 'train'];

interface UiPathJob {
  Key?: string;
  Id?: number;
  State?: string;
}

interface UiPathStartResponse {
  value?: UiPathJob[];
}

export class UiPathProvider implements BookingProvider {
  readonly id = 'uipath:ticket-booking-bot';
  readonly name = 'Ticket Booking Bot via UiPath';
  readonly capability = {
    categories,
    search: true,
    checkout: false,
    couponApplication: false,
    scheduling: true,
  } as const;
  readonly #config: FlowConfig['uiPath'];

  constructor(config: FlowConfig['uiPath']) {
    this.#config = config;
  }

  isEnabled(): boolean {
    return (
      this.#config.baseUrl !== undefined &&
      this.#config.accessToken !== undefined &&
      this.#config.folderId !== undefined &&
      this.#config.releaseKey !== undefined
    );
  }

  supports(category: BookingCategory): boolean {
    return category === 'flight' || category === 'train';
  }

  async health(): Promise<ProviderHealth> {
    return this.isEnabled()
      ? { available: true, message: 'UiPath Orchestrator job bridge is configured' }
      : { available: false, message: 'UiPath Orchestrator is not configured' };
  }

  async search(context: ProviderSearchContext): Promise<ProviderSearchResult> {
    if (!this.isEnabled()) {
      throw new ProviderError({
        providerId: this.id,
        code: 'uipath_unconfigured',
        message: 'UiPath Orchestrator is not configured',
        retryable: false,
      });
    }
    const origin = context.booking.intent.origin;
    const destination = context.booking.intent.destination;
    const timeWindow = context.booking.intent.timeWindow;
    const date =
      timeWindow === undefined ? undefined : dateInTimeZone(timeWindow.start, timeWindow.timezone);
    if (origin === undefined || destination === undefined || date === undefined) {
      throw new ProviderError({
        providerId: this.id,
        code: 'uipath_route_incomplete',
        message: 'UiPath discovery requires origin, destination, and travel date',
        retryable: false,
      });
    }
    const email =
      typeof context.booking.intent.metadata.contactEmail === 'string'
        ? context.booking.intent.metadata.contactEmail
        : '';
    const inputArguments =
      context.booking.intent.category === 'flight'
        ? { source: origin.label, destination: destination.label, date1: date, email }
        : { source1: origin.label, destination1: destination.label, date2: date, email1: email };
    const job = await this.#startJob(inputArguments, context.signal);
    const externalReference = job.Key ?? String(job.Id ?? 'unknown');
    return {
      offers: [],
      diagnostics: [
        {
          providerId: this.id,
          level: 'info',
          code: 'uipath_discovery_queued',
          message: 'The sanitized UiPath discovery workflow was queued asynchronously.',
          retryable: false,
        },
      ],
      deferredRuns: [
        {
          providerId: this.id,
          externalReference,
          status: job.State?.toLowerCase() === 'running' ? 'running' : 'queued',
          message: 'UiPath will deliver its flight/train comparison using the configured workflow.',
        },
      ],
    };
  }

  async prepareCheckout(_context: ProviderCheckoutContext): Promise<CheckoutResult> {
    throw new ProviderError({
      providerId: this.id,
      code: 'uipath_checkout_not_supported',
      message:
        'The referenced UiPath project discovers and exports tickets; it does not complete checkout',
      retryable: false,
    });
  }

  async #startJob(
    inputArguments: Record<string, unknown>,
    externalSignal?: AbortSignal,
  ): Promise<UiPathJob> {
    const baseUrl = this.#config.baseUrl;
    const accessToken = this.#config.accessToken;
    const folderId = this.#config.folderId;
    const releaseKey = this.#config.releaseKey;
    if (
      baseUrl === undefined ||
      accessToken === undefined ||
      folderId === undefined ||
      releaseKey === undefined
    ) {
      throw new Error('UiPath provider invariant failed');
    }
    const timeoutSignal = AbortSignal.timeout(30_000);
    const signal =
      externalSignal === undefined
        ? timeoutSignal
        : AbortSignal.any([externalSignal, timeoutSignal]);
    const response = await fetch(
      `${baseUrl.replace(/\/$/u, '')}/odata/Jobs/UiPath.Server.Configuration.OData.StartJobs`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
          'x-uipath-organizationunitid': folderId,
        },
        body: JSON.stringify({
          startInfo: {
            ReleaseKey: releaseKey,
            Strategy: 'ModernJobsCount',
            JobsCount: 1,
            InputArguments: JSON.stringify(inputArguments),
          },
        }),
        signal,
      },
    );
    if (!response.ok) {
      const body = (await response.text()).slice(0, 1_500);
      throw new ProviderError({
        providerId: this.id,
        code: 'uipath_start_failed',
        message: `UiPath returned HTTP ${response.status}: ${body}`,
        retryable: response.status >= 500 || response.status === 429,
      });
    }
    const payload = (await response.json()) as UiPathStartResponse;
    const job = payload.value?.[0];
    if (job === undefined) {
      throw new ProviderError({
        providerId: this.id,
        code: 'uipath_job_missing',
        message: 'UiPath accepted the request but returned no job reference',
        retryable: true,
      });
    }
    return job;
  }
}
