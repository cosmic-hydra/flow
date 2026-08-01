import type { Booking, Conversation, User } from '@flow/contracts';
import {
  CalendarClock,
  CircleUserRound,
  HeartHandshake,
  Link2,
  LogOut,
  MessageSquareText,
  Plus,
  ServerCog,
  Settings2,
  X,
} from 'lucide-react';
import { relativeTime, statusLabel } from '../format.js';

export type AppView = 'chat' | 'bookings' | 'providers' | 'accounts';

export function Sidebar(props: {
  user: User;
  conversations: Conversation[];
  bookings: Booking[];
  selectedConversationId?: string;
  selectedBookingId?: string;
  view: AppView;
  open: boolean;
  onClose: () => void;
  onNewConversation: () => void;
  onSelectConversation: (id: string) => void;
  onSelectBooking: (id: string) => void;
  onChangeView: (view: AppView) => void;
  onCreateBooking: () => void;
  onOpenSetup: () => void;
  onLogout: () => void;
}): React.JSX.Element {
  return (
    <>
      <button
        type="button"
        aria-label="Close navigation"
        className={`sidebar-scrim ${props.open ? 'sidebar-scrim-visible' : ''}`}
        onClick={props.onClose}
      />
      <aside className={`sidebar ${props.open ? 'sidebar-open' : ''}`}>
        <header className="sidebar-header">
          <button
            className="brand-button"
            type="button"
            onClick={() => props.onChangeView('chat')}
            aria-label="Go to Flow chat"
          >
            <span className="brand-mark" aria-hidden="true">
              F
            </span>
            <span>
              <strong>Flow</strong>
              <small>Booking concierge</small>
            </span>
          </button>
          <button className="icon-button sidebar-close" type="button" onClick={props.onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="sidebar-actions">
          <button
            className="button button-primary button-full"
            type="button"
            onClick={props.onNewConversation}
          >
            <Plus size={16} />
            New conversation
          </button>
          <button
            className="button button-secondary button-full"
            type="button"
            onClick={props.onCreateBooking}
          >
            <CalendarClock size={16} />
            Structured booking
          </button>
        </div>

        <nav className="primary-nav" aria-label="Primary">
          <button
            className={props.view === 'chat' ? 'nav-item nav-item-active' : 'nav-item'}
            type="button"
            onClick={() => props.onChangeView('chat')}
          >
            <MessageSquareText size={17} />
            Chat
          </button>
          <button
            className={props.view === 'bookings' ? 'nav-item nav-item-active' : 'nav-item'}
            type="button"
            onClick={() => props.onChangeView('bookings')}
          >
            <HeartHandshake size={17} />
            Bookings
            {props.bookings.length === 0 ? null : (
              <span className="nav-count">{props.bookings.length}</span>
            )}
          </button>
          <button
            className={props.view === 'accounts' ? 'nav-item nav-item-active' : 'nav-item'}
            type="button"
            onClick={() => props.onChangeView('accounts')}
          >
            <Link2 size={17} />
            Accounts
          </button>
          <button
            className={props.view === 'providers' ? 'nav-item nav-item-active' : 'nav-item'}
            type="button"
            onClick={() => props.onChangeView('providers')}
          >
            <ServerCog size={17} />
            Providers
          </button>
          <button className="nav-item" type="button" onClick={props.onOpenSetup}>
            <Settings2 size={17} />
            Setup
          </button>
        </nav>

        <div className="sidebar-scroll">
          <section className="sidebar-section">
            <div className="sidebar-section-title">
              <span>Recent chats</span>
              <span>{props.conversations.length}</span>
            </div>
            <div className="sidebar-list">
              {props.conversations.slice(0, 10).map((conversation) => (
                <button
                  type="button"
                  key={conversation.id}
                  className={
                    props.selectedConversationId === conversation.id && props.view === 'chat'
                      ? 'sidebar-list-item sidebar-list-item-active'
                      : 'sidebar-list-item'
                  }
                  onClick={() => props.onSelectConversation(conversation.id)}
                >
                  <span className="sidebar-list-main">{conversation.title}</span>
                  <small>{relativeTime(conversation.updatedAt)}</small>
                </button>
              ))}
              {props.conversations.length === 0 ? (
                <p className="sidebar-empty">Start with what you want to book.</p>
              ) : null}
            </div>
          </section>

          <section className="sidebar-section">
            <div className="sidebar-section-title">
              <span>Active bookings</span>
              <span>
                {
                  props.bookings.filter(
                    (booking) => !['booked', 'cancelled', 'expired'].includes(booking.status),
                  ).length
                }
              </span>
            </div>
            <div className="sidebar-list">
              {props.bookings.slice(0, 8).map((booking) => (
                <button
                  type="button"
                  key={booking.id}
                  className={
                    props.selectedBookingId === booking.id && props.view === 'bookings'
                      ? 'sidebar-list-item sidebar-list-item-active'
                      : 'sidebar-list-item'
                  }
                  onClick={() => props.onSelectBooking(booking.id)}
                >
                  <span className="sidebar-list-main">{booking.intent.title}</span>
                  <small>{statusLabel(booking.status)}</small>
                </button>
              ))}
            </div>
          </section>
        </div>

        <footer className="sidebar-footer">
          <div className="user-chip">
            <CircleUserRound size={18} />
            <span>
              <strong>{props.user.displayName}</strong>
              <small>{props.user.email}</small>
            </span>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Sign out"
            onClick={props.onLogout}
          >
            <LogOut size={17} />
          </button>
        </footer>
      </aside>
    </>
  );
}
