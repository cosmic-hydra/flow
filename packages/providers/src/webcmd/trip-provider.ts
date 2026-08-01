import type { FlowConfig } from '@flow/config';
import type { Booking, BookingCategory, CheckoutResult, DealEvidence } from '@flow/contracts';
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

const categories: readonly BookingCategory[] = ['flight', 'train', 'hotel', 'activity', 'rental'];

const countrySlugs: Readonly<Record<string, string>> = {
  GB: 'uk',
  FR: 'france',
  IT: 'italy',
  ES: 'spain',
  DE: 'germany',
  CN: 'china',
};

function dateFromBooking(booking: Booking): string | undefined {
  const window = booking.intent.timeWindow;
  return window === undefined ? undefined : dateInTimeZone(window.start, window.timezone);
}

export class WebcmdTripProvider implements BookingProvider {
  readonly id = 'webcmd:trip';
  readonly name = 'Trip.com via webcmd';
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
    switch (context.booking.intent.category) {
      case 'flight':
        return this.#searchFlights(context);
      case 'train':
        return this.#searchTrains(context);
      case 'activity':
        return this.#searchAttractions(context);
      case 'rental':
        return this.#searchCars(context);
      case 'hotel':
        return {
          offers: [],
          diagnostics: [
            {
              providerId: this.id,
              level: 'info',
              code: 'trip_hotel_city_id_required',
              message: 'Hotel search is delegated to the Booking.com webcmd adapter.',
              retryable: false,
            },
          ],
          deferredRuns: [],
        };
      default:
        return { offers: [], diagnostics: [], deferredRuns: [] };
    }
  }

  async prepareCheckout(_context: ProviderCheckoutContext): Promise<CheckoutResult> {
    throw new ProviderError({
      providerId: this.id,
      code: 'trip_checkout_not_supported',
      message: 'The webcmd Trip adapter provides discovery, not checkout',
      retryable: false,
    });
  }

  async #resolveAirportCode(label: string, explicitCode: string | undefined): Promise<string> {
    if (explicitCode !== undefined && /^[A-Z]{3}$/u.test(explicitCode.toUpperCase())) {
      return explicitCode.toUpperCase();
    }
    const payload = await this.#runner.runJson({
      providerId: this.id,
      site: 'trip',
      command: 'search',
      positionals: [label],
      options: { limit: 10 },
      access: 'read',
    });
    const rows = rowsFromPayload(payload);
    const airportCode = rows.map((row) => textValue(row, 'airportCode')).find(Boolean);
    if (airportCode === undefined) {
      throw new ProviderError({
        providerId: this.id,
        code: 'airport_code_not_found',
        message: `Could not resolve an airport code for ${label}`,
        retryable: false,
      });
    }
    return airportCode;
  }

  async #searchFlights(context: ProviderSearchContext): Promise<ProviderSearchResult> {
    const origin = context.booking.intent.origin;
    const destination = context.booking.intent.destination;
    const date = dateFromBooking(context.booking);
    if (origin === undefined || destination === undefined || date === undefined) {
      throw new ProviderError({
        providerId: this.id,
        code: 'flight_route_incomplete',
        message: 'Flight search requires origin, destination, and a departure date',
        retryable: false,
      });
    }
    const [from, to] = await Promise.all([
      this.#resolveAirportCode(origin.label, origin.code),
      this.#resolveAirportCode(destination.label, destination.code),
    ]);
    const returnWindow = context.booking.intent.returnWindow;
    const returnDate =
      returnWindow === undefined
        ? undefined
        : dateInTimeZone(returnWindow.start, returnWindow.timezone);
    const command = returnDate === undefined ? 'flight' : 'flight-round';
    const options =
      returnDate === undefined
        ? { date, limit: 50 }
        : { depart: date, return: returnDate, limit: 50 };
    const [flightPayload, dealPayload] = await Promise.all([
      this.#runner.runJson({
        providerId: this.id,
        site: 'trip',
        command,
        positionals: [from, to],
        options,
        access: 'read',
        ...(context.signal === undefined ? {} : { signal: context.signal }),
      }),
      this.#runner
        .runJson({
          providerId: this.id,
          site: 'trip',
          command: 'deals',
          options: { limit: 20 },
          access: 'read',
          ...(context.signal === undefined ? {} : { signal: context.signal }),
        })
        .catch(() => []),
    ]);
    const dealEvidence: DealEvidence[] = rowsFromPayload(dealPayload)
      .slice(0, 5)
      .map((row) => {
        const evidence: DealEvidence = {
          kind: 'provider_offer',
          title: textValue(row, 'title', 'offer') ?? 'Trip.com promotion',
          terms: textValue(row, 'discount', 'offer'),
          confidence: 0.7,
        };
        const url = textValue(row, 'url');
        if (url !== undefined && URL.canParse(url)) evidence.sourceUrl = url;
        return evidence;
      });
    const offers = rowsFromPayload(flightPayload).map((row) => {
      const offer = offerFromWebcmd({
        booking: context.booking,
        providerId: this.id,
        providerName: this.name,
        row,
        title: `${textValue(row, 'airline') ?? 'Flight'} ${from} → ${to}`,
        subtitle: [
          textValue(row, 'departureTime'),
          textValue(row, 'arrivalTime'),
          textValue(row, 'duration'),
          textValue(row, 'stops'),
        ]
          .filter((value) => value !== undefined)
          .join(' · '),
        priceKeys: ['price'],
        attributes: {
          source: `trip-${command}`,
          carrier: textValue(row, 'airline'),
          stops:
            numberValue(row, 'stops') ??
            (textValue(row, 'stops')?.toLowerCase().includes('non') === true ? 0 : undefined),
        },
      });
      offer.deals = dealEvidence;
      return offer;
    });
    return { offers, diagnostics: [], deferredRuns: [] };
  }

  async #searchTrains(context: ProviderSearchContext): Promise<ProviderSearchResult> {
    const origin = context.booking.intent.origin;
    const destination = context.booking.intent.destination;
    if (origin === undefined || destination === undefined) {
      throw new ProviderError({
        providerId: this.id,
        code: 'train_route_incomplete',
        message: 'Train search requires origin and destination',
        retryable: false,
      });
    }
    const metadataCountry = context.booking.intent.metadata.countrySlug;
    const country =
      typeof metadataCountry === 'string'
        ? metadataCountry
        : countrySlugs[origin.countryCode ?? destination.countryCode ?? ''];
    if (country === undefined) {
      return {
        offers: [],
        diagnostics: [
          {
            providerId: this.id,
            level: 'warning',
            code: 'trip_train_country_unsupported',
            message: 'Trip train search needs a supported countrySlug in booking metadata.',
            retryable: false,
          },
        ],
        deferredRuns: [],
      };
    }
    const payload = await this.#runner.runJson({
      providerId: this.id,
      site: 'trip',
      command: 'train',
      positionals: [origin.label, destination.label],
      options: { country, limit: 50 },
      access: 'read',
      ...(context.signal === undefined ? {} : { signal: context.signal }),
    });
    const offers = rowsFromPayload(payload).map((row) =>
      offerFromWebcmd({
        booking: context.booking,
        providerId: this.id,
        providerName: this.name,
        row,
        title: `${textValue(row, 'fromStation') ?? origin.label} → ${textValue(row, 'toStation') ?? destination.label}`,
        subtitle: [textValue(row, 'departureTime'), textValue(row, 'duration')]
          .filter((value) => value !== undefined)
          .join(' · '),
        priceKeys: ['price'],
        attributes: {
          source: 'trip-train',
          changes: numberValue(row, 'changes'),
          stops: numberValue(row, 'changes'),
        },
      }),
    );
    return { offers, diagnostics: [], deferredRuns: [] };
  }

  async #searchAttractions(context: ProviderSearchContext): Promise<ProviderSearchResult> {
    const query = context.booking.intent.destination?.label ?? context.booking.intent.title;
    const payload = await this.#runner.runJson({
      providerId: this.id,
      site: 'trip',
      command: 'attraction',
      positionals: [query],
      options: { limit: 50 },
      access: 'read',
      ...(context.signal === undefined ? {} : { signal: context.signal }),
    });
    const offers = rowsFromPayload(payload).map((row) =>
      offerFromWebcmd({
        booking: context.booking,
        providerId: this.id,
        providerName: this.name,
        row,
        title: textValue(row, 'name') ?? context.booking.intent.title,
        subtitle: [textValue(row, 'rating'), textValue(row, 'reviews')]
          .filter((value) => value !== undefined)
          .join(' · '),
        priceKeys: ['price'],
        attributes: {
          source: 'trip-attraction',
          rating: numberValue(row, 'rating'),
          ratingScale: 5,
        },
      }),
    );
    return { offers, diagnostics: [], deferredRuns: [] };
  }

  async #searchCars(context: ProviderSearchContext): Promise<ProviderSearchResult> {
    const cityLabel =
      context.booking.intent.destination?.label ?? context.booking.intent.venue?.label;
    if (cityLabel === undefined) {
      throw new ProviderError({
        providerId: this.id,
        code: 'rental_city_missing',
        message: 'Car rental search requires a destination city',
        retryable: false,
      });
    }
    const lookup = await this.#runner.runJson({
      providerId: this.id,
      site: 'trip',
      command: 'search',
      positionals: [cityLabel],
      options: { limit: 10 },
      access: 'read',
    });
    const cityId = rowsFromPayload(lookup)
      .map((row) => numberValue(row, 'cityId'))
      .find(Boolean);
    if (cityId === undefined) {
      throw new ProviderError({
        providerId: this.id,
        code: 'rental_city_not_found',
        message: `Could not resolve a Trip.com city id for ${cityLabel}`,
        retryable: false,
      });
    }
    const payload = await this.#runner.runJson({
      providerId: this.id,
      site: 'trip',
      command: 'car',
      positionals: [String(cityId)],
      options: { limit: 50 },
      access: 'read',
      ...(context.signal === undefined ? {} : { signal: context.signal }),
    });
    const offers = rowsFromPayload(payload).map((row) =>
      offerFromWebcmd({
        booking: context.booking,
        providerId: this.id,
        providerName: this.name,
        row,
        title: textValue(row, 'vehicle', 'category') ?? context.booking.intent.title,
        subtitle: [textValue(row, 'category'), textValue(row, 'seats')]
          .filter((value) => value !== undefined)
          .join(' · '),
        priceKeys: ['price'],
        attributes: { source: 'trip-car' },
      }),
    );
    return { offers, diagnostics: [], deferredRuns: [] };
  }
}
