import type { Message } from '@flow/contracts';
import {
  ArrowLeftRight,
  ArrowUp,
  CalendarDays,
  ChevronDown,
  Plane,
  ShieldCheck,
  UserRound,
  Users,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

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
          <section className="apple-stage" aria-label="Plan your trip">
            <div className="apple-stage__atmosphere" aria-hidden="true" />
            <div className="apple-stage__content">
              <p className="apple-brand">Flow</p>
              <h1 className="apple-headline">Travel, clarified.</h1>
              <p className="apple-support">
                Search flights and stays, compare real totals, and approve checkout yourself.
              </p>

              <div className="search-panel">
                <div className="search-panel__route">
                  <label className="search-field">
                    <span>From</span>
                    <input
                      value={from}
                      onChange={(event) => setFrom(event.target.value)}
                      aria-label="From"
                    />
                  </label>
                  <button
                    type="button"
                    className="search-swap"
                    onClick={swapRoute}
                    aria-label="Swap origin and destination"
                  >
                    <ArrowLeftRight size={15} />
                  </button>
                  <label className="search-field">
                    <span>To</span>
                    <input
                      value={to}
                      onChange={(event) => setTo(event.target.value)}
                      aria-label="To"
                    />
                  </label>
                </div>

                <div className="search-panel__meta">
                  <label className="search-field search-field--inline">
                    <span>Departure</span>
                    <span className="search-field__control">
                      <CalendarDays size={15} aria-hidden="true" />
                      <input
                        type="date"
                        value={departDate}
                        onChange={(event) => setDepartDate(event.target.value)}
                        aria-label="Departure date"
                      />
                    </span>
                  </label>
                  <label className="search-field search-field--inline">
                    <span>Travelers</span>
                    <span className="search-field__control">
                      <Users size={15} aria-hidden="true" />
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
                      <ChevronDown size={14} aria-hidden="true" />
                    </span>
                  </label>
                </div>

                <button
                  type="button"
                  className="button button-ink button-full search-submit"
                  disabled={props.sending}
                  onClick={searchFlights}
                >
                  <Plane size={16} />
                  {props.sending ? 'Searching…' : 'Search flights'}
                </button>
              </div>
            </div>
          </section>
        ) : (
          <div className="message-list">
            {props.messages
              .filter((message) => message.role === 'user' || message.role === 'assistant')
              .map((message) => (
                <article key={message.id} className={`message message-${message.role}`}>
                  <div className="message-avatar" aria-hidden="true">
                    {message.role === 'assistant' ? 'F' : <UserRound size={17} />}
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
                <div className="message-avatar">F</div>
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
              showHero ? 'Or describe a hotel, movie, or trip…' : 'Describe what you want to book…'
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
              <ShieldCheck size={14} /> Checkout always needs your approval
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
