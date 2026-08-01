import type {
  Approval,
  BookingCheckout,
  BookingStatus,
  CreateApprovalInput,
  Offer,
} from '@flow/contracts';
import {
  ArrowRight,
  CalendarClock,
  Check,
  ExternalLink,
  Plane,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  TicketCheck,
  UsersRound,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import type { BookingDetail as BookingDetailPayload } from '../api.js';
import { formatDateTime, formatMoney, relativeTime, statusLabel } from '../format.js';
import { ApprovalDialog } from './ApprovalDialog.js';
import { StatusBadge } from './StatusBadge.js';

const progress: BookingStatus[] = [
  'scheduled',
  'searching',
  'options_ready',
  'awaiting_approval',
  'approved',
  'executing',
  'booked',
];

const terminalStatuses: BookingStatus[] = ['booked', 'cancelled', 'expired'];

function formatClock(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function durationLabel(start: string, end: string): string {
  const mins = Math.max(
    0,
    Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000),
  );
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function isStayCategory(category: string): boolean {
  return category === 'hotel' || category === 'rental' || category === 'activity';
}

function OfferCard(props: {
  offer: Offer;
  selected: boolean;
  actionable: boolean;
  awaitingApproval: boolean;
  busy: boolean;
  flightLike: boolean;
  fromLabel?: string;
  toLabel?: string;
  onSelect: () => Promise<void>;
  onApprove: () => void;
}): React.JSX.Element {
  const simulated = props.offer.attributes.simulated === true;
  const priceKnown =
    props.offer.attributes.priceKnown !== false && props.offer.finalPrice.amountMinor > 0;
  const startAt = props.offer.startAt;
  const endAt =
    props.offer.endAt ??
    (startAt === undefined
      ? undefined
      : new Date(new Date(startAt).getTime() + (7 * 60 + 15) * 60_000).toISOString());
  const codeFrom = (label: string | undefined, fallback: string): string => {
    if (label === undefined || label.trim() === '') return fallback;
    const match = /\(([A-Za-z0-9]{3})\)/u.exec(label);
    return (match?.[1] ?? label).slice(0, 3).toUpperCase();
  };
  const fromCode = codeFrom(props.fromLabel, 'DEP');
  const toCode = codeFrom(props.toLabel, 'ARR');
  const showRoute = props.flightLike && startAt !== undefined && endAt !== undefined;

  return (
    <article className={`ticket-card ${props.selected ? 'is-selected' : ''}`}>
      <div className="ticket-card__body">
        <div className="ticket-card__airline">
          <span className="ticket-card__mark" aria-hidden="true">
            {props.flightLike ? <Plane size={14} /> : '⌂'}
          </span>
          <div>
            <strong>{props.offer.providerName}</strong>
            <span>
              {simulated ? 'Demo · ' : ''}
              {props.offer.title}
            </span>
          </div>
          {props.selected ? (
            <span className="ticket-card__selected">
              <Check size={12} /> Selected
            </span>
          ) : null}
        </div>

        {showRoute ? (
          <div className="ticket-card__route">
            <div>
              <strong>{formatClock(startAt)}</strong>
              <span>{fromCode}</span>
            </div>
            <div className="ticket-card__path" aria-hidden="true">
              <span>{durationLabel(startAt, endAt)}</span>
              <i />
              <Plane size={12} />
            </div>
            <div>
              <strong>{formatClock(endAt)}</strong>
              <span>{toCode}</span>
            </div>
          </div>
        ) : (
          <div className="ticket-card__stay">
            <strong>{props.offer.title}</strong>
            <span>
              {startAt === undefined ? 'Flexible timing' : formatDateTime(startAt)}
              {endAt === undefined ? '' : ` → ${formatDateTime(endAt)}`}
            </span>
          </div>
        )}
      </div>

      <div className="ticket-card__stub">
        <div className="ticket-card__price">
          <strong>{priceKnown ? formatMoney(props.offer.finalPrice) : '—'}</strong>
          <span>{props.flightLike ? '/person' : '/night'}</span>
        </div>
        <div className="ticket-card__actions">
          {props.offer.url === undefined ? null : (
            <a
              className="button button-ghost button-small"
              href={props.offer.url}
              target="_blank"
              rel="noreferrer"
            >
              View <ExternalLink size={12} />
            </a>
          )}
          {props.awaitingApproval && props.selected ? (
            <button
              className="button button-ink button-small"
              type="button"
              onClick={props.onApprove}
            >
              <ShieldCheck size={14} /> Approve
            </button>
          ) : (
            <button
              className="button button-ink button-small"
              type="button"
              disabled={!props.actionable || props.busy || props.selected}
              onClick={() => void props.onSelect().catch(() => undefined)}
            >
              {props.selected ? 'Selected' : props.flightLike ? 'Select flight' : 'Select stay'}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function ApprovalSummary({ approval }: { approval: Approval }): React.JSX.Element {
  return (
    <section className="detail-section approval-summary">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Active authority</p>
          <h3>Approval boundary</h3>
        </div>
        <StatusBadge status={approval.status} />
      </div>
      <div className="approval-facts">
        <div>
          <span>Maximum charge</span>
          <strong>{formatMoney(approval.maxCharge)}</strong>
        </div>
        <div>
          <span>Provider</span>
          <strong>{approval.providerId}</strong>
        </div>
        <div>
          <span>Valid until</span>
          <strong>{formatDateTime(approval.validUntil)}</strong>
        </div>
        <div>
          <span>Approved</span>
          <strong>{formatDateTime(approval.approvedAt)}</strong>
        </div>
      </div>
      <p className="approval-copy">
        <ShieldCheck size={15} /> {approval.confirmationText}
      </p>
    </section>
  );
}

function CheckoutHandoff({ checkout }: { checkout: BookingCheckout }): React.JSX.Element {
  return (
    <section className="detail-section checkout-handoff">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Provider result</p>
          <h3>{checkout.status === 'confirmed' ? 'Booking confirmation' : 'Finish checkout'}</h3>
        </div>
        <StatusBadge status={checkout.status} />
      </div>
      <div className="checkout-grid">
        <div>
          <span>Provider</span>
          <strong>{checkout.providerId}</strong>
        </div>
        {checkout.finalPrice === undefined ? null : (
          <div>
            <span>Actual total</span>
            <strong>{formatMoney(checkout.finalPrice)}</strong>
          </div>
        )}
        {checkout.externalReference === undefined ? null : (
          <div>
            <span>Reference</span>
            <strong>{checkout.externalReference}</strong>
          </div>
        )}
        {checkout.seats.length === 0 ? null : (
          <div>
            <span>Seats</span>
            <strong>{checkout.seats.join(', ')}</strong>
          </div>
        )}
      </div>
      {checkout.nextAction === undefined ? null : <p>{checkout.nextAction}</p>}
      <div className="checkout-actions">
        {checkout.handoffUrl === undefined ? null : (
          <a
            className="button button-ink"
            href={checkout.handoffUrl}
            target="_blank"
            rel="noreferrer"
          >
            Continue with provider <ExternalLink size={14} />
          </a>
        )}
        {checkout.receiptUrl === undefined ? null : (
          <a
            className="button button-secondary"
            href={checkout.receiptUrl}
            target="_blank"
            rel="noreferrer"
          >
            View receipt <ExternalLink size={14} />
          </a>
        )}
      </div>
    </section>
  );
}

function BoardingPass({ offer, seats }: { offer: Offer; seats: string[] }): React.JSX.Element {
  return (
    <article className="boarding-pass">
      <div className="boarding-pass__top">
        <div className="boarding-pass__carrier">
          <span className="ticket-card__mark" aria-hidden="true">
            <Plane size={14} />
          </span>
          <div>
            <strong>{offer.providerName}</strong>
            <span>{offer.externalId.slice(0, 12).toUpperCase()}</span>
          </div>
        </div>
        {offer.startAt !== undefined && offer.endAt !== undefined ? (
          <div className="boarding-pass__times">
            <div>
              <strong>{formatClock(offer.startAt)}</strong>
              <span>Depart</span>
            </div>
            <div className="ticket-card__path" aria-hidden="true">
              <span>{durationLabel(offer.startAt, offer.endAt)}</span>
              <i />
            </div>
            <div>
              <strong>{formatClock(offer.endAt)}</strong>
              <span>Arrive</span>
            </div>
          </div>
        ) : (
          <p className="boarding-pass__title">{offer.title}</p>
        )}
        <div className="boarding-pass__meta">
          <div>
            <span>Terminal</span>
            <strong>A</strong>
          </div>
          <div>
            <span>Gate</span>
            <strong>12</strong>
          </div>
          <div>
            <span>Class</span>
            <strong>Economy</strong>
          </div>
        </div>
      </div>
      <div className="boarding-pass__passengers">
        <p>Passengers</p>
        <ul>
          <li>
            <span className="avatar-dot" />
            <div>
              <strong>Primary guest</strong>
              <span>{seats[0] ?? 'Seat TBA'}</span>
            </div>
          </li>
          {seats.slice(1).map((seat) => (
            <li key={seat}>
              <span className="avatar-dot" />
              <div>
                <strong>Guest</strong>
                <span>{seat}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="boarding-pass__barcode" aria-hidden="true">
        {Array.from({ length: 48 }).map((_, i) => (
          <i key={i} style={{ width: i % 5 === 0 ? 3 : 1.5 }} />
        ))}
      </div>
    </article>
  );
}

function LuxuryListing({
  offer,
  location,
  onConfirm,
  onCancel,
  canConfirm,
  canCancel,
  busy,
}: {
  offer: Offer;
  location: string;
  onConfirm: () => void;
  onCancel: () => void;
  canConfirm: boolean;
  canCancel: boolean;
  busy: boolean;
}): React.JSX.Element {
  const priceKnown = offer.attributes.priceKnown !== false && offer.finalPrice.amountMinor > 0;
  return (
    <section className="listing-view">
      <div className="listing-view__copy">
        <p className="eyebrow">Unique stay</p>
        <h2>{offer.title}</h2>
        <p className="listing-view__loc">{location}</p>
        <p className="listing-view__price">
          <strong>{priceKnown ? formatMoney(offer.finalPrice) : '—'}</strong>
          <span>/ night</span>
        </p>
        <button
          type="button"
          className="button button-ghost-pill"
          onClick={onConfirm}
          disabled={!canConfirm || busy}
        >
          Check Availability
          <span className="pill-calendar" aria-hidden="true">
            <CalendarClock size={14} />
          </span>
        </button>
        <div className="listing-view__stats">
          <div>
            <UsersRound size={16} />
            <p>4 Guests</p>
          </div>
          <div>
            <span aria-hidden="true">🛏</span>
            <p>2 Bedrooms</p>
          </div>
          <div>
            <span aria-hidden="true">🚿</span>
            <p>1 Bathroom</p>
          </div>
        </div>
        <p className="listing-view__desc">
          {offer.subtitle ||
            'A refined stay matched from your Flow search — quiet interiors, strong light, and a calm base for the days ahead.'}{' '}
          {offer.refundable === true
            ? 'Refundable within policy.'
            : offer.refundable === false
              ? 'Non-refundable fare.'
              : null}
        </p>
        <button type="button" className="text-link">
          Show more
        </button>
        <ul className="listing-view__amenities">
          {['Kitchen', 'Wi-Fi', 'Workspace', 'Heating', 'Essentials', 'Self check-in'].map(
            (item) => (
              <li key={item}>
                <ArrowRight size={12} />
                {item}
              </li>
            ),
          )}
        </ul>
        <div className="listing-view__review">
          <p>
            <Star size={14} fill="currentColor" /> 4.82 · 55 reviews
          </p>
          <blockquote>
            <div>
              <span className="avatar-dot" />
              <div>
                <strong>Kaveh</strong>
                <span>April 2023</span>
              </div>
            </div>
            <p>
              Quiet, exact, and beautifully kept — felt like a private retreat rather than a
              booking.
            </p>
          </blockquote>
        </div>
        <div className="listing-view__actions">
          {canCancel ? (
            <button
              type="button"
              className="button button-ghost"
              onClick={onCancel}
              disabled={busy}
            >
              Cancel
            </button>
          ) : null}
          {canConfirm ? (
            <button type="button" className="button button-ink" onClick={onConfirm} disabled={busy}>
              {busy ? 'Working…' : 'Confirm stay'}
            </button>
          ) : null}
        </div>
      </div>
      <div className="listing-view__gallery" aria-hidden="true">
        <div className="listing-shot listing-shot--hero" />
        <div className="listing-shot" />
        <div className="listing-shot" />
      </div>
    </section>
  );
}

export function BookingDetail(props: {
  detail: BookingDetailPayload | undefined;
  loading: boolean;
  busy: boolean;
  onSearch: () => Promise<void>;
  onSelect: (offerId: string) => Promise<void>;
  onApprove: (input: CreateApprovalInput) => Promise<void>;
  onCancel: () => Promise<void>;
}): React.JSX.Element {
  const [approvalOffer, setApprovalOffer] = useState<Offer>();

  if (props.loading) {
    return (
      <div className="detail-loading" aria-label="Loading booking">
        <span />
        <span />
        <span />
      </div>
    );
  }
  if (props.detail === undefined) {
    return (
      <section className="detail-empty">
        <TicketCheck size={23} />
        <h3>Select a booking</h3>
        <p>Its ranked offers, approval boundary, and audit history will appear here.</p>
      </section>
    );
  }

  const { booking, offers, approval, checkout, audit } = props.detail;
  const visibleCheckout =
    checkout !== undefined && ['booked', 'awaiting_user_action'].includes(booking.status)
      ? checkout
      : undefined;
  const selectedOffer = offers.find((offer) => offer.id === booking.selectedOfferId);
  const selectedPriceKnown =
    selectedOffer !== undefined &&
    selectedOffer.attributes.priceKnown !== false &&
    selectedOffer.finalPrice.amountMinor > 0;
  const canSearch =
    !terminalStatuses.includes(booking.status) &&
    !['approved', 'executing', 'awaiting_user_action'].includes(booking.status);
  const canCancel = !terminalStatuses.includes(booking.status) && booking.status !== 'executing';
  const canChoose = booking.status === 'options_ready' || booking.status === 'awaiting_approval';
  const currentProgress = progress.indexOf(
    booking.status === 'awaiting_user_action' ? 'executing' : booking.status,
  );
  const locations = [
    booking.intent.origin?.label,
    booking.intent.destination?.label,
    booking.intent.venue?.label,
  ].filter((value): value is string => value !== undefined);
  const flightLike =
    booking.intent.category === 'flight' ||
    booking.intent.category === 'train' ||
    booking.intent.category === 'bus';
  const stayLike = isStayCategory(booking.intent.category);
  const showPass = booking.status === 'booked' && selectedOffer !== undefined && flightLike;
  const showListing =
    stayLike &&
    selectedOffer !== undefined &&
    (booking.status === 'awaiting_approval' ||
      booking.status === 'approved' ||
      booking.status === 'booked' ||
      booking.status === 'options_ready');

  if (showPass) {
    return (
      <section className="pass-view">
        <header className="pass-view__head">
          <div>
            <p className="eyebrow">Your flight details</p>
            <h2>{booking.intent.title}</h2>
          </div>
          <StatusBadge status={booking.status} />
        </header>
        <BoardingPass offer={selectedOffer} seats={visibleCheckout?.seats ?? []} />
        {visibleCheckout === undefined ? null : <CheckoutHandoff checkout={visibleCheckout} />}
        <button type="button" className="button button-ink button-full" disabled>
          Download &amp; Save pass
        </button>
      </section>
    );
  }

  if (showListing && selectedOffer !== undefined) {
    return (
      <div className="booking-detail booking-detail--listing">
        <LuxuryListing
          offer={selectedOffer}
          location={locations.join(', ') || 'Selected destination'}
          canConfirm={booking.status === 'awaiting_approval'}
          canCancel={canCancel}
          busy={props.busy}
          onConfirm={() => setApprovalOffer(selectedOffer)}
          onCancel={() => {
            if (window.confirm('Cancel this booking and revoke any active approval?')) {
              void props.onCancel().catch(() => undefined);
            }
          }}
        />
        {approval === undefined ? null : <ApprovalSummary approval={approval} />}
        {visibleCheckout === undefined ? null : <CheckoutHandoff checkout={visibleCheckout} />}
        {approvalOffer === undefined ? null : (
          <ApprovalDialog
            open
            booking={booking}
            offer={approvalOffer}
            onClose={() => setApprovalOffer(undefined)}
            onApprove={props.onApprove}
          />
        )}
      </div>
    );
  }

  return (
    <div className="booking-detail results-shell">
      <header className="results-view__head">
        <div>
          <p className="eyebrow">
            {flightLike ? 'Flight result' : statusLabel(booking.intent.category)}
          </p>
          <h2>{booking.intent.title}</h2>
          <p>
            {locations.length === 0 ? null : `${locations.join(' → ')} · `}
            {booking.intent.timeWindow === undefined
              ? 'Flexible timing'
              : formatDateTime(booking.intent.timeWindow.start, booking.intent.timeWindow.timezone)}
            {` · ${booking.intent.partySize} traveler${booking.intent.partySize === 1 ? '' : 's'}`}
          </p>
        </div>
        <div className="results-view__head-actions">
          <StatusBadge status={booking.status} />
          <button
            className="button button-secondary button-small"
            type="button"
            disabled={!canSearch || props.busy}
            onClick={() => void props.onSearch().catch(() => undefined)}
          >
            <RefreshCw size={14} className={props.busy ? 'spin' : ''} />
            {offers.length === 0 ? 'Search' : 'Refresh'}
          </button>
          {canCancel ? (
            <button
              className="button button-danger-ghost button-small"
              type="button"
              disabled={props.busy}
              onClick={() => {
                if (window.confirm('Cancel this booking and revoke any active approval?')) {
                  void props.onCancel().catch(() => undefined);
                }
              }}
            >
              <XCircle size={14} /> Cancel
            </button>
          ) : null}
        </div>
      </header>

      {booking.failureMessage === undefined ? null : (
        <div className="failure-banner">
          <XCircle size={17} />
          <div>
            <strong>{booking.failureCode ?? 'Booking failed'}</strong>
            <span>{booking.failureMessage}</span>
          </div>
        </div>
      )}

      <div className="filter-pills" role="tablist" aria-label="Sort">
        <button type="button" className="filter-pill is-active">
          Lowest to Highest
        </button>
        <button type="button" className="filter-pill">
          Preferred
        </button>
        <button type="button" className="filter-pill">
          Earliest
        </button>
      </div>

      <div className="progress-mini" aria-label="Booking progress">
        {progress.map((status, index) => {
          const active =
            status === booking.status ||
            (booking.status === 'awaiting_user_action' && status === 'executing');
          const complete =
            booking.status === 'booked' || (currentProgress >= 0 && index < currentProgress);
          return (
            <span
              key={status}
              className={`progress-mini__dot ${active ? 'is-active' : ''} ${complete ? 'is-complete' : ''}`}
              title={statusLabel(status)}
            />
          );
        })}
        <span className="muted">Updated {relativeTime(booking.updatedAt)}</span>
      </div>

      {booking.intent.constraints.length === 0 ? null : (
        <div className="constraint-list">
          {booking.intent.constraints.map((constraint) => (
            <span key={constraint}>
              <Check size={13} /> {constraint}
            </span>
          ))}
        </div>
      )}

      {approval === undefined ? null : <ApprovalSummary approval={approval} />}
      {visibleCheckout === undefined ? null : <CheckoutHandoff checkout={visibleCheckout} />}

      <section className="offers-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Ranked offers</p>
            <h3>
              {offers.length} option{offers.length === 1 ? '' : 's'}
            </h3>
          </div>
          {offers.length === 0 ? null : (
            <span className="muted">
              <Sparkles size={14} /> Best fit first
            </span>
          )}
        </div>
        {offers.length === 0 ? (
          <div className="offers-empty">
            <TicketCheck size={21} />
            <strong>No offers yet</strong>
            <span>Search now or let the scheduled worker check at the configured time.</span>
          </div>
        ) : (
          <div className="ticket-list">
            {offers.map((offer) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                selected={offer.id === booking.selectedOfferId}
                actionable={canChoose}
                awaitingApproval={booking.status === 'awaiting_approval'}
                busy={props.busy}
                flightLike={flightLike}
                {...(booking.intent.origin === undefined
                  ? {}
                  : {
                      fromLabel:
                        booking.intent.origin.code === undefined
                          ? booking.intent.origin.label
                          : `${booking.intent.origin.label} (${booking.intent.origin.code})`,
                    })}
                {...(booking.intent.destination === undefined
                  ? {}
                  : {
                      toLabel:
                        booking.intent.destination.code === undefined
                          ? booking.intent.destination.label
                          : `${booking.intent.destination.label} (${booking.intent.destination.code})`,
                    })}
                onSelect={() => props.onSelect(offer.id)}
                onApprove={() => setApprovalOffer(offer)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="detail-section audit-section">
        <div className="section-heading compact-heading">
          <div>
            <p className="eyebrow">Activity</p>
            <h3>Trace</h3>
          </div>
        </div>
        <ol className="audit-list">
          {audit.map((event) => (
            <li key={event.id}>
              <span className={`audit-dot audit-${event.outcome}`} />
              <div>
                <strong>{statusLabel(event.action.replace('booking.', ''))}</strong>
                <small>
                  {event.actorType} · {formatDateTime(event.createdAt)}
                </small>
              </div>
              <StatusBadge status={event.outcome} />
            </li>
          ))}
        </ol>
      </section>

      {approvalOffer === undefined ? null : (
        <ApprovalDialog
          open
          booking={booking}
          offer={approvalOffer}
          onClose={() => setApprovalOffer(undefined)}
          onApprove={props.onApprove}
        />
      )}

      {selectedOffer === undefined || booking.status !== 'awaiting_approval' ? null : (
        <div className="sticky-approval-bar">
          <div>
            <ShieldCheck size={18} />
            <span>
              <strong>
                {selectedPriceKnown ? formatMoney(selectedOffer.finalPrice) : 'Set a price ceiling'}
              </strong>{' '}
              via {selectedOffer.providerName}
            </span>
          </div>
          <button
            className="button button-ink"
            type="button"
            onClick={() => setApprovalOffer(selectedOffer)}
          >
            Review and approve
          </button>
        </div>
      )}

      <button type="button" className="fab-filter" aria-label="Filter results">
        <Settings2 size={18} />
      </button>
    </div>
  );
}
