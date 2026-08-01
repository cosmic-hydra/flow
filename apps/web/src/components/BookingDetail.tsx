import type {
  Approval,
  BookingCheckout,
  BookingStatus,
  CreateApprovalInput,
  Offer,
} from '@flow/contracts';
import {
  CalendarClock,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Tags,
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

function renderAttribute(value: unknown): string | undefined {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    const values = value.filter(
      (item): item is string | number => typeof item === 'string' || typeof item === 'number',
    );
    return values.length === 0 ? undefined : values.join(', ');
  }
  return undefined;
}

function AttributeList({ offer }: { offer: Offer }): React.JSX.Element | null {
  const attributes = Object.entries(offer.attributes)
    .filter(([key]) => key !== 'simulated')
    .flatMap(([key, value]) => {
      const rendered = renderAttribute(value);
      return rendered === undefined ? [] : [{ key, value: rendered }];
    })
    .slice(0, 5);
  if (attributes.length === 0) return null;
  return (
    <dl className="offer-attributes">
      {attributes.map((attribute) => (
        <div key={attribute.key}>
          <dt>{statusLabel(attribute.key)}</dt>
          <dd>{attribute.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function OfferCard(props: {
  offer: Offer;
  selected: boolean;
  actionable: boolean;
  awaitingApproval: boolean;
  busy: boolean;
  onSelect: () => Promise<void>;
  onApprove: () => void;
}): React.JSX.Element {
  const simulated = props.offer.attributes.simulated === true;
  const priceKnown =
    props.offer.attributes.priceKnown !== false && props.offer.finalPrice.amountMinor > 0;
  return (
    <article className={`offer-card ${props.selected ? 'offer-card-selected' : ''}`}>
      <div className="offer-rank">
        <span>{Math.round(props.offer.score)}</span>
        <small>match</small>
      </div>
      <div className="offer-main">
        <div className="offer-heading">
          <div>
            <div className="offer-provider-line">
              <span>{props.offer.providerName}</span>
              {simulated ? <span className="demo-label">Demo data</span> : null}
              {props.selected ? (
                <span className="selected-label">
                  <Check size={12} /> Selected
                </span>
              ) : null}
            </div>
            <h4>{props.offer.title}</h4>
            {props.offer.subtitle === '' ? null : <p>{props.offer.subtitle}</p>}
          </div>
          <div className="offer-price">
            <strong>
              {priceKnown ? formatMoney(props.offer.finalPrice) : 'Price unavailable'}
            </strong>
            {props.offer.savings.amountMinor === 0 ? null : (
              <span>Save {formatMoney(props.offer.savings)}</span>
            )}
          </div>
        </div>

        <div className="offer-meta">
          {props.offer.startAt === undefined ? null : (
            <span>
              <Clock3 size={14} /> {formatDateTime(props.offer.startAt)}
            </span>
          )}
          {props.offer.availability === undefined ? null : (
            <span>
              <TicketCheck size={14} /> {props.offer.availability} available
            </span>
          )}
          <span>
            <CircleDollarSign size={14} /> Fees {formatMoney(props.offer.fees)}
          </span>
          {props.offer.refundable === undefined ? null : (
            <span>{props.offer.refundable ? 'Refundable' : 'Non-refundable'}</span>
          )}
        </div>

        <AttributeList offer={props.offer} />

        {props.offer.deals.length === 0 ? null : (
          <div className="deal-list">
            {props.offer.deals.slice(0, 4).map((deal) => (
              <div className="deal-chip" key={`${deal.kind}-${deal.title}-${deal.code ?? ''}`}>
                <Tags size={13} />
                <span>{deal.title}</span>
                {deal.code === undefined ? null : <code>{deal.code}</code>}
              </div>
            ))}
          </div>
        )}

        <div className="offer-footer">
          <span className="offer-fetched">Checked {relativeTime(props.offer.fetchedAt)}</span>
          <div className="offer-actions">
            {props.offer.url === undefined ? null : (
              <a
                className="button button-ghost button-small"
                href={props.offer.url}
                target="_blank"
                rel="noreferrer"
              >
                View <ExternalLink size={13} />
              </a>
            )}
            {props.awaitingApproval && props.selected ? (
              <button
                className="button button-primary button-small"
                type="button"
                onClick={props.onApprove}
              >
                <ShieldCheck size={14} /> Approve
              </button>
            ) : (
              <button
                className={
                  props.selected
                    ? 'button button-secondary button-small'
                    : 'button button-primary button-small'
                }
                type="button"
                disabled={!props.actionable || props.busy || props.selected}
                onClick={() => void props.onSelect().catch(() => undefined)}
              >
                {props.selected ? 'Selected' : 'Select offer'} <ChevronRight size={14} />
              </button>
            )}
          </div>
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
            className="button button-primary"
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

  return (
    <div className="booking-detail">
      <header className="booking-hero">
        <div className="booking-hero-copy">
          <div className="booking-title-line">
            <span className="category-label">{statusLabel(booking.intent.category)}</span>
            <StatusBadge status={booking.status} />
          </div>
          <h2>{booking.intent.title}</h2>
          {booking.intent.description === '' ? null : <p>{booking.intent.description}</p>}
          <div className="booking-facts">
            {locations.length === 0 ? null : (
              <span>
                <MapPin size={15} /> {locations.join(' → ')}
              </span>
            )}
            {booking.intent.timeWindow === undefined ? null : (
              <span>
                <CalendarClock size={15} />
                {formatDateTime(
                  booking.intent.timeWindow.start,
                  booking.intent.timeWindow.timezone,
                )}
              </span>
            )}
            <span>
              <UsersRound size={15} /> {booking.intent.partySize}
            </span>
            {booking.intent.budget === undefined ? null : (
              <span>
                <CircleDollarSign size={15} /> Up to {formatMoney(booking.intent.budget)}
              </span>
            )}
          </div>
        </div>
        <div className="booking-hero-actions">
          <button
            className="button button-secondary"
            type="button"
            disabled={!canSearch || props.busy}
            onClick={() => void props.onSearch().catch(() => undefined)}
          >
            <RefreshCw size={15} className={props.busy ? 'spin' : ''} />
            {offers.length === 0 ? 'Search now' : 'Refresh offers'}
          </button>
          {canCancel ? (
            <button
              className="button button-danger-ghost"
              type="button"
              disabled={props.busy}
              onClick={() => {
                if (window.confirm('Cancel this booking and revoke any active approval?')) {
                  void props.onCancel().catch(() => undefined);
                }
              }}
            >
              <XCircle size={15} /> Cancel
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

      <section className="detail-section progress-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Lifecycle</p>
            <h3>Booking progress</h3>
          </div>
          <span className="muted">Updated {relativeTime(booking.updatedAt)}</span>
        </div>
        <ol className="progress-track">
          {progress.map((status, index) => {
            const active =
              status === booking.status ||
              (booking.status === 'awaiting_user_action' && status === 'executing');
            const complete =
              booking.status === 'booked' || (currentProgress >= 0 && index < currentProgress);
            return (
              <li
                key={status}
                className={`${active ? 'progress-active' : ''} ${complete ? 'progress-complete' : ''}`}
              >
                <span>{complete ? <Check size={13} /> : index + 1}</span>
                <small>{statusLabel(status)}</small>
              </li>
            );
          })}
        </ol>
        {booking.status === 'awaiting_user_action' ? (
          <p className="handoff-notice">
            A provider handoff or payment authentication is required to finish.
          </p>
        ) : null}
      </section>

      {booking.intent.constraints.length === 0 ? null : (
        <section className="detail-section constraints-section">
          <div className="section-heading compact-heading">
            <div>
              <p className="eyebrow">Provider-aware notes</p>
              <h3>Requested constraints</h3>
            </div>
          </div>
          <div className="constraint-list">
            {booking.intent.constraints.map((constraint) => (
              <span key={constraint}>
                <Check size={13} /> {constraint}
              </span>
            ))}
          </div>
        </section>
      )}

      {approval === undefined ? null : <ApprovalSummary approval={approval} />}
      {visibleCheckout === undefined ? null : <CheckoutHandoff checkout={visibleCheckout} />}

      <section className="detail-section offers-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Displayed price and sourced deal evidence</p>
            <h3>
              Ranked offers <span>{offers.length}</span>
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
            <Tags size={21} />
            <strong>No offers yet</strong>
            <span>
              Run the search now or let the scheduled worker check at the configured time.
            </span>
          </div>
        ) : (
          <div className="offer-list">
            {offers.map((offer) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                selected={offer.id === booking.selectedOfferId}
                actionable={canChoose}
                awaitingApproval={booking.status === 'awaiting_approval'}
                busy={props.busy}
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
            <p className="eyebrow">Traceable by design</p>
            <h3>Activity</h3>
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
            className="button button-primary"
            type="button"
            onClick={() => setApprovalOffer(selectedOffer)}
          >
            Review and approve
          </button>
        </div>
      )}
    </div>
  );
}
