import { createHash, randomUUID } from 'node:crypto';
import type { BookingCategory, CheckoutResult, DealEvidence, Money, Offer } from '@flow/contracts';
import type {
  BookingProvider,
  ProviderCheckoutContext,
  ProviderHealth,
  ProviderSearchContext,
  ProviderSearchResult,
} from './types.js';

const supportedCategories: readonly BookingCategory[] = [
  'movie',
  'flight',
  'train',
  'bus',
  'hotel',
  'restaurant',
  'event',
  'activity',
  'appointment',
  'rental',
  'shopping',
  'service',
  'generic',
];

function pseudoRandom(seed: string, index: number): number {
  const digest = createHash('sha256').update(`${seed}:${index}`).digest();
  return digest.readUInt32BE(0) / 0xffff_ffff;
}

function money(amountMinor: number, currency: string): Money {
  return { amountMinor: Math.max(0, Math.round(amountMinor)), currency };
}

function titleFor(category: BookingCategory, query: string, index: number): string {
  const labels: Record<BookingCategory, string[]> = {
    movie: ['Central screen', 'Premium screen', 'Neighborhood cinema'],
    flight: ['Direct fare', 'Flexible fare', 'Value fare'],
    train: ['Express service', 'Intercity service', 'Flexible rail'],
    bus: ['Sleeper coach', 'Express coach', 'Value coach'],
    hotel: ['Design stay', 'Central stay', 'Flexible stay'],
    restaurant: ['Dining reservation', 'Chef table', 'Neighborhood table'],
    event: ['Standard admission', 'Premium admission', 'Flexible admission'],
    activity: ['Guided experience', 'Small-group experience', 'Flexible experience'],
    appointment: ['Priority appointment', 'Standard appointment', 'Flexible appointment'],
    rental: ['Standard rental', 'Flexible rental', 'Premium rental'],
    shopping: ['Best listed price', 'Member price', 'Bundle price'],
    service: ['Verified provider', 'Flexible provider', 'Value provider'],
    generic: ['Recommended option', 'Flexible option', 'Value option'],
  };
  const label = labels[category]?.[index % 3] ?? 'Option';
  return `${query} · ${label}`;
}

export class DemoProvider implements BookingProvider {
  readonly id = 'demo';
  readonly name = 'Flow Demo (simulated)';
  readonly capability = {
    categories: supportedCategories,
    search: true,
    checkout: true,
    couponApplication: true,
    scheduling: true,
  } as const;

  isEnabled(): boolean {
    return true;
  }

  supports(category: BookingCategory): boolean {
    return supportedCategories.includes(category);
  }

  async health(): Promise<ProviderHealth> {
    return { available: true, message: 'Deterministic simulation is available' };
  }

  async search(context: ProviderSearchContext): Promise<ProviderSearchResult> {
    const { booking } = context;
    const currency = booking.intent.budget?.currency ?? 'INR';
    const budget = booking.intent.budget?.amountMinor ?? 50_000;
    const now = new Date();
    const offers: Offer[] = [];

    for (let index = 0; index < 6; index += 1) {
      const variation = 0.45 + pseudoRandom(booking.id, index) * 0.5;
      const baseAmount = Math.max(1_000, Math.round(budget * variation));
      const feeAmount = Math.round(
        baseAmount * (0.02 + pseudoRandom(booking.id, index + 20) * 0.05),
      );
      const discountAmount = index % 2 === 0 ? Math.round(baseAmount * 0.1) : 0;
      const finalAmount = baseAmount + feeAmount;
      const deals: DealEvidence[] =
        discountAmount > 0
          ? [
              {
                kind: 'coupon',
                title: 'Simulated 10% demo discount',
                code: 'FLOW10-DEMO',
                savings: money(discountAmount, currency),
                confidence: 1,
                verifiedAt: now.toISOString(),
                terms: 'Demo provider only; this is not a real-world coupon.',
              },
            ]
          : [];
      const startAt =
        booking.intent.timeWindow?.start ?? new Date(now.getTime() + 86_400_000).toISOString();
      const pricedQuantity = booking.intent.seatPreference?.count ?? booking.intent.partySize;
      offers.push({
        id: randomUUID(),
        bookingId: booking.id,
        providerId: this.id,
        providerName: this.name,
        externalId: `demo-${index + 1}`,
        title: titleFor(booking.intent.category, booking.intent.title, index),
        subtitle: 'Simulated inventory for local development and end-to-end testing',
        startAt,
        basePrice: money(baseAmount, currency),
        fees: money(feeAmount, currency),
        taxes: money(0, currency),
        savings: money(0, currency),
        finalPrice: money(finalAmount, currency),
        refundable: index % 3 !== 0,
        availability: 2 + Math.floor(pseudoRandom(booking.id, index + 40) * 18),
        attributes: {
          demo: true,
          simulated: true,
          rating: 3.8 + pseudoRandom(booking.id, index + 60) * 1.2,
          ratingScale: 5,
          adjacentSeatsAvailable: true,
          ...(booking.intent.seatPreference === undefined
            ? {}
            : {
                unitPrice: money(Math.ceil(finalAmount / pricedQuantity), currency),
                pricedQuantity,
              }),
        },
        deals,
        score: 0,
        scoreBreakdown: {},
        fetchedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 15 * 60_000).toISOString(),
      });
    }

    return {
      offers,
      diagnostics: [
        {
          providerId: this.id,
          level: 'info',
          code: 'simulated_inventory',
          message: 'Results are simulated and cannot create a real-world purchase.',
          retryable: false,
        },
      ],
      deferredRuns: [],
    };
  }

  async prepareCheckout(context: ProviderCheckoutContext): Promise<CheckoutResult> {
    const attempts: Array<{ code: string; status: 'applied' | 'rejected' }> = [];
    let finalPrice = context.offer.finalPrice;
    for (const coupon of context.coupons) {
      if (coupon.code === 'FLOW10-DEMO') {
        attempts.push({ code: coupon.code, status: 'applied' });
        const discount = Math.round(context.offer.basePrice.amountMinor * 0.1);
        finalPrice = money(
          Math.max(0, context.offer.finalPrice.amountMinor - discount),
          context.offer.finalPrice.currency,
        );
        break;
      }
      attempts.push({ code: coupon.code, status: 'rejected' });
    }
    return {
      status: 'confirmed',
      providerId: this.id,
      externalReference: `demo-booking-${randomUUID()}`,
      finalPrice,
      nextAction: 'No action required. This confirmation exists only in the demo environment.',
      providerPayload: { demo: true, couponAttempts: attempts },
    };
  }
}
