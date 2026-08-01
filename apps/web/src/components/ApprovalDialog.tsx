import type { Booking, CreateApprovalInput, Offer } from '@flow/contracts';
import { AlertTriangle, LockKeyhole, ShieldCheck, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { formatMoney } from '../format.js';

function minorUnitDivisor(currency: string): number {
  return currency === 'JPY' || currency === 'KRW' ? 1 : 100;
}

function toLocalInput(value: string): string {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function initialExpiry(booking: Booking): string {
  const deadline = Date.parse(booking.automation.deadline);
  const desired =
    booking.automation.executeAt === undefined
      ? Date.now() + 24 * 60 * 60_000
      : Date.parse(booking.automation.executeAt) + 2 * 60 * 60_000;
  return toLocalInput(new Date(Math.min(deadline, desired)).toISOString());
}

export function ApprovalDialog(props: {
  open: boolean;
  booking: Booking;
  offer: Offer;
  onClose: () => void;
  onApprove: (input: CreateApprovalInput) => Promise<void>;
}): React.JSX.Element | null {
  const divisor = minorUnitDivisor(props.offer.finalPrice.currency);
  const priceKnown =
    props.offer.attributes.priceKnown !== false && props.offer.finalPrice.amountMinor > 0;
  const initialMaximum = useMemo(
    () => (priceKnown ? String(props.offer.finalPrice.amountMinor / divisor) : ''),
    [divisor, priceKnown, props.offer.finalPrice.amountMinor],
  );
  const [maximum, setMaximum] = useState(initialMaximum);
  const [validUntil, setValidUntil] = useState(() => initialExpiry(props.booking));
  const [executeNotBefore, setExecuteNotBefore] = useState(
    props.booking.automation.executeAt === undefined
      ? ''
      : toLocalInput(props.booking.automation.executeAt),
  );
  const [confirmed, setConfirmed] = useState(false);
  const [typedConfirmation, setTypedConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!props.open) return;
    setMaximum(initialMaximum);
    setValidUntil(initialExpiry(props.booking));
    setExecuteNotBefore(
      props.booking.automation.executeAt === undefined
        ? ''
        : toLocalInput(props.booking.automation.executeAt),
    );
    setConfirmed(false);
    setTypedConfirmation('');
    setError(undefined);
  }, [
    initialMaximum,
    props.booking.automation.deadline,
    props.booking.automation.executeAt,
    props.booking.id,
    props.offer.id,
    props.open,
  ]);

  if (!props.open) return null;

  const submit = async (): Promise<void> => {
    setError(undefined);
    const parsedMaximum = Number(maximum);
    if (!Number.isFinite(parsedMaximum) || parsedMaximum <= 0) {
      setError('Enter a valid maximum charge.');
      return;
    }
    const maximumMinor = Math.round(parsedMaximum * divisor);
    if (maximumMinor < props.offer.finalPrice.amountMinor) {
      setError('The maximum charge cannot be below the selected offer total.');
      return;
    }
    const expiry = new Date(validUntil);
    if (Number.isNaN(expiry.getTime()) || expiry.getTime() <= Date.now()) {
      setError('Approval expiry must be in the future.');
      return;
    }
    if (expiry.getTime() > Date.parse(props.booking.automation.deadline)) {
      setError('Approval cannot extend beyond the booking deadline.');
      return;
    }
    const notBefore = executeNotBefore === '' ? undefined : new Date(executeNotBefore);
    if (notBefore !== undefined && Number.isNaN(notBefore.getTime())) {
      setError('Choose a valid execution time.');
      return;
    }
    if (notBefore !== undefined && notBefore.getTime() > expiry.getTime()) {
      setError('The execution time must fall inside the approval window.');
      return;
    }
    if (!confirmed || typedConfirmation.trim().toUpperCase() !== 'APPROVE') {
      setError('Review the charge boundary and type APPROVE to continue.');
      return;
    }

    const maxCharge = {
      amountMinor: maximumMinor,
      currency: props.offer.finalPrice.currency,
    };
    const input: CreateApprovalInput = {
      offerId: props.offer.id,
      maxCharge,
      validUntil: expiry.toISOString(),
      executeNotAfter: expiry.toISOString(),
      allowLowerPricedEquivalent: false,
      confirmationText: `I approve ${props.offer.providerName} up to ${formatMoney(maxCharge)}.`,
    };
    if (notBefore !== undefined) input.executeNotBefore = notBefore.toISOString();

    setSubmitting(true);
    try {
      await props.onApprove(input);
      props.onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to record approval');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={props.onClose}>
      <section
        className="dialog approval-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="approval-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="dialog-header">
          <div>
            <p className="eyebrow">Explicit checkout authority</p>
            <h2 id="approval-title">Approve this booking</h2>
          </div>
          <button className="icon-button" type="button" onClick={props.onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className="dialog-body approval-body">
          <div className="approval-offer">
            <span className="approval-provider">{props.offer.providerName}</span>
            <strong>{props.offer.title}</strong>
            <span>{props.offer.subtitle}</span>
            <div>
              <small>Current listed total</small>
              <b>{priceKnown ? formatMoney(props.offer.finalPrice) : 'Unavailable'}</b>
            </div>
          </div>

          <div className="safety-callout">
            <ShieldCheck size={19} />
            <p>
              This approval is locked to the provider, offer fingerprint, price ceiling, and time
              window below. Flow cannot use it for another purchase.
            </p>
          </div>

          <div className="form-grid">
            <label className="field">
              <span>Maximum total ({props.offer.finalPrice.currency})</span>
              <input
                inputMode="decimal"
                value={maximum}
                onChange={(event) => setMaximum(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Approval expires</span>
              <input
                type="datetime-local"
                value={validUntil}
                onChange={(event) => setValidUntil(event.target.value)}
              />
            </label>
            <label className="field field-wide">
              <span>
                Do not execute before <small>optional</small>
              </span>
              <input
                type="datetime-local"
                value={executeNotBefore}
                onChange={(event) => setExecuteNotBefore(event.target.value)}
              />
            </label>
          </div>

          <label className="check-row check-row-strong">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>I understand that this authorizes checkout within the boundary above.</span>
          </label>
          <label className="field confirmation-field">
            <span>Type APPROVE to confirm</span>
            <div className="token-field">
              <LockKeyhole size={16} />
              <input
                value={typedConfirmation}
                onChange={(event) => setTypedConfirmation(event.target.value)}
                autoComplete="off"
              />
            </div>
          </label>
          <div className="approval-warning">
            <AlertTriangle size={16} />
            <span>Some providers may still require payment authentication or a final handoff.</span>
          </div>
          {error === undefined ? null : <p className="form-error">{error}</p>}
        </div>

        <footer className="dialog-footer">
          <span className="dialog-safety">No payment credentials are stored by Flow</span>
          <div>
            <button className="button button-ghost" type="button" onClick={props.onClose}>
              Cancel
            </button>
            <button
              className="button button-primary"
              type="button"
              disabled={submitting}
              onClick={() => void submit()}
            >
              {submitting ? 'Approving…' : 'Approve boundary'}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
