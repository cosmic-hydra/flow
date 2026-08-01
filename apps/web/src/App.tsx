import type { Booking, Conversation, CreateBookingInput, Message, User } from '@flow/contracts';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, type BookingDetail, type ProviderSummary } from './api.js';
import { AccountsView } from './components/AccountsView.js';
import { BookingsView } from './components/BookingsView.js';
import { ChatView } from './components/ChatView.js';
import { CreateBookingDialog } from './components/CreateBookingDialog.js';
import { LoginView } from './components/LoginView.js';
import { ProvidersView } from './components/ProvidersView.js';
import { SetupDialog } from './components/SetupDialog.js';
import { Sidebar, type AppView } from './components/Sidebar.js';
import { TopBar } from './components/TopBar.js';

interface AppMeta {
  name: string;
  version: string;
  authMode: string;
  modelConfigured: boolean;
  composioConfigured?: boolean;
  webcmdEnabled?: boolean;
}

interface Toast {
  tone: 'success' | 'error';
  message: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong';
}

export function App(): React.JSX.Element {
  const [meta, setMeta] = useState<AppMeta>();
  const [user, setUser] = useState<User>();
  const [booting, setBooting] = useState(true);
  const [loginError, setLoginError] = useState<string>();
  const [fatalError, setFatalError] = useState<string>();
  const [view, setView] = useState<AppView>('chat');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selectedBookingId, setSelectedBookingId] = useState<string>();
  const [bookingDetail, setBookingDetail] = useState<BookingDetail>();
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [bookingBusy, setBookingBusy] = useState(false);
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [toast, setToast] = useState<Toast>();
  const detailRequestSequence = useRef(0);

  const showError = useCallback((error: unknown): void => {
    setToast({ tone: 'error', message: errorMessage(error) });
  }, []);

  const refreshProviders = useCallback(async (): Promise<void> => {
    setProvidersLoading(true);
    try {
      const response = await api.providers();
      setProviders(response.providers);
    } catch (error) {
      showError(error);
    } finally {
      setProvidersLoading(false);
    }
  }, [showError]);

  const loadMessages = useCallback(async (conversationId: string): Promise<void> => {
    const response = await api.messages(conversationId);
    setMessages(response.messages);
  }, []);

  const refreshBooking = useCallback(
    async (bookingId: string, showLoader: boolean): Promise<void> => {
      const requestSequence = detailRequestSequence.current + 1;
      detailRequestSequence.current = requestSequence;
      if (showLoader) setLoadingDetail(true);
      try {
        const response = await api.booking(bookingId);
        if (detailRequestSequence.current === requestSequence) setBookingDetail(response);
      } catch (error) {
        showError(error);
      } finally {
        if (showLoader) setLoadingDetail(false);
      }
    },
    [showError],
  );

  const refreshBookings = useCallback(async (): Promise<Booking[]> => {
    const response = await api.bookings();
    setBookings(response.bookings);
    return response.bookings;
  }, []);

  const hydrateWorkspace = useCallback(async (): Promise<void> => {
    const [conversationResponse, bookingResponse, providerResponse] = await Promise.all([
      api.conversations(),
      api.bookings(),
      api.providers(),
    ]);
    const nextConversations = conversationResponse.conversations;
    setConversations(nextConversations);
    setBookings(bookingResponse.bookings);
    setProviders(providerResponse.providers);

    const firstConversation = nextConversations[0];
    if (firstConversation !== undefined) {
      setSelectedConversationId(firstConversation.id);
      await loadMessages(firstConversation.id);
    }
    const firstBooking = bookingResponse.bookings[0];
    if (firstBooking !== undefined) {
      setSelectedBookingId(firstBooking.id);
      await refreshBooking(firstBooking.id, false);
    }
  }, [loadMessages, refreshBooking]);

  useEffect(() => {
    let cancelled = false;
    const boot = async (): Promise<void> => {
      try {
        const metaResponse = await api.meta();
        if (cancelled) return;
        setMeta(metaResponse);
        try {
          const meResponse = await api.me();
          if (cancelled) return;
          setUser(meResponse.user);
          await hydrateWorkspace();
          if (localStorage.getItem('flow_setup_complete') !== '1') {
            setSetupOpen(true);
          }
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) return;
          throw error;
        }
      } catch (error) {
        if (!cancelled) setFatalError(errorMessage(error));
      } finally {
        if (!cancelled) setBooting(false);
      }
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, [hydrateWorkspace]);

  useEffect(() => {
    if (toast === undefined) return;
    const timeout = window.setTimeout(() => setToast(undefined), 5_000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (selectedBookingId === undefined || bookingDetail === undefined) return;
    if (['booked', 'cancelled', 'expired'].includes(bookingDetail.booking.status)) return;
    const interval = window.setInterval(() => {
      void Promise.all([refreshBooking(selectedBookingId, false), refreshBookings()]);
    }, 5_000);
    return () => window.clearInterval(interval);
  }, [bookingDetail, refreshBooking, refreshBookings, selectedBookingId]);

  const selectConversation = async (conversationId: string): Promise<void> => {
    setSelectedConversationId(conversationId);
    setView('chat');
    setSidebarOpen(false);
    try {
      await loadMessages(conversationId);
    } catch (error) {
      showError(error);
    }
  };

  const createConversation = async (): Promise<void> => {
    try {
      const response = await api.createConversation();
      setConversations((current) => [response.conversation, ...current]);
      setSelectedConversationId(response.conversation.id);
      setMessages([]);
      setView('chat');
      setSidebarOpen(false);
    } catch (error) {
      showError(error);
    }
  };

  const selectBooking = async (bookingId: string): Promise<void> => {
    setSelectedBookingId(bookingId);
    setView('bookings');
    setSidebarOpen(false);
    await refreshBooking(bookingId, true);
  };

  const sendMessage = async (content: string): Promise<void> => {
    let activeConversationId = selectedConversationId;
    setSending(true);
    try {
      if (activeConversationId === undefined) {
        const created = await api.createConversation();
        activeConversationId = created.conversation.id;
        setConversations((current) => [created.conversation, ...current]);
        setSelectedConversationId(activeConversationId);
      }
      await api.sendMessage(activeConversationId, content, crypto.randomUUID());
      await Promise.all([loadMessages(activeConversationId), refreshBookings()]);
    } catch (error) {
      showError(error);
      if (activeConversationId !== undefined) {
        await loadMessages(activeConversationId).catch(() => undefined);
      }
    } finally {
      setSending(false);
    }
  };

  const createBooking = async (input: CreateBookingInput): Promise<void> => {
    setBookingBusy(true);
    try {
      const response = await api.createBooking(input);
      const nextBookings = await refreshBookings();
      setSelectedBookingId(response.booking.id);
      setBookingDetail({ booking: response.booking, offers: [], audit: [] });
      setView('bookings');
      setToast({ tone: 'success', message: 'Booking created. Research is queued.' });
      if (!nextBookings.some((booking) => booking.id === response.booking.id)) {
        setBookings((current) => [response.booking, ...current]);
      }
    } finally {
      setBookingBusy(false);
    }
  };

  const withSelectedBooking = async (
    operation: (bookingId: string) => Promise<unknown>,
  ): Promise<void> => {
    if (selectedBookingId === undefined) return;
    setBookingBusy(true);
    try {
      await operation(selectedBookingId);
      await Promise.all([refreshBooking(selectedBookingId, false), refreshBookings()]);
    } catch (error) {
      showError(error);
      throw error;
    } finally {
      setBookingBusy(false);
    }
  };

  const topbar = useMemo(() => {
    if (view === 'bookings')
      return { eyebrow: 'Services', title: 'Bookings', action: 'New booking' };
    if (view === 'providers') return { eyebrow: 'System', title: 'Providers' };
    if (view === 'accounts') return { eyebrow: 'Setup', title: 'Accounts' };
    const conversation = conversations.find((item) => item.id === selectedConversationId);
    return { eyebrow: 'Services', title: conversation?.title ?? 'Concierge' };
  }, [conversations, selectedConversationId, view]);

  if (booting) {
    return (
      <main className="boot-screen">
        <span className="brand-mark brand-mark-large">F</span>
        <div className="boot-loader">
          <span />
          <span />
          <span />
        </div>
      </main>
    );
  }

  if (fatalError !== undefined) {
    return (
      <main className="fatal-page">
        <AlertCircle size={26} />
        <h1>Flow could not start</h1>
        <p>{fatalError}</p>
        <button
          className="button button-primary"
          type="button"
          onClick={() => window.location.reload()}
        >
          Try again
        </button>
      </main>
    );
  }

  if (user === undefined) {
    return (
      <>
        <LoginView
          onLogin={async (token) => {
            setLoginError(undefined);
            try {
              const response = await api.login(token);
              setUser(response.user);
              await hydrateWorkspace();
              if (localStorage.getItem('flow_setup_complete') !== '1') {
                setSetupOpen(true);
              }
            } catch (error) {
              setLoginError(errorMessage(error));
            }
          }}
          onOpenSetup={() => setSetupOpen(true)}
          {...(loginError === undefined ? {} : { error: loginError })}
        />
        <SetupDialog
          open={setupOpen}
          onClose={() => setSetupOpen(false)}
          onComplete={() => undefined}
        />
      </>
    );
  }

  const heroMode = view === 'chat' && messages.length === 0;

  return (
    <div className={`app-shell ${heroMode ? 'app-shell-hero' : ''}`}>
      <Sidebar
        user={user}
        conversations={conversations}
        bookings={bookings}
        view={view}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNewConversation={() => void createConversation()}
        onSelectConversation={(id) => void selectConversation(id)}
        onSelectBooking={(id) => void selectBooking(id)}
        onChangeView={(nextView) => {
          setView(nextView);
          setSidebarOpen(false);
          if (nextView === 'providers') void refreshProviders();
        }}
        onCreateBooking={() => setCreateOpen(true)}
        onOpenSetup={() => setSetupOpen(true)}
        onLogout={() => {
          void api.logout().finally(() => window.location.reload());
        }}
        {...(selectedConversationId === undefined ? {} : { selectedConversationId })}
        {...(selectedBookingId === undefined ? {} : { selectedBookingId })}
      />

      <div className="app-main">
        <TopBar
          eyebrow={topbar.eyebrow}
          title={topbar.title}
          glass={heroMode}
          onMenu={() => setSidebarOpen(true)}
          onSetup={() => setSetupOpen(true)}
          onServices={() => {
            setView('bookings');
            setSidebarOpen(false);
          }}
          onAccounts={() => {
            setView('accounts');
            setSidebarOpen(false);
          }}
          {...(topbar.action === undefined
            ? {}
            : { actionLabel: topbar.action, onAction: () => setCreateOpen(true) })}
        />
        <div className="view-frame">
          {view === 'chat' ? (
            <ChatView
              messages={messages}
              sending={sending}
              modelConfigured={meta?.modelConfigured ?? false}
              onSend={sendMessage}
              onOpenSetup={() => setSetupOpen(true)}
            />
          ) : null}
          {view === 'bookings' ? (
            <BookingsView
              bookings={bookings}
              selectedBookingId={selectedBookingId}
              detail={bookingDetail}
              loadingDetail={loadingDetail}
              busy={bookingBusy}
              onSelect={(id) => void selectBooking(id)}
              onCreate={() => setCreateOpen(true)}
              onSearch={() => withSelectedBooking((id) => api.searchBooking(id))}
              onSelectOffer={(offerId) => withSelectedBooking((id) => api.selectOffer(id, offerId))}
              onApprove={(input) => withSelectedBooking((id) => api.approveBooking(id, input))}
              onCancel={() => withSelectedBooking((id) => api.cancelBooking(id))}
            />
          ) : null}
          {view === 'providers' ? (
            <ProvidersView
              providers={providers}
              loading={providersLoading}
              onRefresh={refreshProviders}
            />
          ) : null}
          {view === 'accounts' ? <AccountsView onOpenSetup={() => setSetupOpen(true)} /> : null}
        </div>
      </div>

      <CreateBookingDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={createBooking}
      />

      <SetupDialog
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        onComplete={() => {
          setToast({ tone: 'success', message: 'Setup complete. You’re ready to book.' });
          void createConversation();
        }}
      />

      {toast === undefined ? null : (
        <div className={`toast toast-${toast.tone}`} role="status">
          {toast.tone === 'success' ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}
          <span>{toast.message}</span>
          <button type="button" onClick={() => setToast(undefined)} aria-label="Dismiss">
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
