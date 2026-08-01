import type { Approval, Offer } from '@flow/contracts';
import { describe, expect, it } from 'vitest';
import { assertApprovalAllowsOffer, fingerprintOffer } from './approval-policy.js';

const bookingId = '10000000-0000-4000-8000-000000000001';
const userId = '10000000-0000-4000-8000-000000000002';
const offerId = '10000000-0000-4000-8000-000000000003';

function offer(): Offer {
  return {
    id: offerId,
    bookingId,
    providerId: 'provider-a',
    providerName: 'Provider A',
    externalId: 'external-1',
    title: 'Center pair',
    subtitle: '',
    basePrice: { amountMinor: 10_000, currency: 'INR' },
    fees: { amountMinor: 500, currency: 'INR' },
    taxes: { amountMinor: 0, currency: 'INR' },
    savings: { amountMinor: 0, currency: 'INR' },
    finalPrice: { amountMinor: 10_500, currency: 'INR' },
    attributes: { section: 'center' },
    deals: [],
    score: 90,
    scoreBreakdown: {},
    fetchedAt: '2026-08-01T10:00:00.000Z',
  };
}

function approval(selectedOffer: Offer): Approval {
  return {
    id: '10000000-0000-4000-8000-000000000004',
    bookingId,
    userId,
    offerId,
    providerId: selectedOffer.providerId,
    status: 'active',
    maxCharge: { amountMinor: 11_000, currency: 'INR' },
    offerFingerprint: fingerprintOffer(selectedOffer),
    validUntil: '2026-08-02T12:00:00.000Z',
    allowLowerPricedEquivalent: true,
    confirmationText: 'I approve Provider A up to INR 110.00.',
    approvedAt: '2026-08-01T10:01:00.000Z',
  };
}

describe('approval policy', () => {
  it('accepts only the exact active offer inside its ceiling and window', () => {
    const selectedOffer = offer();
    expect(() =>
      assertApprovalAllowsOffer(
        approval(selectedOffer),
        selectedOffer,
        new Date('2026-08-01T11:00:00.000Z'),
      ),
    ).not.toThrow();
  });

  it('rejects a material offer mutation after approval', () => {
    const selectedOffer = offer();
    const changed = { ...selectedOffer, attributes: { section: 'front' } };
    expect(() =>
      assertApprovalAllowsOffer(
        approval(selectedOffer),
        changed,
        new Date('2026-08-01T11:00:00.000Z'),
      ),
    ).toThrow('Material offer details changed');
  });

  it('rejects expiry and a charge above the ceiling', () => {
    const selectedOffer = offer();
    expect(() =>
      assertApprovalAllowsOffer(
        approval(selectedOffer),
        selectedOffer,
        new Date('2026-08-03T11:00:00.000Z'),
      ),
    ).toThrow('expired');

    const expensive = {
      ...selectedOffer,
      finalPrice: { amountMinor: 12_000, currency: 'INR' },
    };
    const expensiveApproval = {
      ...approval(expensive),
      maxCharge: { amountMinor: 11_000, currency: 'INR' },
    };
    expect(() =>
      assertApprovalAllowsOffer(expensiveApproval, expensive, new Date('2026-08-01T11:00:00.000Z')),
    ).toThrow('exceeds');
  });
});
