import type { Message } from '@flow/contracts';
import {
  ArrowUp,
  Bot,
  CalendarDays,
  Clock3,
  Plane,
  ShieldCheck,
  Sparkles,
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
}): React.JSX.Element {
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [props.messages, props.sending]);

  const submit = (): void => {
    const content = draft.trim();
    if (content === '' || props.sending) return;
    setDraft('');
    void props.onSend(content);
  };

  return (
    <div className="chat-view">
      <div className="chat-scroll">
        {props.messages.length === 0 ? (
          <section className="chat-empty">
            <div className="chat-empty-mark">
              <Sparkles size={20} />
            </div>
            <p className="eyebrow">One request, every constraint</p>
            <h2>What should I find and reserve?</h2>
            <p className="chat-empty-copy">
              Give me the date, location, budget, timing, seats, or flexibility that matters. I’ll
              compare total prices and stop for your approval before checkout.
            </p>
            <div className="prompt-grid">
              {prompts.map((prompt) => {
                const Icon = prompt.icon;
                return (
                  <button
                    key={prompt.title}
                    type="button"
                    className="prompt-card"
                    onClick={() => setDraft(prompt.text)}
                  >
                    <span className="prompt-icon">
                      <Icon size={17} />
                    </span>
                    <strong>{prompt.title}</strong>
                    <span>{prompt.text}</span>
                  </button>
                );
              })}
            </div>
            {!props.modelConfigured ? (
              <div className="inline-notice">
                <Bot size={17} />
                <span>
                  The natural-language planner is offline. Structured booking and every provider
                  workflow remain available.
                </span>
              </div>
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

      <div className="composer-shell">
        <div className="composer">
          <textarea
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
            onClick={submit}
            disabled={draft.trim() === '' || props.sending}
            aria-label="Send message"
          >
            <ArrowUp size={18} />
          </button>
        </div>
        <div className="composer-meta">
          <span>
            <ShieldCheck size={14} /> Checkout requires your explicit approval
          </span>
          <span>
            <Clock3 size={14} /> Scheduled searches run in the background
          </span>
        </div>
      </div>
    </div>
  );
}
