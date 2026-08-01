import { describe, expect, it } from 'vitest';
import { isBookingAgentToolName, parseToolArguments } from './tools.js';

describe('booking agent tools', () => {
  it('rejects unknown model-requested tool names', () => {
    expect(isBookingAgentToolName('approve_booking')).toBe(false);
    expect(isBookingAgentToolName('select_offer')).toBe(true);
  });

  it('strictly validates tool arguments', () => {
    expect(() =>
      parseToolArguments('search_booking', {
        bookingId: '30000000-0000-4000-8000-000000000001',
        approve: true,
      }),
    ).toThrow();
  });
});
