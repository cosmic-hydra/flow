import type { BookingCategory, CreateBookingInput, Money } from '@flow/contracts';
import { ArrowRight, CalendarClock, X } from 'lucide-react';
import { useMemo, useState } from 'react';

const categories: Array<{ value: BookingCategory; label: string }> = [
  { value: 'movie', label: 'Movie' },
  { value: 'flight', label: 'Flight' },
  { value: 'train', label: 'Train' },
  { value: 'bus', label: 'Bus' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'event', label: 'Event' },
  { value: 'activity', label: 'Activity' },
  { value: 'appointment', label: 'Appointment' },
  { value: 'rental', label: 'Rental' },
  { value: 'shopping', label: 'Product' },
  { value: 'service', label: 'Service' },
  { value: 'generic', label: 'Anything else' },
];

function localInputValue(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function money(amount: string, currency: string): Money | undefined {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  const multiplier = currency === 'JPY' || currency === 'KRW' ? 1 : 100;
  return { amountMinor: Math.round(numeric * multiplier), currency: currency.toUpperCase() };
}

function listValues(value: string): string[] {
  return value
    .split(/[\n,]/u)
    .map((item) => item.trim())
    .filter((item, index, values) => item !== '' && values.indexOf(item) === index);
}

export function CreateBookingDialog(props: {
  open: boolean;
  onClose: () => void;
  onCreate: (input: CreateBookingInput) => Promise<void>;
}): React.JSX.Element | null {
  const tomorrow = useMemo(() => {
    const value = new Date(Date.now() + 24 * 60 * 60_000);
    value.setHours(19, 0, 0, 0);
    return value;
  }, []);
  const [category, setCategory] = useState<BookingCategory>('movie');
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [start, setStart] = useState(localInputValue(tomorrow));
  const [end, setEnd] = useState(localInputValue(new Date(tomorrow.getTime() + 3 * 60 * 60_000)));
  const [partySize, setPartySize] = useState(2);
  const [budget, setBudget] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [researchAt, setResearchAt] = useState('');
  const [executeAt, setExecuteAt] = useState('');
  const [constraints, setConstraints] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [seatTogether, setSeatTogether] = useState(true);
  const [preferCenter, setPreferCenter] = useState(true);
  const [avoidFrontRows, setAvoidFrontRows] = useState(2);
  const [preferredRows, setPreferredRows] = useState('');
  const [preferredSections, setPreferredSections] = useState('');
  const [preferredClasses, setPreferredClasses] = useState('');
  const [maxPerSeat, setMaxPerSeat] = useState('');
  const [accessibilityRequired, setAccessibilityRequired] = useState(false);
  const [maxStops, setMaxStops] = useState('');
  const [preferredCarriers, setPreferredCarriers] = useState('');
  const [avoidedCarriers, setAvoidedCarriers] = useState('');
  const [travelRefundable, setTravelRefundable] = useState(false);
  const [baggageRequired, setBaggageRequired] = useState(false);
  const [rooms, setRooms] = useState(1);
  const [children, setChildren] = useState(0);
  const [minimumRating, setMinimumRating] = useState('');
  const [amenities, setAmenities] = useState('');
  const [lodgingRefundable, setLodgingRefundable] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  if (!props.open) return null;
  const isTravel = category === 'flight' || category === 'train' || category === 'bus';

  const submit = async (): Promise<void> => {
    setError(undefined);
    if (title.trim().length < 2) {
      setError('Give the booking a specific name or query.');
      return;
    }
    if (isTravel && (origin.trim() === '' || destination.trim() === '')) {
      setError('Origin and destination are required for travel.');
      return;
    }
    if (!isTravel && location.trim() === '') {
      setError('A city, venue, or search location is required.');
      return;
    }
    if (!Number.isInteger(partySize) || partySize < 1 || partySize > 100) {
      setError('People / quantity must be a whole number between 1 and 100.');
      return;
    }
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (Number.isNaN(startDate.getTime()) || endDate <= startDate) {
      setError('Choose a valid start and end window.');
      return;
    }
    const researchDate = researchAt.trim() === '' ? new Date() : new Date(researchAt);
    const deadlineDate = new Date(startDate.getTime() - 15 * 60_000);
    if (Number.isNaN(researchDate.getTime()) || researchDate >= deadlineDate) {
      setError('Research must start before the booking deadline.');
      return;
    }
    if (deadlineDate <= new Date()) {
      setError('The booking window must be far enough in the future to research it.');
      return;
    }
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    if (contactEmail.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(contactEmail.trim())) {
      setError('Enter a valid provider contact email.');
      return;
    }
    const normalizedPhone = contactPhone.replace(/[\s()-]/gu, '');
    if (
      contactPhone.trim() !== '' &&
      (!/^\+?\d+$/u.test(normalizedPhone) || normalizedPhone.replace('+', '').length < 7)
    ) {
      setError('Enter a valid provider contact phone number.');
      return;
    }
    const intent: CreateBookingInput['intent'] = {
      category,
      title: title.trim(),
      description: '',
      partySize,
      timeWindow: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        timezone,
      },
      preferredProviders: [],
      excludedProviders: [],
      constraints: constraints
        .split('\n')
        .map((value) => value.trim())
        .filter((value) => value !== ''),
      metadata: {},
    };
    if (contactEmail.trim() !== '') intent.metadata.contactEmail = contactEmail.trim();
    if (contactPhone.trim() !== '') intent.metadata.contactPhone = normalizedPhone;
    if (isTravel) {
      intent.origin = { label: origin.trim() };
      intent.destination = { label: destination.trim() };
    } else {
      intent.venue = { label: location.trim(), city: location.trim() };
      if (category === 'hotel' || category === 'activity' || category === 'rental') {
        intent.destination = { label: location.trim(), city: location.trim() };
      }
    }
    const parsedBudget = money(budget, currency);
    if (parsedBudget !== undefined) intent.budget = parsedBudget;
    if (category === 'movie' || category === 'event') {
      if (!Number.isInteger(avoidFrontRows) || avoidFrontRows < 0 || avoidFrontRows > 20) {
        setError('Front rows to avoid must be a whole number from 0 to 20.');
        return;
      }
      const parsedMaxPerSeat = money(maxPerSeat, currency);
      if (maxPerSeat.trim() !== '' && parsedMaxPerSeat === undefined) {
        setError('Enter a valid maximum price per seat.');
        return;
      }
      intent.seatPreference = {
        count: partySize,
        together: seatTogether,
        preferredRows: listValues(preferredRows),
        preferredSections: listValues(preferredSections),
        preferredClasses: listValues(preferredClasses),
        avoidFrontRows,
        preferCenter,
        accessibilityRequired,
      };
      if (parsedMaxPerSeat !== undefined) {
        intent.seatPreference.maxPricePerSeat = parsedMaxPerSeat;
      }
    }
    if (category === 'flight' || category === 'train') {
      const parsedMaxStops = maxStops.trim() === '' ? undefined : Number(maxStops);
      if (
        parsedMaxStops !== undefined &&
        (!Number.isInteger(parsedMaxStops) || parsedMaxStops < 0 || parsedMaxStops > 5)
      ) {
        setError('Maximum stops / changes must be a whole number from 0 to 5.');
        return;
      }
      intent.travelPreference = {
        cabinClasses: [],
        preferredCarriers: listValues(preferredCarriers),
        avoidedCarriers: listValues(avoidedCarriers),
        refundableOnly: travelRefundable,
        baggageRequired,
      };
      if (parsedMaxStops !== undefined) intent.travelPreference.maxStops = parsedMaxStops;
    }
    if (category === 'hotel') {
      const parsedMinimumRating = minimumRating.trim() === '' ? undefined : Number(minimumRating);
      if (!Number.isInteger(rooms) || rooms < 1 || rooms > 20) {
        setError('Rooms must be a whole number from 1 to 20.');
        return;
      }
      if (!Number.isInteger(children) || children < 0 || children > 20) {
        setError('Children must be a whole number from 0 to 20.');
        return;
      }
      if (
        parsedMinimumRating !== undefined &&
        (!Number.isFinite(parsedMinimumRating) ||
          parsedMinimumRating < 0 ||
          parsedMinimumRating > 10)
      ) {
        setError('Minimum rating must be from 0 to 10.');
        return;
      }
      intent.lodgingPreference = {
        rooms,
        adults: partySize,
        children,
        amenities: listValues(amenities),
        refundableOnly: lodgingRefundable,
      };
      if (parsedMinimumRating !== undefined) {
        intent.lodgingPreference.minimumRating = parsedMinimumRating;
      }
    }
    const automation: CreateBookingInput['automation'] = {
      researchAt: researchDate.toISOString(),
      deadline: deadlineDate.toISOString(),
      refreshIntervalMinutes: 60,
      maxCouponAttempts: 8,
      autoExecuteWithinApproval: false,
    };
    if (executeAt.trim() !== '') {
      const executionDate = new Date(executeAt);
      if (
        Number.isNaN(executionDate.getTime()) ||
        executionDate.getTime() < Date.now() ||
        executionDate.getTime() < researchDate.getTime() ||
        executionDate.getTime() > deadlineDate.getTime()
      ) {
        setError('Scheduled execution must be in the future and before the booking deadline.');
        return;
      }
      automation.executeAt = executionDate.toISOString();
    }

    setSubmitting(true);
    try {
      await props.onCreate({ intent, automation });
      props.onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to create booking');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={props.onClose}>
      <section
        className="dialog create-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-booking-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="dialog-header">
          <div>
            <p className="eyebrow">Structured request</p>
            <h2 id="create-booking-title">Book anything</h2>
          </div>
          <button className="icon-button" type="button" onClick={props.onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className="dialog-body form-grid">
          <label className="field">
            <span>Category</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as BookingCategory)}
            >
              {categories.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field field-wide">
            <span>What do you want?</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={
                category === 'movie' ? 'Movie name' : 'Specific item, service, or reservation'
              }
              autoFocus
            />
          </label>

          {isTravel ? (
            <>
              <label className="field">
                <span>From</span>
                <input
                  value={origin}
                  onChange={(event) => setOrigin(event.target.value)}
                  placeholder="City or airport"
                />
              </label>
              <label className="field">
                <span>To</span>
                <input
                  value={destination}
                  onChange={(event) => setDestination(event.target.value)}
                  placeholder="City or airport"
                />
              </label>
            </>
          ) : (
            <label className="field field-wide">
              <span>Location</span>
              <input
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="City, area, or venue"
              />
            </label>
          )}

          <label className="field">
            <span>Window starts</span>
            <input
              type="datetime-local"
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Window ends</span>
            <input
              type="datetime-local"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
          </label>
          <label className="field">
            <span>People / quantity</span>
            <input
              type="number"
              min="1"
              max="100"
              value={partySize}
              onChange={(event) => setPartySize(Number(event.target.value))}
            />
          </label>
          <label className="field">
            <span>Maximum total</span>
            <div className="money-input">
              <select
                value={currency}
                onChange={(event) => setCurrency(event.target.value)}
                aria-label="Currency"
              >
                {['INR', 'USD', 'EUR', 'GBP', 'SGD', 'AED', 'JPY'].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
              <input
                inputMode="decimal"
                value={budget}
                onChange={(event) => setBudget(event.target.value)}
                placeholder="Optional"
              />
            </div>
          </label>
          {category === 'movie' || category === 'event' ? (
            <section className="preference-panel field-wide" aria-labelledby="seat-preferences">
              <div className="preference-heading">
                <strong id="seat-preferences">Seat preferences</strong>
                <span>Used for deterministic seat-group ranking</span>
              </div>
              <div className="preference-grid">
                <label className="field">
                  <span>Preferred rows</span>
                  <input
                    value={preferredRows}
                    onChange={(event) => setPreferredRows(event.target.value)}
                    placeholder="H, J"
                  />
                </label>
                <label className="field">
                  <span>Sections / classes</span>
                  <input
                    value={preferredSections}
                    onChange={(event) => setPreferredSections(event.target.value)}
                    placeholder="Center, balcony"
                  />
                </label>
                <label className="field">
                  <span>Seat classes</span>
                  <input
                    value={preferredClasses}
                    onChange={(event) => setPreferredClasses(event.target.value)}
                    placeholder="Recliner, premium"
                  />
                </label>
                <label className="field">
                  <span>Front rows to avoid</span>
                  <input
                    type="number"
                    min="0"
                    max="20"
                    value={avoidFrontRows}
                    onChange={(event) => setAvoidFrontRows(Number(event.target.value))}
                  />
                </label>
                <label className="field">
                  <span>Maximum per seat</span>
                  <input
                    inputMode="decimal"
                    value={maxPerSeat}
                    onChange={(event) => setMaxPerSeat(event.target.value)}
                    placeholder={`Optional ${currency}`}
                  />
                </label>
              </div>
              <div className="preference-checks">
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={seatTogether}
                    onChange={(event) => setSeatTogether(event.target.checked)}
                  />
                  <span>Keep seats together</span>
                </label>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={preferCenter}
                    onChange={(event) => setPreferCenter(event.target.checked)}
                  />
                  <span>Prefer center</span>
                </label>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={accessibilityRequired}
                    onChange={(event) => setAccessibilityRequired(event.target.checked)}
                  />
                  <span>Accessibility required</span>
                </label>
              </div>
            </section>
          ) : null}
          {category === 'flight' || category === 'train' ? (
            <section className="preference-panel field-wide" aria-labelledby="travel-preferences">
              <div className="preference-heading">
                <strong id="travel-preferences">Travel preferences</strong>
                <span>Unknown hard-constraint values are not treated as matches</span>
              </div>
              <div className="preference-grid">
                <label className="field">
                  <span>Maximum stops / changes</span>
                  <input
                    type="number"
                    min="0"
                    max="5"
                    value={maxStops}
                    onChange={(event) => setMaxStops(event.target.value)}
                    placeholder="Optional"
                  />
                </label>
                <label className="field">
                  <span>Preferred carriers</span>
                  <input
                    value={preferredCarriers}
                    onChange={(event) => setPreferredCarriers(event.target.value)}
                    placeholder="IndiGo, Vistara"
                  />
                </label>
                <label className="field field-wide">
                  <span>Avoid carriers</span>
                  <input
                    value={avoidedCarriers}
                    onChange={(event) => setAvoidedCarriers(event.target.value)}
                    placeholder="Comma-separated"
                  />
                </label>
              </div>
              <div className="preference-checks">
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={travelRefundable}
                    onChange={(event) => setTravelRefundable(event.target.checked)}
                  />
                  <span>Refundable only</span>
                </label>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={baggageRequired}
                    onChange={(event) => setBaggageRequired(event.target.checked)}
                  />
                  <span>Checked baggage required</span>
                </label>
              </div>
            </section>
          ) : null}
          {category === 'hotel' ? (
            <section className="preference-panel field-wide" aria-labelledby="lodging-preferences">
              <div className="preference-heading">
                <strong id="lodging-preferences">Stay preferences</strong>
                <span>Rating uses a normalized 10-point scale</span>
              </div>
              <div className="preference-grid">
                <label className="field">
                  <span>Rooms</span>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={rooms}
                    onChange={(event) => setRooms(Number(event.target.value))}
                  />
                </label>
                <label className="field">
                  <span>Children</span>
                  <input
                    type="number"
                    min="0"
                    max="20"
                    value={children}
                    onChange={(event) => setChildren(Number(event.target.value))}
                  />
                </label>
                <label className="field">
                  <span>Minimum rating / 10</span>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    step="0.1"
                    value={minimumRating}
                    onChange={(event) => setMinimumRating(event.target.value)}
                    placeholder="Optional"
                  />
                </label>
                <label className="field">
                  <span>Required amenities</span>
                  <input
                    value={amenities}
                    onChange={(event) => setAmenities(event.target.value)}
                    placeholder="Wi-Fi, pool"
                  />
                </label>
              </div>
              <div className="preference-checks">
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={lodgingRefundable}
                    onChange={(event) => setLodgingRefundable(event.target.checked)}
                  />
                  <span>Refundable only</span>
                </label>
              </div>
            </section>
          ) : null}
          <label className="field">
            <span>
              Start researching <small>optional, defaults to now</small>
            </span>
            <input
              type="datetime-local"
              value={researchAt}
              onChange={(event) => setResearchAt(event.target.value)}
            />
          </label>
          <label className="field field-wide">
            <span>
              Execute no earlier than <small>optional, still requires approval</small>
            </span>
            <input
              type="datetime-local"
              value={executeAt}
              onChange={(event) => setExecuteAt(event.target.value)}
            />
          </label>
          <div className="preference-heading field-wide contact-heading">
            <strong>Provider contact</strong>
            <span>Optional; excluded from public coupon research</span>
          </div>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={contactEmail}
              onChange={(event) => setContactEmail(event.target.value)}
              placeholder="For ticket delivery"
              autoComplete="email"
            />
          </label>
          <label className="field">
            <span>Phone</span>
            <input
              type="tel"
              value={contactPhone}
              onChange={(event) => setContactPhone(event.target.value)}
              placeholder="For provider checkout"
              autoComplete="tel"
            />
          </label>
          <label className="field field-wide">
            <span>
              Additional requirements <small>one per line</small>
            </span>
            <textarea
              value={constraints}
              onChange={(event) => setConstraints(event.target.value)}
              rows={3}
              placeholder="Wheelchair accessible\nRefundable only\nAvoid front row"
            />
          </label>
          {error === undefined ? null : <p className="form-error field-wide">{error}</p>}
        </div>

        <footer className="dialog-footer">
          <span className="dialog-safety">
            <CalendarClock size={15} />
            {researchAt === '' ? 'Research begins immediately' : 'Research begins on schedule'}
          </span>
          <div>
            <button className="button button-ghost" type="button" onClick={props.onClose}>
              Cancel
            </button>
            <button
              className="button button-primary"
              type="button"
              onClick={() => void submit()}
              disabled={submitting}
            >
              {submitting ? 'Creating…' : 'Create booking'}
              <ArrowRight size={16} />
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
