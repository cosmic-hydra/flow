import { describe, expect, it } from 'vitest';
import { AutomationPlanSchema, CheckoutResultSchema, CreateApprovalSchema } from './booking.js';

describe('booking contracts', () => {
  it('requires scheduled execution to fall before the deadline', () => {
    const result = AutomationPlanSchema.safeParse({
      researchAt: '2026-08-01T10:00:00.000Z',
      executeAt: '2026-08-03T10:00:00.000Z',
      deadline: '2026-08-02T10:00:00.000Z',
      refreshIntervalMinutes: 60,
      maxCouponAttempts: 8,
      autoExecuteWithinApproval: false,
    });
    expect(result.success).toBe(false);
  });

  it('requires approval execution bounds to be internally ordered', () => {
    const result = CreateApprovalSchema.safeParse({
      offerId: '10000000-0000-4000-8000-000000000001',
      maxCharge: { amountMinor: 1_000, currency: 'INR' },
      validUntil: '2026-08-02T10:00:00.000Z',
      executeNotBefore: '2026-08-02T09:00:00.000Z',
      executeNotAfter: '2026-08-02T08:00:00.000Z',
      allowLowerPricedEquivalent: true,
      confirmationText: 'I approve this exact booking.',
    });
    expect(result.success).toBe(false);
  });

  it('accepts only HTTPS checkout handoffs', () => {
    const result = CheckoutResultSchema.safeParse({
      status: 'awaiting_user_action',
      providerId: 'provider-a',
      finalPrice: { amountMinor: 1_000, currency: 'INR' },
      handoffUrl: 'javascript:alert(1)',
      providerPayload: {},
    });

    expect(result.success).toBe(false);
  });
});
