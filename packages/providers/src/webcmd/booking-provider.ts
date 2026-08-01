import type { FlowConfig } from '@flow/config';
import type { BookingCategory, CheckoutResult } from '@flow/contracts';
import type {
  BookingProvider,
  ProviderCheckoutContext,
  ProviderHealth,
  ProviderSearchContext,
  ProviderSearchResult,
} from '../types.js';
import { ProviderError } from '../types.js';
import { WebcmdRunner } from './runner.js';
import {
  dateInTimeZone,
  numberValue,
  offerFromWebcmd,
  rowsFromPayload,
  textValue,
} from './shared.js';

const categories: readonly BookingCategory[] = ['hotel'];

export class WebcmdBookingProvider implements BookingProvider {
  readonly id = 'webcmd:booking';
  readonly name = 'Booking.com via webcmd';
  readonly capability = {
    categories,
    search: true,
    checkout: false,
    couponApplication: false,
    scheduling: true,
  } as const;
  readonly #enabled: boolean;
  readonly #runner: WebcmdRunner;

  constructor(config: FlowConfig['webcmd']) {
    this.#enabled = config.enabled;
    this.#runner = new WebcmdRunner(config);
  }

  isEnabled(): boolean {
    return this.#enabled;
  }

  supports(category: BookingCategory): boolean {
    return categories.includes(category);
  }

  async health(): Promise<ProviderHealth> {
    if (!this.#enabled) return { available: false, message: 'webcmd is disabled' };
    try {
      return { available: true, message: `webcmd ${await this.#runner.version()}` };
    } catch (error) {
      return { available: false, message: error instanceof Error ? error.message : 'Unavailable' };
    }
  }

  async search(context: ProviderSearchContext): Promise<ProviderSearchResult> {
    const destination =
      context.booking.intent.destination?.label ?? context.booking.intent.venue?.label;
    const window = context.booking.intent.timeWindow;
    if (destination === undefined || window === undefined) {
      throw new ProviderError({
        providerId: this.id,
        code: 'hotel_search_incomplete',
        message: 'Hotel search requires a destination and check-in/check-out window',
        retryable: false,
      });
    }
    const lodging = context.booking.intent.lodgingPreference;
    const payload = await this.#runner.runJson({
      providerId: this.id,
      site: 'booking',
      command: 'search',
      positionals: [destination],
      options: {
        checkin: dateInTimeZone(window.start, window.timezone),
        checkout: dateInTimeZone(window.end, window.timezone),
        adults: lodging?.adults ?? context.booking.intent.partySize,
        rooms: lodging?.rooms ?? 1,
        children: lodging?.children ?? 0,
        currency: context.booking.intent.budget?.currency,
        limit: 100,
      },
      access: 'read',
      ...(context.signal === undefined ? {} : { signal: context.signal }),
    });
    const offers = rowsFromPayload(payload).map((row) => {
      const offer = offerFromWebcmd({
        booking: context.booking,
        providerId: this.id,
        providerName: this.name,
        row,
        title: textValue(row, 'name') ?? context.booking.intent.title,
        subtitle: [textValue(row, 'recommended_room'), textValue(row, 'distance')]
          .filter((value) => value !== undefined)
          .join(' · '),
        priceKeys: ['price_amount', 'price'],
        attributes: {
          source: 'booking-search',
          rating: numberValue(row, 'review_score'),
          ratingScale: 10,
          reviewCount: numberValue(row, 'review_count'),
        },
      });
      offer.refundable = textValue(row, 'recommended_room')?.toLowerCase().includes('refundable');
      return offer;
    });
    return { offers, diagnostics: [], deferredRuns: [] };
  }

  async prepareCheckout(_context: ProviderCheckoutContext): Promise<CheckoutResult> {
    throw new ProviderError({
      providerId: this.id,
      code: 'booking_checkout_not_supported',
      message: 'The Booking.com webcmd adapter currently provides search only',
      retryable: false,
    });
  }
}
