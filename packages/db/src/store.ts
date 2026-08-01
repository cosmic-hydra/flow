import type {
  Approval,
  AuditEvent,
  Booking,
  BookingCheckout,
  BookingStatus,
  CheckoutResult,
  Conversation,
  CreateApprovalInput,
  CreateBookingInput,
  FlowJob,
  JobKind,
  Message,
  MessageRole,
  Offer,
  User,
} from '@flow/contracts';

export interface CreateMessageInput {
  conversationId: string;
  role: MessageRole;
  content: string;
  toolName?: string;
  toolCallId?: string;
  clientMessageId?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateAuditEventInput {
  userId: string;
  bookingId?: string;
  actorType: AuditEvent['actorType'];
  actorId: string;
  action: string;
  outcome: AuditEvent['outcome'];
  metadata?: Record<string, unknown>;
}

export interface AppendMessageResult {
  message: Message;
  created: boolean;
}

export interface CreateProviderAttemptInput {
  bookingId: string;
  jobId?: string;
  providerId: string;
  operation: string;
  couponCodeHash?: string;
  requestSummary?: Record<string, unknown>;
}

export interface FinishProviderAttemptInput {
  status: 'succeeded' | 'failed' | 'denied';
  responseSummary?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
}

export interface EnqueueJobInput {
  kind: JobKind;
  bookingId: string;
  userId: string;
  runAt: string;
  maxAttempts?: number;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface FlowStore {
  ensureDevelopmentUser(): Promise<User>;
  getUser(userId: string): Promise<User | undefined>;
  createUser(input: { email: string; displayName: string; timezone: string }): Promise<User>;
  createApiToken(input: {
    userId: string;
    name: string;
    expiresAt?: string;
  }): Promise<{ id: string; token: string; prefix: string }>;
  authenticateApiToken(token: string): Promise<User | undefined>;
  createSession(userId: string, ttlHours: number): Promise<{ token: string; expiresAt: string }>;
  authenticateSession(token: string): Promise<User | undefined>;
  revokeSession(token: string): Promise<void>;

  createConversation(userId: string, title: string): Promise<Conversation>;
  listConversations(userId: string, limit?: number): Promise<Conversation[]>;
  getConversation(userId: string, conversationId: string): Promise<Conversation | undefined>;
  appendMessage(input: CreateMessageInput): Promise<AppendMessageResult>;
  listMessages(userId: string, conversationId: string, limit?: number): Promise<Message[]>;

  createBooking(
    userId: string,
    input: CreateBookingInput,
    conversationId?: string,
  ): Promise<Booking>;
  listBookings(userId: string, limit?: number): Promise<Booking[]>;
  getBooking(userId: string, bookingId: string): Promise<Booking | undefined>;
  updateBooking(
    userId: string,
    bookingId: string,
    input: Partial<Pick<Booking, 'intent' | 'automation'>>,
  ): Promise<Booking>;
  transitionBooking(
    userId: string,
    bookingId: string,
    status: BookingStatus,
    failure?: { code: string; message: string },
  ): Promise<Booking>;
  selectOffer(userId: string, bookingId: string, offerId: string): Promise<Booking>;

  replaceOffers(bookingId: string, offers: readonly Offer[]): Promise<Offer[]>;
  listOffers(userId: string, bookingId: string): Promise<Offer[]>;
  getOffer(userId: string, bookingId: string, offerId: string): Promise<Offer | undefined>;

  saveBookingCheckout(bookingId: string, checkout: CheckoutResult): Promise<BookingCheckout>;
  getBookingCheckout(userId: string, bookingId: string): Promise<BookingCheckout | undefined>;

  createApproval(
    userId: string,
    bookingId: string,
    input: CreateApprovalInput,
    offer: Offer,
    offerFingerprint: string,
  ): Promise<Approval>;
  getActiveApproval(userId: string, bookingId: string): Promise<Approval | undefined>;
  consumeApproval(approvalId: string): Promise<void>;
  revokeApproval(userId: string, bookingId: string): Promise<void>;

  enqueueJob(input: EnqueueJobInput): Promise<FlowJob>;
  claimJobs(workerId: string, limit: number, leaseSeconds: number): Promise<FlowJob[]>;
  extendJobLease(jobId: string, workerId: string, leaseSeconds: number): Promise<boolean>;
  completeJob(jobId: string, workerId: string): Promise<boolean>;
  failJob(jobId: string, workerId: string, error: string, retryAt?: string): Promise<boolean>;
  cancelBookingJobs(bookingId: string): Promise<void>;

  startProviderAttempt(input: CreateProviderAttemptInput): Promise<string>;
  finishProviderAttempt(attemptId: string, input: FinishProviderAttemptInput): Promise<void>;

  writeAuditEvent(input: CreateAuditEventInput): Promise<AuditEvent>;
  listAuditEvents(userId: string, bookingId?: string, limit?: number): Promise<AuditEvent[]>;
}
