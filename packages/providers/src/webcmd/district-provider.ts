import type { FlowConfig } from '@flow/config';
import type { BookingCategory, CheckoutResult } from '@flow/contracts';
import { rankSeatGroups, type SeatCoordinate } from '@flow/core';
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
  priceOfferForQuantity,
  priceMoney,
  rowsFromPayload,
  textValue,
  timeInTimeZone,
} from './shared.js';

const categories: readonly BookingCategory[] = [
  'movie',
  'restaurant',
  'event',
  'activity',
  'shopping',
  'generic',
];

export class WebcmdDistrictProvider implements BookingProvider {
  readonly id = 'webcmd:district';
  readonly name = 'District via webcmd';
  readonly capability = {
    categories,
    search: true,
    checkout: true,
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
      const version = await this.#runner.version();
      return { available: true, message: `webcmd ${version}` };
    } catch (error) {
      return { available: false, message: error instanceof Error ? error.message : 'Unavailable' };
    }
  }

  async search(context: ProviderSearchContext): Promise<ProviderSearchResult> {
    const { booking } = context;
    if (booking.intent.category === 'movie') {
      const options: Record<string, string | number | boolean | undefined> = { limit: 100 };
      if (booking.intent.timeWindow !== undefined) {
        options.date = dateInTimeZone(
          booking.intent.timeWindow.start,
          booking.intent.timeWindow.timezone,
        );
        options.after = timeInTimeZone(
          booking.intent.timeWindow.start,
          booking.intent.timeWindow.timezone,
        );
        options.before = timeInTimeZone(
          booking.intent.timeWindow.end,
          booking.intent.timeWindow.timezone,
        );
      }
      const city = booking.intent.venue?.city ?? booking.intent.destination?.city;
      if (city !== undefined) options.city = city;
      const maxPerSeat = booking.intent.seatPreference?.maxPricePerSeat;
      if (maxPerSeat !== undefined) options['max-price'] = maxPerSeat.amountMinor / 100;
      const payload = await this.#runner.runJson({
        providerId: this.id,
        site: 'district',
        command: 'showtimes',
        positionals: [booking.intent.title],
        options,
        access: 'read',
        ...(context.signal === undefined ? {} : { signal: context.signal }),
      });
      const pricedQuantity = booking.intent.seatPreference?.count ?? booking.intent.partySize;
      const offers = rowsFromPayload(payload).map((row) => {
        const offer = priceOfferForQuantity(
          offerFromWebcmd({
            booking,
            providerId: this.id,
            providerName: this.name,
            row,
            title: textValue(row, 'movie') ?? booking.intent.title,
            subtitle: [textValue(row, 'cinema'), textValue(row, 'time'), textValue(row, 'format')]
              .filter((value) => value !== undefined)
              .join(' · '),
            priceKeys: ['priceRange', 'price'],
            attributes: { source: 'district-showtimes' },
          }),
          pricedQuantity,
        );
        const availability = numberValue(row, 'available');
        if (availability !== undefined) offer.availability = availability;
        return offer;
      });
      return { offers, diagnostics: [], deferredRuns: [] };
    }

    const tabByCategory: Partial<Record<BookingCategory, string>> = {
      restaurant: 'dining',
      event: 'events',
      activity: 'activities',
      shopping: 'stores',
    };
    const payload = await this.#runner.runJson({
      providerId: this.id,
      site: 'district',
      command: 'search',
      positionals: [booking.intent.title],
      options: { tab: tabByCategory[booking.intent.category] ?? 'all', limit: 50 },
      access: 'read',
      ...(context.signal === undefined ? {} : { signal: context.signal }),
    });
    const offers = rowsFromPayload(payload).map((row) =>
      offerFromWebcmd({
        booking,
        providerId: this.id,
        providerName: this.name,
        row,
        title: textValue(row, 'title') ?? booking.intent.title,
        subtitle: [textValue(row, 'venue'), textValue(row, 'date')]
          .filter((value) => value !== undefined)
          .join(' · '),
        priceKeys: ['price'],
        attributes: { source: 'district-search' },
      }),
    );
    return { offers, diagnostics: [], deferredRuns: [] };
  }

  async prepareCheckout(context: ProviderCheckoutContext): Promise<CheckoutResult> {
    if (context.booking.intent.category !== 'movie') {
      throw new ProviderError({
        providerId: this.id,
        code: 'district_checkout_unsupported_category',
        message: 'Automated District checkout is currently limited to movie seats',
        retryable: false,
      });
    }
    const show = context.offer.url ?? textValue(context.offer.attributes, 'showId');
    if (show === undefined) {
      throw new ProviderError({
        providerId: this.id,
        code: 'district_show_reference_missing',
        message: 'The selected District offer has no show reference',
        retryable: false,
      });
    }

    const preference = context.booking.intent.seatPreference;
    const count = preference?.count ?? context.booking.intent.partySize;
    const seatPayload = await this.#runner.runJson({
      providerId: this.id,
      site: 'district',
      command: 'seats',
      positionals: [show],
      options: {
        count,
        together: preference?.together === false ? 'false' : 'true',
        'max-price':
          preference?.maxPricePerSeat?.amountMinor === undefined
            ? undefined
            : preference.maxPricePerSeat.amountMinor / 100,
        limit: 300,
      },
      access: 'read',
      ...(context.signal === undefined ? {} : { signal: context.signal }),
    });
    const seatRows = rowsFromPayload(seatPayload);
    const seats: SeatCoordinate[] = seatRows.map((row, index) => {
      const className = textValue(row, 'seatClass');
      const section = textValue(row, 'section', 'seatSection');
      const seatId = textValue(row, 'seat') ?? `seat-${index + 1}`;
      const rowLabel = textValue(row, 'row') ?? seatId.match(/^[A-Za-z]+/u)?.[0];
      const parsedRow = rowLabel
        ?.toUpperCase()
        .split('')
        .reduce((total, character) => total * 26 + character.charCodeAt(0) - 64, 0);
      const parsedColumn = Number(seatId.match(/(\d+)$/u)?.[1]);
      const rawAccessible = row.accessible ?? row.isAccessible;
      const accessible =
        rawAccessible === true ||
        (typeof rawAccessible === 'string' && /^(true|yes|accessible)$/iu.test(rawAccessible));
      return {
        id: seatId,
        row:
          numberValue(row, 'row') ??
          (parsedRow === undefined || parsedRow <= 0 ? index + 1 : parsedRow),
        column:
          numberValue(row, 'column', 'number') ??
          (Number.isFinite(parsedColumn) && parsedColumn > 0 ? parsedColumn : index + 1),
        priceMinor: Math.round((numberValue(row, 'price') ?? 0) * 100),
        available: (textValue(row, 'status') ?? 'available').toLowerCase() === 'available',
        ...(rowLabel === undefined ? {} : { rowLabel: String(rowLabel) }),
        ...(section === undefined ? {} : { section }),
        ...(className === undefined ? {} : { className }),
        ...(rawAccessible === undefined ? {} : { accessible }),
      };
    });
    const ranked = rankSeatGroups(seats, {
      count,
      together: preference?.together ?? true,
      preferCenter: preference?.preferCenter ?? true,
      avoidFrontRows: preference?.avoidFrontRows ?? 2,
      preferredRows: preference?.preferredRows ?? [],
      preferredSections: preference?.preferredSections ?? [],
      preferredClasses: preference?.preferredClasses ?? [],
      accessibilityRequired: preference?.accessibilityRequired ?? false,
      ...(preference?.maxPricePerSeat === undefined
        ? {}
        : { maxPricePerSeatMinor: preference.maxPricePerSeat.amountMinor }),
    });
    const selected = ranked[0]?.seats ?? seats.slice(0, count);
    if (selected.length !== count) {
      throw new ProviderError({
        providerId: this.id,
        code: 'district_seats_unavailable',
        message: `Unable to find ${count} seats matching the approved constraints`,
        retryable: true,
      });
    }

    const checkoutPayload = await this.#runner.runJson({
      providerId: this.id,
      site: 'district',
      command: 'checkout',
      positionals: [show],
      options: { seats: selected.map((seat) => seat.id).join(','), payment: 'review', timeout: 45 },
      access: 'write',
      ...(context.signal === undefined ? {} : { signal: context.signal }),
    });
    const checkoutRow = rowsFromPayload(checkoutPayload)[0] ?? {};
    const handoffUrl = textValue(checkoutRow, 'paymentUrl');
    const safeHandoffUrl =
      handoffUrl !== undefined &&
      URL.canParse(handoffUrl) &&
      new URL(handoffUrl).protocol === 'https:'
        ? handoffUrl
        : undefined;
    const total = numberValue(checkoutRow, 'total', 'paymentAmount', 'orderAmount');
    if (total === undefined || total <= 0) {
      throw new ProviderError({
        providerId: this.id,
        code: 'district_checkout_total_missing',
        message: 'District checkout did not expose a verifiable final total',
        retryable: true,
      });
    }
    return {
      status: 'awaiting_user_action',
      providerId: this.id,
      externalReference: textValue(checkoutRow, 'showId') ?? context.offer.externalId,
      finalPrice: priceMoney(
        checkoutRow,
        context.offer.finalPrice.currency,
        'total',
        'paymentAmount',
        'orderAmount',
      ),
      seats: selected.map((seat) => seat.id),
      nextAction: 'Review the held seats in the browser and complete payment yourself.',
      ...(safeHandoffUrl === undefined ? {} : { handoffUrl: safeHandoffUrl }),
      providerPayload: checkoutRow,
    };
  }
}
