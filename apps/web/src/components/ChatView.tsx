import type { Message } from '@flow/contracts';
import {
  ArrowUp,
  Bot,
  CalendarDays,
  Clock3,
  Plane,
  Share2,
  ShieldCheck,
  Ticket,
  UserRound,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const prompts = [
  {
    icon: Ticket,
    title: 'Movie night',
    text: 'Find two adjacent center seats for a movie this weekend under ₹1,500 total.',
  },
  {
    icon: Plane,
    title: 'Flexible flight',
    text: 'Compare refundable flights from Bengaluru to Singapore next month, one stop max.',
  },
  {
    icon: CalendarDays,
    title: 'Reserve ahead',
    text: 'Schedule a restaurant search for next Friday at 8 PM for four people.',
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

  return (
    <div className={`chat-view ${showHero ? 'chat-view-hero' : ''}`}>
      <div className="chat-scroll">
        {showHero ? (
          <section className="hero-stage" aria-label="Flow hero">
            <div className="hero-media" aria-hidden="true">
              <img src="/assets/iceland-flow-hero.webp" alt="" className="hero-image" />
              <div className="hero-veil" />
            </div>
            <div className="hero-content">
              <div className="hero-brand-block">
                <p className="hero-kicker">Flow</p>
                <h1 className="hero-title">Book anything</h1>
                <p className="hero-support">Best verified price. Your approval before checkout.</p>
                <button
                  type="button"
                  className="button button-pill-light hero-order"
                  onClick={() => {
                    composerRef.current?.focus();
                    submit(prompts[1].text);
                  }}
                >
                  Order
                </button>
              </div>
              <div className="hero-footer">
                <span>Other services</span>
                <button
                  type="button"
                  className="glass-pill hero-more"
                  onClick={props.onOpenSetup}
                  aria-label="Open setup and other services"
                >
                  ···
                </button>
              </div>
            </div>
            <div className="hero-below">
              <div className="hero-prompts" aria-label="Suggested requests">
                {prompts.map((prompt) => {
                  const Icon = prompt.icon;
                  return (
                    <button
                      key={prompt.title}
                      type="button"
                      className="hero-prompt"
                      disabled={props.sending}
                      onClick={() => submit(prompt.text)}
                    >
                      <Icon size={16} />
                      <span>
                        <strong>{prompt.title}</strong>
                        <small>{prompt.text}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
              {!props.modelConfigured ? (
                <div className="hero-notice">
                  <Bot size={16} />
                  Planner uses the local fallback until OPENAI_API_KEY is set — bookings still run.
                </div>
              ) : null}
            </div>
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
            placeholder="Describe anything you want to book…"
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
      {showHero ? (
        <button type="button" className="hero-share glass-icon" aria-label="Share Flow">
          <Share2 size={16} />
        </button>
      ) : null}
    </div>
  );
}
