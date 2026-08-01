import { describe, expect, it } from 'vitest';
import { assertBookingTransition, canTransitionBooking } from './booking-state.js';

describe('booking state machine', () => {
  it('allows the approval-safe happy path', () => {
    const path = [
      'draft',
      'searching',
      'options_ready',
      'awaiting_approval',
      'approved',
      'executing',
      'booked',
    ] as const;

    for (let index = 0; index < path.length - 1; index += 1) {
      const from = path[index];
      const to = path[index + 1];
      expect(from).toBeDefined();
      expect(to).toBeDefined();
      if (from === undefined || to === undefined) throw new Error('Invalid test path');
      expect(canTransitionBooking(from, to)).toBe(true);
    }
  });

  it('prevents execution before approval', () => {
    expect(() => assertBookingTransition('options_ready', 'executing')).toThrow(
      'cannot transition',
    );
  });

  it('permits an approval rollback when execution scheduling fails', () => {
    expect(canTransitionBooking('approved', 'awaiting_approval')).toBe(true);
  });

  it('does not let a stale refresh supersede an approved booking', () => {
    expect(canTransitionBooking('approved', 'searching')).toBe(false);
  });
});
