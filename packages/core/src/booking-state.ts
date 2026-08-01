import type { BookingStatus } from '@flow/contracts';
import { DomainError } from './errors.js';

const allowedTransitions: Readonly<Record<BookingStatus, ReadonlySet<BookingStatus>>> = {
  draft: new Set(['scheduled', 'searching', 'cancelled', 'expired']),
  scheduled: new Set(['searching', 'cancelled', 'expired']),
  searching: new Set(['scheduled', 'options_ready', 'failed', 'cancelled', 'expired']),
  options_ready: new Set(['searching', 'awaiting_approval', 'scheduled', 'cancelled', 'expired']),
  awaiting_approval: new Set(['searching', 'approved', 'cancelled', 'expired']),
  approved: new Set(['awaiting_approval', 'executing', 'failed', 'cancelled', 'expired']),
  executing: new Set(['awaiting_user_action', 'booked', 'failed']),
  awaiting_user_action: new Set(['booked', 'failed', 'cancelled', 'expired']),
  booked: new Set([]),
  failed: new Set(['scheduled', 'searching', 'cancelled', 'expired']),
  cancelled: new Set([]),
  expired: new Set([]),
};

export function canTransitionBooking(from: BookingStatus, to: BookingStatus): boolean {
  return from === to || (allowedTransitions[from]?.has(to) ?? false);
}

export function assertBookingTransition(from: BookingStatus, to: BookingStatus): void {
  if (!canTransitionBooking(from, to)) {
    throw new DomainError(
      'invalid_booking_transition',
      `Booking cannot transition from ${from} to ${to}`,
      { from, to },
    );
  }
}

export function isTerminalBookingStatus(status: BookingStatus): boolean {
  return status === 'booked' || status === 'cancelled' || status === 'expired';
}
