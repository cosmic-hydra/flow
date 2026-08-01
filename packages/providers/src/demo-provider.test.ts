import type { Approval, Booking, Offer } from '@flow/contracts';
import { describe, expect, it } from 'vitest';
import { DemoProvider } from './demo-provider.js';

const booking: Booking = {
  id: '20000000-0000-4000-8000-000000000001',
  userId: '20000000-0000-4000-8000-000000000002',
  status: 'executing',
  intent: {
    category: 'movie',
    title: 'Test movie',
    description: '',
    partySize: 2,
    preferredProviders: [],
    excludedProviders: [],
    constraints: [],
    metadata: {},
  },
  automation: {
    researchAt: '2026-08-01T10:00:00.000Z',
    deadline: '2026-08-02T10:00:00.000Z',
    refreshIntervalMinutes: 60,
    maxCouponAttempts: 8,
    autoExecuteWithinApproval: false,
  },
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-01T10:00:00.000Z',
};

const offer: Offer = {
  id: '20000000-0000-4000-8000-000000000003',
  bookingId: booking.id,
  providerId: 'demo',
  providerName: 'Flow Demo (simulated)',
  externalId: 'demo-1',
  title: 'Test movie',
  subtitle: '',
  basePrice: { amountMinor: 10_000, currency: 'INR' },
  fees: { amountMinor: 500, currency: 'INR' },
  taxes: { amountMinor: 0, currency: 'INR' },
  savings: { amountMinor: 0, currency: 'INR' },
  finalPrice: { amountMinor: 10_500, currency: 'INR' },
  attributes: { simulated: true },
  deals: [],
  score: 80,
  scoreBreakdown: {},
  fetchedAt: '2026-08-01T10:00:00.000Z',
};

const approval: Approval = {
  id: '20000000-0000-4000-8000-000000000004',
  bookingId: booking.id,
  userId: booking.userId,
  offerId: offer.id,
  providerId: 'demo',
  status: 'active',
  maxCharge: { amountMinor: 10_500, currency: 'INR' },
  offerFingerprint: 'a'.repeat(64),
  validUntil: '2026-08-02T10:00:00.000Z',
  allowLowerPricedEquivalent: true,
  confirmationText: 'I approve this demo booking.',
  approvedAt: '2026-08-01T10:01:00.000Z',
};

describe('demo provider', () => {
  it('tries bounded candidates in order and stops at the accepted public code', async () => {
    const provider = new DemoProvider();
    const result = await provider.prepareCheckout({
      booking,
      offer,
      approval,
      coupons: [
        {
          code: 'NOPE20',
          providerId: 'demo',
          description: 'Rejected fixture',
          confidence: 0.5,
          publicCode: true,
        },
        {
          code: 'FLOW10-DEMO',
          providerId: 'demo',
          description: 'Accepted fixture',
          confidence: 1,
          publicCode: true,
        },
        {
          code: 'UNREACHED',
          providerId: 'demo',
          description: 'Must not be tried',
          confidence: 1,
          publicCode: true,
        },
      ],
    });

    expect(result.status).toBe('confirmed');
    expect(result.finalPrice).toEqual({ amountMinor: 9_500, currency: 'INR' });
    expect(result.providerPayload.couponAttempts).toEqual([
      { code: 'NOPE20', status: 'rejected' },
      { code: 'FLOW10-DEMO', status: 'applied' },
    ]);
  });
});
