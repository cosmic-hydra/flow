import type { Booking, CreateApprovalInput } from '@flow/contracts';
import { CalendarClock, Search, TicketCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { BookingDetail as BookingDetailPayload } from '../api.js';
import { formatDateTime, formatMoney, relativeTime, statusLabel } from '../format.js';
import { BookingDetail } from './BookingDetail.js';
import { StatusBadge } from './StatusBadge.js';

export function BookingsView(props: {
  bookings: Booking[];
  selectedBookingId: string | undefined;
  detail: BookingDetailPayload | undefined;
  loadingDetail: boolean;
  busy: boolean;
  onSelect: (bookingId: string) => void;
  onCreate: () => void;
  onSearch: () => Promise<void>;
  onSelectOffer: (offerId: string) => Promise<void>;
  onApprove: (input: CreateApprovalInput) => Promise<void>;
  onCancel: () => Promise<void>;
}): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'complete'>('all');
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return props.bookings.filter((booking) => {
      const terminal = ['booked', 'cancelled', 'failed', 'expired'].includes(booking.status);
      if (statusFilter === 'active' && terminal) return false;
      if (statusFilter === 'complete' && !terminal) return false;
      if (normalized === '') return true;
      const haystack = [
        booking.intent.title,
        booking.intent.category,
        booking.intent.origin?.label,
        booking.intent.destination?.label,
        booking.intent.venue?.label,
      ]
        .filter((value): value is string => value !== undefined)
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [props.bookings, query, statusFilter]);

  return (
    <div className="bookings-workspace">
      <aside className="booking-list-pane">
        <div className="booking-list-tools">
          <label className="list-search">
            <Search size={15} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search bookings"
              aria-label="Search bookings"
            />
          </label>
          <div className="segment-control" aria-label="Filter bookings">
            {(['all', 'active', 'complete'] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                className={statusFilter === filter ? 'segment-active' : ''}
                onClick={() => setStatusFilter(filter)}
              >
                {statusLabel(filter)}
              </button>
            ))}
          </div>
        </div>

        <div className="booking-list">
          {filtered.map((booking) => (
            <button
              type="button"
              key={booking.id}
              className={
                props.selectedBookingId === booking.id
                  ? 'booking-list-card booking-list-card-active'
                  : 'booking-list-card'
              }
              onClick={() => props.onSelect(booking.id)}
            >
              <div className="booking-list-card-top">
                <span>{statusLabel(booking.intent.category)}</span>
                <StatusBadge status={booking.status} />
              </div>
              <strong>{booking.intent.title}</strong>
              <div className="booking-list-meta">
                {booking.intent.timeWindow === undefined ? (
                  <span>Flexible timing</span>
                ) : (
                  <span>
                    {formatDateTime(
                      booking.intent.timeWindow.start,
                      booking.intent.timeWindow.timezone,
                    )}
                  </span>
                )}
                {booking.intent.budget === undefined ? null : (
                  <span>{formatMoney(booking.intent.budget)} max</span>
                )}
              </div>
              <small>Updated {relativeTime(booking.updatedAt)}</small>
            </button>
          ))}
          {filtered.length === 0 ? (
            <div className="booking-list-empty">
              <TicketCheck size={21} />
              <strong>
                {props.bookings.length === 0 ? 'No bookings yet' : 'No matching bookings'}
              </strong>
              <span>
                {props.bookings.length === 0
                  ? 'Create a precise request to get started.'
                  : 'Try a different search or filter.'}
              </span>
              {props.bookings.length === 0 ? (
                <button
                  className="button button-primary button-small"
                  type="button"
                  onClick={props.onCreate}
                >
                  <CalendarClock size={14} /> Create booking
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </aside>

      <main className="booking-detail-pane">
        <BookingDetail
          detail={props.detail}
          loading={props.loadingDetail}
          busy={props.busy}
          onSearch={props.onSearch}
          onSelect={props.onSelectOffer}
          onApprove={props.onApprove}
          onCancel={props.onCancel}
        />
      </main>
    </div>
  );
}
