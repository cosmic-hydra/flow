import { describe, expect, it } from 'vitest';
import type { CouponCandidate } from '@flow/contracts';
import { rankCouponCandidates } from './coupon-policy.js';

describe('coupon policy', () => {
  it('only tries unique, public, provider-scoped codes in value order', () => {
    const candidates: CouponCandidate[] = [
      {
        code: 'save10',
        providerId: 'district',
        description: '',
        expectedSavingsMinor: 1_000,
        confidence: 0.8,
        publicCode: true,
      },
      {
        code: 'SAVE10',
        providerId: 'district',
        description: '',
        expectedSavingsMinor: 1_000,
        confidence: 0.7,
        publicCode: true,
      },
      {
        code: 'private code',
        providerId: 'district',
        description: '',
        expectedSavingsMinor: 5_000,
        confidence: 1,
        publicCode: false,
      },
      {
        code: 'BEST20',
        providerId: 'district',
        description: '',
        expectedSavingsMinor: 2_000,
        confidence: 0.9,
        publicCode: true,
      },
    ];

    expect(rankCouponCandidates(candidates, 'district', 8).map((item) => item.code)).toEqual([
      'BEST20',
      'SAVE10',
    ]);
  });
});
