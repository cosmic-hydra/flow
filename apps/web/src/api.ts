import type {
  Approval,
  AuditEvent,
  Booking,
  BookingCheckout,
  ChatResponse,
  Conversation,
  CreateApprovalInput,
  CreateBookingInput,
  Message,
  Offer,
  User,
} from '@flow/contracts';

const apiBase =
  (import.meta.env.VITE_FLOW_API_URL as string | undefined)?.replace(/\/$/u, '') ?? '';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(input: { status: number; code: string; message: string; details?: unknown }) {
    super(input.message);
    this.name = 'ApiError';
    this.status = input.status;
    this.code = input.code;
    if (input.details !== undefined) this.details = input.details;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set('content-type', 'application/json');
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });
  const payload = (await response.json().catch(() => undefined)) as
    { error?: { code?: string; message?: string; details?: unknown } } | undefined;
  if (!response.ok) {
    throw new ApiError({
      status: response.status,
      code: payload?.error?.code ?? 'request_failed',
      message: payload?.error?.message ?? `Request failed with HTTP ${response.status}`,
      ...(payload?.error?.details === undefined ? {} : { details: payload.error.details }),
    });
  }
  return payload as T;
}

export interface BookingDetail {
  booking: Booking;
  offers: Offer[];
  approval?: Approval;
  checkout?: BookingCheckout;
  audit: AuditEvent[];
}

export interface ProviderSummary {
  id: string;
  name: string;
  capability: {
    categories: string[];
    search: boolean;
    checkout: boolean;
    couponApplication: boolean;
    scheduling: boolean;
  };
  health: { available: boolean; message: string };
}

export interface SetupStatus {
  ok: boolean;
  os: 'macos' | 'windows' | 'linux' | 'unknown';
  commands: Record<string, string>;
  runtime: { node: string; platform: string; ready: boolean };
  webcmd: {
    enabled: boolean;
    path: string;
    profile: string;
    available: boolean;
    version: string | null;
    doctorOk: boolean;
    message: string;
    adapterCount: number | null;
  };
  accounts: {
    mode: string;
    count: number;
    items: ConnectedAccount[];
  };
  composioConfigured: boolean;
  mcp: {
    server: string;
    tools: string[];
    hint: string;
    snippet: string;
  };
}

export interface ConnectedAccount {
  id: string;
  toolkit: string;
  label: string;
  status: string;
  redirectUrl?: string;
}

export interface ToolkitDefinition {
  id: string;
  name: string;
  description: string;
}

export interface WebcmdStatus {
  ok: boolean;
  available: boolean;
  version?: string;
  doctorOk: boolean;
  doctorSummary?: string;
  adapters?: unknown;
  adapterCount?: number;
  message: string;
}

export const api = {
  meta: () =>
    request<{
      name: string;
      version: string;
      authMode: string;
      modelConfigured: boolean;
      composioConfigured: boolean;
      webcmdEnabled: boolean;
    }>('/v1/meta'),
  me: () => request<{ user: User }>('/v1/auth/me'),
  login: (token: string) =>
    request<{ user: User; expiresAt: string }>('/v1/auth/token', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),
  logout: () => request<{ ok: true }>('/v1/auth/logout', { method: 'POST' }),
  conversations: () => request<{ conversations: Conversation[] }>('/v1/conversations'),
  createConversation: (title = 'New booking') =>
    request<{ conversation: Conversation }>('/v1/conversations', {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),
  messages: (conversationId: string) =>
    request<{ messages: Message[] }>(`/v1/conversations/${conversationId}/messages`),
  sendMessage: (conversationId: string, content: string, clientMessageId: string) =>
    request<ChatResponse>(`/v1/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, clientMessageId }),
    }),
  bookings: () => request<{ bookings: Booking[] }>('/v1/bookings'),
  booking: (bookingId: string) => request<BookingDetail>(`/v1/bookings/${bookingId}`),
  createBooking: (input: CreateBookingInput) =>
    request<{ booking: Booking }>('/v1/bookings', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  searchBooking: (bookingId: string) =>
    request<{ booking: Booking; offers: Offer[] }>(`/v1/bookings/${bookingId}/search`, {
      method: 'POST',
    }),
  selectOffer: (bookingId: string, offerId: string) =>
    request<{ booking: Booking }>(`/v1/bookings/${bookingId}/offers/${offerId}/select`, {
      method: 'POST',
    }),
  approveBooking: (bookingId: string, input: CreateApprovalInput) =>
    request<{ booking: Booking; approval: Approval }>(`/v1/bookings/${bookingId}/approve`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  cancelBooking: (bookingId: string) =>
    request<{ booking: Booking }>(`/v1/bookings/${bookingId}/cancel`, { method: 'POST' }),
  providers: () => request<{ providers: ProviderSummary[] }>('/v1/providers'),
  setupStatus: () => request<SetupStatus>('/v1/setup/status'),
  accounts: () =>
    request<{
      ok: boolean;
      toolkits: ToolkitDefinition[];
      accounts: ConnectedAccount[];
      mode: string;
    }>('/v1/accounts'),
  connectAccount: (toolkit: string, action: 'connect' | 'demo-link' = 'connect') =>
    request<{
      ok: boolean;
      mode: string;
      account: ConnectedAccount;
      message: string;
    }>('/v1/accounts', {
      method: 'POST',
      body: JSON.stringify({ toolkit, action }),
    }),
  webcmdStatus: (action?: string) =>
    request<WebcmdStatus>(`/v1/webcmd${action === undefined ? '' : `?action=${action}`}`),
  webcmdRun: (args: string[]) =>
    request<{
      ok: boolean;
      result: { ok: boolean; exitCode: number; stdout: string; stderr: string };
      parsed: unknown;
    }>('/v1/webcmd/run', {
      method: 'POST',
      body: JSON.stringify({ args }),
    }),
};
