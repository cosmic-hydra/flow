import type {
  Approval,
  Booking,
  BookingCategory,
  CheckoutResult,
  CouponCandidate,
  Offer,
} from '@flow/contracts';

export interface ProviderCapability {
  categories: readonly BookingCategory[];
  search: boolean;
  checkout: boolean;
  couponApplication: boolean;
  scheduling: boolean;
}

export interface ProviderDiagnostic {
  providerId: string;
  level: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  retryable: boolean;
}

export interface DeferredProviderRun {
  providerId: string;
  externalReference: string;
  status: 'queued' | 'running';
  message: string;
}

export interface ProviderSearchContext {
  booking: Booking;
  signal?: AbortSignal;
}

export interface ProviderSearchResult {
  offers: Offer[];
  diagnostics: ProviderDiagnostic[];
  deferredRuns: DeferredProviderRun[];
}

export interface ProviderCheckoutContext {
  booking: Booking;
  offer: Offer;
  approval: Approval;
  coupons: readonly CouponCandidate[];
  signal?: AbortSignal;
}

export interface ProviderHealth {
  available: boolean;
  message: string;
}

export interface BookingProvider {
  readonly id: string;
  readonly name: string;
  readonly capability: ProviderCapability;
  isEnabled(): boolean;
  supports(category: BookingCategory): boolean;
  health(): Promise<ProviderHealth>;
  search(context: ProviderSearchContext): Promise<ProviderSearchResult>;
  prepareCheckout(context: ProviderCheckoutContext): Promise<CheckoutResult>;
}

export class ProviderError extends Error {
  readonly providerId: string;
  readonly code: string;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(input: {
    providerId: string;
    code: string;
    message: string;
    retryable: boolean;
    details?: Record<string, unknown>;
  }) {
    super(input.message);
    this.name = 'ProviderError';
    this.providerId = input.providerId;
    this.code = input.code;
    this.retryable = input.retryable;
    if (input.details !== undefined) this.details = input.details;
  }
}

export function emptySearchResult(): ProviderSearchResult {
  return { offers: [], diagnostics: [], deferredRuns: [] };
}
