import type { Offer } from '@flow/contracts';
import { describe, expect, it } from 'vitest';
import { currencyValue, dateInTimeZone, priceOfferForQuantity, timeInTimeZone } from './shared.js';

describe('webcmd time mapping', () => {
  it('uses the booking timezone rather than UTC for provider filters', () => {
    expect(dateInTimeZone('2026-08-01T20:00:00.000Z', 'Asia/Kolkata')).toBe('2026-08-02');
    expect(timeInTimeZone('2026-08-01T20:00:00.000Z', 'Asia/Kolkata')).toBe('01:30');
  });
});

describe('webcmd quantity pricing', () => {
  it('converts a per-seat listing into an approved-party total', () => {
    const offer: Offer = {
      id: '60000000-0000-4000-8000-000000000001',
      bookingId: '60000000-0000-4000-8000-000000000002',
      providerId: 'webcmd:district',
      providerName: 'District via webcmd',
      externalId: 'show-1',
      title: 'Movie',
      subtitle: '',
      basePrice: { amountMinor: 44_000, currency: 'INR' },
      fees: { amountMinor: 0, currency: 'INR' },
      taxes: { amountMinor: 0, currency: 'INR' },
      savings: { amountMinor: 0, currency: 'INR' },
      finalPrice: { amountMinor: 44_000, currency: 'INR' },
      attributes: {},
      deals: [],
      score: 0,
      scoreBreakdown: {},
      fetchedAt: '2026-08-01T10:00:00.000Z',
    };

    const priced = priceOfferForQuantity(offer, 2);

    expect(priced.finalPrice).toEqual({ amountMinor: 88_000, currency: 'INR' });
    expect(priced.attributes).toMatchObject({
      unitPrice: { amountMinor: 44_000, currency: 'INR' },
      pricedQuantity: 2,
    });
  });

  it('uses an embedded currency code instead of an unrelated budget currency', () => {
    expect(currencyValue({ priceRange: 'INR 440-1000' }, 'USD')).toBe('INR');
  });
});
