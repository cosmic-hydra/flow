import type { Message } from '@flow/contracts';
import {
  ArrowLeftRight,
  ArrowUp,
  Bot,
  CalendarDays,
  ChevronDown,
  Clock3,
  Plane,
  ShieldCheck,
  UserRound,
  Users,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const savedTrips = [
  {
    airline: 'Flow Demo Air',
    from: 'BLR',
    to: 'SIN',
    depart: '08:40',
    arrive: '14:05',
    date: 'Sep 10',
    prompt: 'Compare refundable flights from Bengaluru to Singapore next month under $650',
  },
  {
    airline: 'District Cinema',
    from: 'HYD',
    to: 'MOV',
    depart: '19:30',
    arrive: '22:10',
    date: 'Sat',
    prompt: 'Find two adjacent center seats for a movie this weekend under ₹1,500 total.',
  },
  {
    airline: 'Coastal Stay',
    from: 'GOA',
    to: 'HTL',
    depart: 'Check-in',
    arrive: '2 nts',
    date: 'Fri',
    prompt: 'Schedule a hotel search in Goa next Friday for two nights, free cancellation.',
  },
] as const;

function MessageBody({ content }: { content: string }): React.JSX.Element {
  const blocks = content.split(/\n{2,}/u).filter((block) => block.trim() !== '');
  return (
    <div className="message-copy">
      {blocks.map((block, index) => {
        const lines = block.split('\n');
        const isList = lines.every((line) => /^\s*[-*]\s+/u.test(line));
        if (isList) {
          return (
            <ul key={`${index}-${block.slice(0, 12)}`}>
              {lines.map((line) => (
                <li key={line}>{line.replace(/^\s*[-*]\s+/u, '')}</li>
              ))}
            </ul>
          );
        }
        return <p key={`${index}-${block.slice(0, 12)}`}>{block}</p>;
      })}
    </div>
  );
}

export function ChatView(props: {
  messages: Message[];
  sending: boolean;
  modelConfigured: boolean;
  onSend: (content: string) => Promise<void>;
  onOpenSetup?: () => void;
}): React.JSX.Element {
  const [draft, setDraft] = useState('');
  const [from, setFrom] = useState('Bengaluru (BLR)');
  const [to, setTo] = useState('Singapore (SIN)');
  const [departDate, setDepartDate] = useState('2026-09-10');
  const [party, setParty] = useState('1');
  const bottomRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const showHero = props.messages.length === 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [props.messages, props.sending]);

  const submit = (value = draft): void => {
    const content = value.trim();
    if (content === '' || props.sending) return;
    setDraft('');
    void props.onSend(content);
  };

  const searchFlights = (): void => {
    const query = `Find flights from ${from} to ${to} departing ${departDate} for ${party} traveler${party === '1' ? '' : 's'}, best total price, refundable if possible.`;
    submit(query);
  };

  const swapRoute = (): void => {
    setFrom(to);
    setTo(from);
  };

  return (
    <div className={`chat-view ${showHero ? 'chat-view-hero' : ''}`}>
      <div className="chat-scroll">
        {showHero ? (
          <section className="plan-stage" aria-label="Plan your trip">
            <div className="plan-glow" aria-hidden="true" />
            <header className="plan-heading">
              <div>
                <p className="plan-kicker">Flow</p>
                <h1>Plan your trip</h1>
              </div>
              <button
                type="button"
                className="plan-avatar"
                onClick={props.onOpenSetup}
                aria-label="Open setup"
              >
                F
              </button>
            </header>

            <div className="frost-card">
              <div className="route-stack">
                <label className="route-field">
                  <span>From</span>
                  <input
                    value={from}
                    onChange={(event) => setFrom(event.target.value)}
                    aria-label="From"
                  />
                </label>
                <button
                  type="button"
                  className="route-swap"
                  onClick={swapRoute}
                  aria-label="Swap origin and destination"
                >
                  <ArrowLeftRight size={16} />
                </button>
                <label className="route-field">
                  <span>To</span>
                  <input
                    value={to}
                    onChange={(event) => setTo(event.target.value)}
                    aria-label="To"
                  />
                </label>
              </div>

              <div className="trip-meta-row">
                <label className="meta-chip">
                  <span>Departure</span>
                  <span className="meta-chip-value">
                    <CalendarDays size={15} />
                    <input
                      type="date"
                      value={departDate}
                      onChange={(event) => setDepartDate(event.target.value)}
                      aria-label="Departure date"
                    />
                  </span>
                </label>
                <label className="meta-chip">
                  <span>Travelers</span>
                  <span className="meta-chip-value">
                    <Users size={15} />
                    <select
                      value={party}
                      onChange={(event) => setParty(event.target.value)}
                      aria-label="Travelers"
                    >
                      {['1', '2', '3', '4', '5', '6'].map((count) => (
                        <option key={count} value={count}>
                          {count}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} />
                  </span>
                </label>
              </div>

              <button
                type="button"
                className="button button-ink button-full"
                disabled={props.sending}
                onClick={searchFlights}
              >
                <Plane size={16} />
                Search flights
              </button>
            </div>

            <section className="saved-trips">
              <div className="saved-trips-head">
                <h2>Saved trips</h2>
                <span>Tap to book</span>
              </div>
              <div className="saved-trips-rail">
                {savedTrips.map((trip) => (
                  <button
                    key={trip.prompt}
                    type="button"
                    className="saved-trip-card"
                    disabled={props.sending}
                    onClick={() => submit(trip.prompt)}
                  >
                    <div className="saved-trip-airline">
                      <span className="airline-mark">{trip.airline.slice(0, 1)}</span>
                      <strong>{trip.airline}</strong>
                    </div>
                    <div className="saved-trip-route">
                      <div>
                        <b>{trip.depart}</b>
                        <small>{trip.from}</small>
                      </div>
                      <div className="saved-trip-line" aria-hidden="true">
                        <Plane size={12} />
                      </div>
                      <div>
                        <b>{trip.arrive}</b>
                        <small>{trip.to}</small>
                      </div>
                    </div>
                    <span className="saved-trip-date">{trip.date}</span>
                  </button>
                ))}
              </div>
            </section>

            {!props.modelConfigured ? (
              <p className="plan-note">
                <Bot size={14} /> Local planner is active — searches still create real demo
                bookings.
              </p>
            ) : null}
          </section>
        ) : (
          <div className="message-list">
            {props.messages
              .filter((message) => message.role === 'user' || message.role === 'assistant')
              .map((message) => (
                <article key={message.id} className={`message message-${message.role}`}>
                  <div className="message-avatar" aria-hidden="true">
                    {message.role === 'assistant' ? <Bot size={17} /> : <UserRound size={17} />}
                  </div>
                  <div className="message-content">
                    <div className="message-meta">
                      <strong>{message.role === 'assistant' ? 'Flow' : 'You'}</strong>
                      <time dateTime={message.createdAt}>
                        {new Intl.DateTimeFormat(undefined, {
                          hour: 'numeric',
                          minute: '2-digit',
                        }).format(new Date(message.createdAt))}
                      </time>
                    </div>
                    <MessageBody content={message.content} />
                  </div>
                </article>
              ))}
            {props.sending ? (
              <article className="message message-assistant">
                <div className="message-avatar">
                  <Bot size={17} />
                </div>
                <div className="message-content message-thinking">
                  <span />
                  <span />
                  <span />
                </div>
              </article>
            ) : null}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className={`composer-shell ${showHero ? 'composer-shell-hero' : ''}`}>
        <div className="composer">
          <textarea
            ref={composerRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder={
              showHero ? 'Or describe anything to book…' : 'Describe anything you want to book…'
            }
            aria-label="Message Flow"
          />
          <button
            className="send-button"
            type="button"
            onClick={() => submit()}
            disabled={draft.trim() === '' || props.sending}
            aria-label="Send message"
          >
            <ArrowUp size={18} />
          </button>
        </div>
        {!showHero ? (
          <div className="composer-meta">
            <span>
              <ShieldCheck size={14} /> Checkout requires your explicit approval
            </span>
            <span>
              <Clock3 size={14} /> Scheduled searches run in the background
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
