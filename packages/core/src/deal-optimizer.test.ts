import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { BookingIntent, Offer } from '@flow/contracts';
import { rankOffers } from './deal-optimizer.js';

const intent: BookingIntent = {
  category: 'movie',
  title: 'A film',
  description: '',
  partySize: 2,
  preferredProviders: [],
  excludedProviders: [],
  constraints: [],
  metadata: {},
};

function offer(amountMinor: number, providerId: string): Offer {
  const bookingId = randomUUID();
  return {
    id: randomUUID(),
    bookingId,
    providerId,
    providerName: providerId,
    externalId: randomUUID(),
    title: 'A film',
    subtitle: '',
    basePrice: { amountMinor, currency: 'INR' },
    fees: { amountMinor: 0, currency: 'INR' },
    taxes: { amountMinor: 0, currency: 'INR' },
    savings: { amountMinor: 0, currency: 'INR' },
    finalPrice: { amountMinor, currency: 'INR' },
    attributes: {},
    deals: [],
    score: 0,
    scoreBreakdown: {},
    fetchedAt: new Date().toISOString(),
  };
}

describe('deal optimizer', () => {
  it('deterministically ranks the cheaper otherwise-equivalent offer first', () => {
    const expensive = offer(30_000, 'provider-b');
    const cheap = { ...offer(20_000, 'provider-a'), bookingId: expensive.bookingId };
    const ranked = rankOffers(intent, [expensive, cheap]);

    expect(ranked.map((item) => item.providerId)).toEqual(['provider-a', 'provider-b']);
    expect(ranked[0]?.score).toBeGreaterThan(ranked[1]?.score ?? 0);
  });

  it('rejects offers that violate typed capacity and travel constraints', () => {
    const constrainedIntent: BookingIntent = {
      ...intent,
      category: 'flight',
      travelPreference: {
        cabinClasses: [],
        maxStops: 1,
        preferredCarriers: [],
        avoidedCarriers: ['Avoid Air'],
        refundableOnly: false,
        baggageRequired: false,
      },
    };
    const valid = {
      ...offer(30_000, 'valid'),
      availability: 2,
      attributes: { carrier: 'Good Air', stops: 1 },
    };
    const noCapacity = { ...valid, id: randomUUID(), providerId: 'full', availability: 1 };
    const tooManyStops = {
      ...valid,
      id: randomUUID(),
      providerId: 'stops',
      attributes: { carrier: 'Good Air', stops: 2 },
    };
    const avoided = {
      ...valid,
      id: randomUUID(),
      providerId: 'avoided',
      attributes: { carrier: 'Avoid Air', stops: 0 },
    };

    expect(rankOffers(constrainedIntent, [noCapacity, tooManyStops, avoided, valid])).toEqual([
      expect.objectContaining({ providerId: 'valid' }),
    ]);
  });

  it('normalizes provider rating scales before applying a lodging minimum', () => {
    const lodgingIntent: BookingIntent = {
      ...intent,
      category: 'hotel',
      lodgingPreference: {
        rooms: 1,
        adults: 2,
        children: 0,
        minimumRating: 8,
        amenities: [],
        refundableOnly: false,
      },
    };
    const highlyRated = {
      ...offer(20_000, 'hotel-a'),
      attributes: { rating: 4.5, ratingScale: 5 },
    };
    const lowRated = {
      ...offer(15_000, 'hotel-b'),
      attributes: { rating: 3.5, ratingScale: 5 },
    };

    expect(rankOffers(lodgingIntent, [lowRated, highlyRated])).toEqual([
      expect.objectContaining({ providerId: 'hotel-a' }),
    ]);
  });
});
