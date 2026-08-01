import { describe, expect, it } from 'vitest';
import { buildLocalBookingInput } from './agent.js';

const context = {
  userId: '40000000-0000-4000-8000-000000000001',
  conversationId: '40000000-0000-4000-8000-000000000002',
  timezone: 'Asia/Kolkata',
  currentTime: '2026-08-01T10:00:00.000Z',
};

describe('buildLocalBookingInput', () => {
  it('parses route, date, and travelers from a Search flights prompt', () => {
    const plan = buildLocalBookingInput(
      'Find flights from Tokyo (HND) to Seoul (ICN) departing 2026-09-10 for 2 travelers, best total price, refundable if possible.',
      context,
    );
    expect(plan).toBeDefined();
    expect(plan?.intent.category).toBe('flight');
    expect(plan?.intent.origin).toEqual({ label: 'Tokyo', code: 'HND', city: 'Tokyo' });
    expect(plan?.intent.destination).toEqual({ label: 'Seoul', code: 'ICN', city: 'Seoul' });
    expect(plan?.intent.partySize).toBe(2);
    expect(plan?.intent.timeWindow?.start.startsWith('2026-09-10')).toBe(true);
    expect(plan?.intent.preferredProviders).toEqual(['demo']);
  });

  it('parses hotel destination and budget', () => {
    const plan = buildLocalBookingInput(
      'Schedule a hotel search in Goa next Friday for two nights under ₹15000',
      context,
    );
    expect(plan?.intent.category).toBe('hotel');
    expect(plan?.intent.destination?.label).toMatch(/Goa/i);
    expect(plan?.intent.budget?.currency).toBe('INR');
  });
});
