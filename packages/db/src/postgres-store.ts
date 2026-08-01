import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  ApprovalSchema,
  AuditEventSchema,
  BookingCheckoutSchema,
  BookingSchema,
  ConversationSchema,
  JobSchema,
  MessageSchema,
  OfferSchema,
  UserSchema,
  type Approval,
  type AuditEvent,
  type Booking,
  type BookingCheckout,
  type BookingStatus,
  type CheckoutResult,
  type Conversation,
  type CreateApprovalInput,
  type CreateBookingInput,
  type FlowJob,
  type Message,
  type Offer,
  type User,
} from '@flow/contracts';
import { assertBookingTransition } from '@flow/core';
import type postgres from 'postgres';
import type { Database } from './database.js';
import type {
  AppendMessageResult,
  CreateAuditEventInput,
  CreateMessageInput,
  CreateProviderAttemptInput,
  EnqueueJobInput,
  FinishProviderAttemptInput,
  FlowStore,
} from './store.js';

const developmentUserId = '00000000-0000-4000-8000-000000000001';
const NewUserSchema = UserSchema.pick({ email: true, displayName: true, timezone: true });

type JsonObject = Record<string, unknown>;
type RawRow = Record<string, unknown>;

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return new Date(value).toISOString();
  throw new Error('Database timestamp has an unsupported representation');
}

function optionalIso(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : toIso(value);
}

function jsonObject(value: unknown): JsonObject {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as JsonObject;
  }
  return {};
}

function serializableJson(value: unknown): postgres.JSONValue {
  return JSON.parse(JSON.stringify(value)) as postgres.JSONValue;
}

function parseUser(row: RawRow): User {
  return UserSchema.parse({
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    timezone: row.timezone,
    createdAt: toIso(row.created_at),
  });
}

function parseConversation(row: RawRow): Conversation {
  return ConversationSchema.parse({
    id: row.id,
    userId: row.user_id,
    title: row.title,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  });
}

function parseMessage(row: RawRow): Message {
  const candidate: Record<string, unknown> = {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    metadata: jsonObject(row.metadata),
    createdAt: toIso(row.created_at),
  };
  if (typeof row.tool_name === 'string') candidate.toolName = row.tool_name;
  if (typeof row.tool_call_id === 'string') candidate.toolCallId = row.tool_call_id;
  return MessageSchema.parse(candidate);
}

function parseBooking(row: RawRow): Booking {
  const candidate: Record<string, unknown> = {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    intent: row.intent,
    automation: row.automation,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
  if (typeof row.selected_offer_id === 'string') candidate.selectedOfferId = row.selected_offer_id;
  if (typeof row.failure_code === 'string') candidate.failureCode = row.failure_code;
  if (typeof row.failure_message === 'string') candidate.failureMessage = row.failure_message;
  return BookingSchema.parse(candidate);
}

function parseBookingCheckout(row: RawRow): BookingCheckout {
  const candidate: Record<string, unknown> = {
    bookingId: row.booking_id,
    status: row.status,
    providerId: row.provider_id,
    seats: Array.isArray(row.seats) ? row.seats : [],
    updatedAt: toIso(row.updated_at),
  };
  if (typeof row.external_reference === 'string') {
    candidate.externalReference = row.external_reference;
  }
  if (row.final_price !== null && row.final_price !== undefined) {
    candidate.finalPrice = row.final_price;
  }
  if (typeof row.next_action === 'string') candidate.nextAction = row.next_action;
  if (typeof row.handoff_url === 'string') candidate.handoffUrl = row.handoff_url;
  if (typeof row.receipt_url === 'string') candidate.receiptUrl = row.receipt_url;
  return BookingCheckoutSchema.parse(candidate);
}

function parseOffer(row: RawRow): Offer {
  const candidate: Record<string, unknown> = {
    id: row.id,
    bookingId: row.booking_id,
    providerId: row.provider_id,
    providerName: row.provider_name,
    externalId: row.external_id,
    title: row.title,
    subtitle: row.subtitle,
    basePrice: row.base_price,
    fees: row.fees,
    taxes: row.taxes,
    savings: row.savings,
    finalPrice: row.final_price,
    attributes: jsonObject(row.attributes),
    deals: Array.isArray(row.deals) ? row.deals : [],
    score: row.score,
    scoreBreakdown: jsonObject(row.score_breakdown),
    fetchedAt: toIso(row.fetched_at),
  };
  if (typeof row.url === 'string') candidate.url = row.url;
  const startAt = optionalIso(row.start_at);
  const endAt = optionalIso(row.end_at);
  const expiresAt = optionalIso(row.expires_at);
  if (startAt !== undefined) candidate.startAt = startAt;
  if (endAt !== undefined) candidate.endAt = endAt;
  if (expiresAt !== undefined) candidate.expiresAt = expiresAt;
  if (typeof row.refundable === 'boolean') candidate.refundable = row.refundable;
  if (typeof row.availability === 'number') candidate.availability = row.availability;
  return OfferSchema.parse(candidate);
}

function parseApproval(row: RawRow): Approval {
  const candidate: Record<string, unknown> = {
    id: row.id,
    bookingId: row.booking_id,
    userId: row.user_id,
    offerId: row.offer_id,
    providerId: row.provider_id,
    status: row.status,
    maxCharge: row.max_charge,
    offerFingerprint: row.offer_fingerprint,
    validUntil: toIso(row.valid_until),
    allowLowerPricedEquivalent: row.allow_lower_priced_equivalent,
    confirmationText: row.confirmation_text,
    approvedAt: toIso(row.approved_at),
  };
  const executeNotBefore = optionalIso(row.execute_not_before);
  const executeNotAfter = optionalIso(row.execute_not_after);
  const consumedAt = optionalIso(row.consumed_at);
  if (executeNotBefore !== undefined) candidate.executeNotBefore = executeNotBefore;
  if (executeNotAfter !== undefined) candidate.executeNotAfter = executeNotAfter;
  if (consumedAt !== undefined) candidate.consumedAt = consumedAt;
  return ApprovalSchema.parse(candidate);
}

function parseJob(row: RawRow): FlowJob {
  const candidate: Record<string, unknown> = {
    id: row.id,
    kind: row.kind,
    bookingId: row.booking_id,
    userId: row.user_id,
    status: row.status,
    runAt: toIso(row.run_at),
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    payload: jsonObject(row.payload),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
  const leaseUntil = optionalIso(row.lease_until);
  if (typeof row.lease_owner === 'string') candidate.leaseOwner = row.lease_owner;
  if (leaseUntil !== undefined) candidate.leaseUntil = leaseUntil;
  if (typeof row.last_error === 'string') candidate.lastError = row.last_error;
  return JobSchema.parse(candidate);
}

function parseAuditEvent(row: RawRow): AuditEvent {
  const candidate: Record<string, unknown> = {
    id: row.id,
    userId: row.user_id,
    actorType: row.actor_type,
    actorId: row.actor_id,
    action: row.action,
    outcome: row.outcome,
    metadata: jsonObject(row.metadata),
    createdAt: toIso(row.created_at),
  };
  if (typeof row.booking_id === 'string') candidate.bookingId = row.booking_id;
  return AuditEventSchema.parse(candidate);
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function opaqueToken(prefix: string): string {
  return `${prefix}_${randomBytes(32).toString('base64url')}`;
}

export class PostgresFlowStore implements FlowStore {
  readonly #database: Database;

  constructor(database: Database) {
    this.#database = database;
  }

  async ensureDevelopmentUser(): Promise<User> {
    const rows = await this.#database<RawRow[]>`
      INSERT INTO users (id, email, display_name, timezone)
      VALUES (${developmentUserId}, 'dev@flow.local', 'Flow developer', 'UTC')
      ON CONFLICT (id) DO UPDATE SET updated_at = users.updated_at
      RETURNING *
    `;
    return parseUser(rows[0] ?? {});
  }

  async getUser(userId: string): Promise<User | undefined> {
    const rows = await this.#database<RawRow[]>`SELECT * FROM users WHERE id = ${userId}`;
    return rows[0] === undefined ? undefined : parseUser(rows[0]);
  }

  async createUser(input: { email: string; displayName: string; timezone: string }): Promise<User> {
    const validated = NewUserSchema.parse(input);
    const id = randomUUID();
    const rows = await this.#database<RawRow[]>`
      INSERT INTO users (id, email, display_name, timezone)
      VALUES (
        ${id}, ${validated.email.toLowerCase()}, ${validated.displayName}, ${validated.timezone}
      )
      RETURNING *
    `;
    return parseUser(rows[0] ?? {});
  }

  async createApiToken(input: {
    userId: string;
    name: string;
    expiresAt?: string;
  }): Promise<{ id: string; token: string; prefix: string }> {
    const id = randomUUID();
    const token = opaqueToken('flow_pat');
    const prefix = token.slice(0, 18);
    await this.#database`
      INSERT INTO api_tokens (id, user_id, name, token_prefix, token_hash, expires_at)
      VALUES (
        ${id}, ${input.userId}, ${input.name}, ${prefix}, ${hashToken(token)},
        ${input.expiresAt ?? null}
      )
    `;
    return { id, token, prefix };
  }

  async authenticateApiToken(token: string): Promise<User | undefined> {
    const rows = await this.#database<RawRow[]>`
      UPDATE api_tokens AS token
      SET last_used_at = now()
      FROM users AS account
      WHERE token.token_hash = ${hashToken(token)}
        AND token.user_id = account.id
        AND token.revoked_at IS NULL
        AND (token.expires_at IS NULL OR token.expires_at > now())
      RETURNING account.*
    `;
    return rows[0] === undefined ? undefined : parseUser(rows[0]);
  }

  async createSession(
    userId: string,
    ttlHours: number,
  ): Promise<{ token: string; expiresAt: string }> {
    const token = opaqueToken('flow_session');
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1_000).toISOString();
    await this.#database`
      INSERT INTO sessions (id, user_id, token_hash, expires_at)
      VALUES (${randomUUID()}, ${userId}, ${hashToken(token)}, ${expiresAt})
    `;
    return { token, expiresAt };
  }

  async authenticateSession(token: string): Promise<User | undefined> {
    const rows = await this.#database<RawRow[]>`
      SELECT account.*
      FROM sessions AS session
      JOIN users AS account ON account.id = session.user_id
      WHERE session.token_hash = ${hashToken(token)}
        AND session.revoked_at IS NULL
        AND session.expires_at > now()
    `;
    return rows[0] === undefined ? undefined : parseUser(rows[0]);
  }

  async revokeSession(token: string): Promise<void> {
    await this.#database`
      UPDATE sessions SET revoked_at = now() WHERE token_hash = ${hashToken(token)}
    `;
  }

  async createConversation(userId: string, title: string): Promise<Conversation> {
    const rows = await this.#database<RawRow[]>`
      INSERT INTO conversations (id, user_id, title)
      VALUES (${randomUUID()}, ${userId}, ${title})
      RETURNING *
    `;
    return parseConversation(rows[0] ?? {});
  }

  async listConversations(userId: string, limit = 100): Promise<Conversation[]> {
    const rows = await this.#database<RawRow[]>`
      SELECT * FROM conversations
      WHERE user_id = ${userId}
      ORDER BY updated_at DESC
      LIMIT ${limit}
    `;
    return rows.map(parseConversation);
  }

  async getConversation(userId: string, conversationId: string): Promise<Conversation | undefined> {
    const rows = await this.#database<RawRow[]>`
      SELECT * FROM conversations WHERE id = ${conversationId} AND user_id = ${userId}
    `;
    return rows[0] === undefined ? undefined : parseConversation(rows[0]);
  }

  async appendMessage(input: CreateMessageInput): Promise<AppendMessageResult> {
    const id = randomUUID();
    const result = await this.#database.begin(async (transaction) => {
      const inserted = await transaction<RawRow[]>`
        INSERT INTO messages (
          id, conversation_id, role, content, tool_name, tool_call_id,
          client_message_id, metadata
        )
        VALUES (
          ${id}, ${input.conversationId}, ${input.role}, ${input.content},
          ${input.toolName ?? null}, ${input.toolCallId ?? null},
          ${input.clientMessageId ?? null}, ${transaction.json(serializableJson(input.metadata ?? {}))}
        )
        ON CONFLICT DO NOTHING
        RETURNING *
      `;
      await transaction`
        UPDATE conversations SET updated_at = now() WHERE id = ${input.conversationId}
      `;
      if (inserted[0] !== undefined) return { rows: inserted, created: true };
      if (input.clientMessageId === undefined) {
        throw new Error('Message insertion failed');
      }
      const existing = await transaction<RawRow[]>`
        SELECT * FROM messages
        WHERE conversation_id = ${input.conversationId}
          AND client_message_id = ${input.clientMessageId}
      `;
      return { rows: existing, created: false };
    });
    return { message: parseMessage(result.rows[0] ?? {}), created: result.created };
  }

  async listMessages(userId: string, conversationId: string, limit = 100): Promise<Message[]> {
    const rows = await this.#database<RawRow[]>`
      SELECT message.*
      FROM messages AS message
      JOIN conversations AS conversation ON conversation.id = message.conversation_id
      WHERE message.conversation_id = ${conversationId}
        AND conversation.user_id = ${userId}
      ORDER BY message.created_at DESC
      LIMIT ${limit}
    `;
    return rows.reverse().map(parseMessage);
  }

  async createBooking(
    userId: string,
    input: CreateBookingInput,
    conversationId?: string,
  ): Promise<Booking> {
    const status: BookingStatus =
      Date.parse(input.automation.researchAt) > Date.now() ? 'scheduled' : 'draft';
    const rows = await this.#database<RawRow[]>`
      INSERT INTO bookings (
        id, user_id, conversation_id, status, intent, automation
      )
      VALUES (
        ${randomUUID()}, ${userId}, ${conversationId ?? null}, ${status},
        ${this.#database.json(serializableJson(input.intent))},
        ${this.#database.json(serializableJson(input.automation))}
      )
      RETURNING *
    `;
    return parseBooking(rows[0] ?? {});
  }

  async listBookings(userId: string, limit = 100): Promise<Booking[]> {
    const rows = await this.#database<RawRow[]>`
      SELECT * FROM bookings
      WHERE user_id = ${userId}
      ORDER BY updated_at DESC
      LIMIT ${limit}
    `;
    return rows.map(parseBooking);
  }

  async getBooking(userId: string, bookingId: string): Promise<Booking | undefined> {
    const rows = await this.#database<RawRow[]>`
      SELECT * FROM bookings WHERE id = ${bookingId} AND user_id = ${userId}
    `;
    return rows[0] === undefined ? undefined : parseBooking(rows[0]);
  }

  async updateBooking(
    userId: string,
    bookingId: string,
    input: Partial<Pick<Booking, 'intent' | 'automation'>>,
  ): Promise<Booking> {
    const row = await this.#database.begin(async (transaction) => {
      const currentRows = await transaction<RawRow[]>`
        SELECT * FROM bookings
        WHERE id = ${bookingId} AND user_id = ${userId}
        FOR UPDATE
      `;
      const current = currentRows[0];
      if (current === undefined) throw new Error('Booking not found');
      assertBookingTransition(current.status as BookingStatus, 'searching');
      const intent = input.intent ?? current.intent;
      const automation = input.automation ?? current.automation;
      const updated = await transaction<RawRow[]>`
        UPDATE bookings SET
          intent = ${transaction.json(serializableJson(intent))},
          automation = ${transaction.json(serializableJson(automation))},
          selected_offer_id = NULL,
          status = 'searching',
          failure_code = NULL,
          failure_message = NULL,
          version = version + 1,
          updated_at = now()
        WHERE id = ${bookingId} AND user_id = ${userId}
        RETURNING *
      `;
      return updated[0];
    });
    if (row === undefined) throw new Error('Booking update failed');
    return parseBooking(row);
  }

  async transitionBooking(
    userId: string,
    bookingId: string,
    status: BookingStatus,
    failure?: { code: string; message: string },
  ): Promise<Booking> {
    const row = await this.#database.begin(async (transaction) => {
      const currentRows = await transaction<RawRow[]>`
        SELECT * FROM bookings
        WHERE id = ${bookingId} AND user_id = ${userId}
        FOR UPDATE
      `;
      const current = currentRows[0];
      if (current === undefined) throw new Error('Booking not found');
      assertBookingTransition(current.status as BookingStatus, status);
      const updated = await transaction<RawRow[]>`
        UPDATE bookings SET
          status = ${status},
          failure_code = ${failure?.code ?? null},
          failure_message = ${failure?.message ?? null},
          version = version + 1,
          updated_at = now()
        WHERE id = ${bookingId} AND user_id = ${userId}
        RETURNING *
      `;
      return updated[0];
    });
    if (row === undefined) throw new Error('Booking transition failed');
    return parseBooking(row);
  }

  async selectOffer(userId: string, bookingId: string, offerId: string): Promise<Booking> {
    const row = await this.#database.begin(async (transaction) => {
      const currentRows = await transaction<RawRow[]>`
        SELECT * FROM bookings
        WHERE id = ${bookingId} AND user_id = ${userId}
        FOR UPDATE
      `;
      const current = currentRows[0];
      if (current === undefined) throw new Error('Booking not found');
      const offerRows = await transaction`
        SELECT id FROM offers WHERE id = ${offerId} AND booking_id = ${bookingId}
      `;
      if (offerRows[0] === undefined) throw new Error('Offer not found');
      const currentStatus = current.status as BookingStatus;
      const nextStatus = 'awaiting_approval';
      assertBookingTransition(currentStatus, nextStatus);
      const updated = await transaction<RawRow[]>`
        UPDATE bookings SET
          selected_offer_id = ${offerId},
          status = ${nextStatus},
          version = version + 1,
          updated_at = now()
        WHERE id = ${bookingId} AND user_id = ${userId}
        RETURNING *
      `;
      return updated[0];
    });
    if (row === undefined) throw new Error('Booking selection failed');
    return parseBooking(row);
  }

  async replaceOffers(bookingId: string, offers: readonly Offer[]): Promise<Offer[]> {
    return this.#database.begin(async (transaction) => {
      await transaction`SELECT id FROM bookings WHERE id = ${bookingId} FOR UPDATE`;
      await transaction`
        UPDATE offers SET is_current = false, updated_at = now()
        WHERE booking_id = ${bookingId} AND is_current = true
      `;
      const persistedOffers: Offer[] = [];
      for (const offer of offers) {
        if (offer.bookingId !== bookingId) {
          throw new Error(`Offer ${offer.id} does not belong to booking ${bookingId}`);
        }
        const rows = await transaction<RawRow[]>`
          INSERT INTO offers (
            id, booking_id, provider_id, provider_name, external_id, title, subtitle, url,
            start_at, end_at, base_price, fees, taxes, savings, final_price, refundable,
            availability, attributes, deals, score, score_breakdown, fetched_at, expires_at,
            is_current
          ) VALUES (
            ${offer.id}, ${bookingId}, ${offer.providerId}, ${offer.providerName},
            ${offer.externalId}, ${offer.title}, ${offer.subtitle}, ${offer.url ?? null},
            ${offer.startAt ?? null}, ${offer.endAt ?? null},
            ${transaction.json(serializableJson(offer.basePrice))},
            ${transaction.json(serializableJson(offer.fees))},
            ${transaction.json(serializableJson(offer.taxes))},
            ${transaction.json(serializableJson(offer.savings))},
            ${transaction.json(serializableJson(offer.finalPrice))},
            ${offer.refundable ?? null}, ${offer.availability ?? null},
            ${transaction.json(serializableJson(offer.attributes))},
            ${transaction.json(serializableJson(offer.deals))}, ${offer.score},
            ${transaction.json(serializableJson(offer.scoreBreakdown))}, ${offer.fetchedAt},
            ${offer.expiresAt ?? null}, true
          )
          ON CONFLICT (booking_id, provider_id, external_id) DO UPDATE SET
            title = EXCLUDED.title,
            subtitle = EXCLUDED.subtitle,
            url = EXCLUDED.url,
            start_at = EXCLUDED.start_at,
            end_at = EXCLUDED.end_at,
            base_price = EXCLUDED.base_price,
            fees = EXCLUDED.fees,
            taxes = EXCLUDED.taxes,
            savings = EXCLUDED.savings,
            final_price = EXCLUDED.final_price,
            refundable = EXCLUDED.refundable,
            availability = EXCLUDED.availability,
            attributes = EXCLUDED.attributes,
            deals = EXCLUDED.deals,
            score = EXCLUDED.score,
            score_breakdown = EXCLUDED.score_breakdown,
            fetched_at = EXCLUDED.fetched_at,
            expires_at = EXCLUDED.expires_at,
            is_current = true,
            updated_at = now()
          RETURNING *
        `;
        persistedOffers.push(parseOffer(rows[0] ?? {}));
      }

      await transaction`
        DELETE FROM offers AS offer
        WHERE offer.booking_id = ${bookingId}
          AND offer.is_current = false
          AND NOT EXISTS (
            SELECT 1 FROM approvals AS approval WHERE approval.offer_id = offer.id
          )
      `;
      return persistedOffers;
    });
  }

  async listOffers(userId: string, bookingId: string): Promise<Offer[]> {
    const rows = await this.#database<RawRow[]>`
      SELECT offer.*
      FROM offers AS offer
      JOIN bookings AS booking ON booking.id = offer.booking_id
      WHERE offer.booking_id = ${bookingId}
        AND booking.user_id = ${userId}
        AND offer.is_current = true
      ORDER BY offer.score DESC, (offer.final_price->>'amountMinor')::bigint ASC
    `;
    return rows.map(parseOffer);
  }

  async getOffer(userId: string, bookingId: string, offerId: string): Promise<Offer | undefined> {
    const rows = await this.#database<RawRow[]>`
      SELECT offer.*
      FROM offers AS offer
      JOIN bookings AS booking ON booking.id = offer.booking_id
      WHERE offer.id = ${offerId}
        AND offer.booking_id = ${bookingId}
        AND booking.user_id = ${userId}
    `;
    return rows[0] === undefined ? undefined : parseOffer(rows[0]);
  }

  async saveBookingCheckout(bookingId: string, checkout: CheckoutResult): Promise<BookingCheckout> {
    const rows = await this.#database<RawRow[]>`
      INSERT INTO booking_checkouts (
        booking_id, provider_id, status, external_reference, final_price, seats,
        next_action, handoff_url, receipt_url
      ) VALUES (
        ${bookingId}, ${checkout.providerId}, ${checkout.status},
        ${checkout.externalReference ?? null},
        ${
          checkout.finalPrice === undefined
            ? null
            : this.#database.json(serializableJson(checkout.finalPrice))
        },
        ${this.#database.json(serializableJson(checkout.seats ?? []))},
        ${checkout.nextAction ?? null}, ${checkout.handoffUrl ?? null},
        ${checkout.receiptUrl ?? null}
      )
      ON CONFLICT (booking_id) DO UPDATE SET
        provider_id = EXCLUDED.provider_id,
        status = EXCLUDED.status,
        external_reference = EXCLUDED.external_reference,
        final_price = EXCLUDED.final_price,
        seats = EXCLUDED.seats,
        next_action = EXCLUDED.next_action,
        handoff_url = EXCLUDED.handoff_url,
        receipt_url = EXCLUDED.receipt_url,
        updated_at = now()
      RETURNING *
    `;
    return parseBookingCheckout(rows[0] ?? {});
  }

  async getBookingCheckout(
    userId: string,
    bookingId: string,
  ): Promise<BookingCheckout | undefined> {
    const rows = await this.#database<RawRow[]>`
      SELECT checkout.*
      FROM booking_checkouts AS checkout
      JOIN bookings AS booking ON booking.id = checkout.booking_id
      WHERE checkout.booking_id = ${bookingId} AND booking.user_id = ${userId}
    `;
    return rows[0] === undefined ? undefined : parseBookingCheckout(rows[0]);
  }

  async createApproval(
    userId: string,
    bookingId: string,
    input: CreateApprovalInput,
    offer: Offer,
    offerFingerprint: string,
  ): Promise<Approval> {
    const row = await this.#database.begin(async (transaction) => {
      const bookingRows = await transaction<RawRow[]>`
        SELECT * FROM bookings
        WHERE id = ${bookingId} AND user_id = ${userId}
        FOR UPDATE
      `;
      const booking = bookingRows[0];
      if (booking === undefined) throw new Error('Booking not found');
      const currentStatus = booking.status as BookingStatus;
      assertBookingTransition(currentStatus, 'approved');
      await transaction`
        UPDATE approvals SET status = 'revoked', revoked_at = now()
        WHERE booking_id = ${bookingId} AND status = 'active'
      `;
      const inserted = await transaction<RawRow[]>`
        INSERT INTO approvals (
          id, booking_id, user_id, offer_id, provider_id, status, max_charge,
          offer_fingerprint, valid_until, execute_not_before, execute_not_after,
          allow_lower_priced_equivalent, confirmation_text
        ) VALUES (
          ${randomUUID()}, ${bookingId}, ${userId}, ${offer.id}, ${offer.providerId},
          'active', ${transaction.json(serializableJson(input.maxCharge))}, ${offerFingerprint},
          ${input.validUntil}, ${input.executeNotBefore ?? null},
          ${input.executeNotAfter ?? null}, ${input.allowLowerPricedEquivalent},
          ${input.confirmationText}
        )
        RETURNING *
      `;
      await transaction`
        UPDATE bookings SET
          selected_offer_id = ${offer.id},
          status = 'approved',
          version = version + 1,
          updated_at = now()
        WHERE id = ${bookingId}
      `;
      return inserted[0];
    });
    if (row === undefined) throw new Error('Approval creation failed');
    return parseApproval(row);
  }

  async getActiveApproval(userId: string, bookingId: string): Promise<Approval | undefined> {
    await this.#database`
      UPDATE approvals SET status = 'expired'
      WHERE booking_id = ${bookingId} AND status = 'active' AND valid_until <= now()
    `;
    const rows = await this.#database<RawRow[]>`
      SELECT * FROM approvals
      WHERE booking_id = ${bookingId} AND user_id = ${userId} AND status = 'active'
      ORDER BY approved_at DESC
      LIMIT 1
    `;
    return rows[0] === undefined ? undefined : parseApproval(rows[0]);
  }

  async consumeApproval(approvalId: string): Promise<void> {
    await this.#database`
      UPDATE approvals SET status = 'consumed', consumed_at = now()
      WHERE id = ${approvalId} AND status = 'active'
    `;
  }

  async revokeApproval(userId: string, bookingId: string): Promise<void> {
    await this.#database`
      UPDATE approvals SET status = 'revoked', revoked_at = now()
      WHERE booking_id = ${bookingId} AND user_id = ${userId} AND status = 'active'
    `;
  }

  async enqueueJob(input: EnqueueJobInput): Promise<FlowJob> {
    const id = randomUUID();
    const rows = await this.#database<RawRow[]>`
      INSERT INTO jobs (
        id, kind, booking_id, user_id, status, run_at, max_attempts, payload,
        idempotency_key
      ) VALUES (
        ${id}, ${input.kind}, ${input.bookingId}, ${input.userId}, 'queued',
        ${input.runAt}, ${input.maxAttempts ?? 5},
        ${this.#database.json(serializableJson(input.payload ?? {}))},
        ${input.idempotencyKey ?? null}
      )
      ON CONFLICT DO NOTHING
      RETURNING *
    `;
    if (rows[0] !== undefined) return parseJob(rows[0]);
    if (input.idempotencyKey === undefined) throw new Error('Job insertion failed');
    const existing = await this.#database<RawRow[]>`
      SELECT * FROM jobs WHERE idempotency_key = ${input.idempotencyKey}
    `;
    return parseJob(existing[0] ?? {});
  }

  async claimJobs(workerId: string, limit: number, leaseSeconds: number): Promise<FlowJob[]> {
    const rows = await this.#database<RawRow[]>`
      WITH candidates AS (
        SELECT id
        FROM jobs
        WHERE (
          (status = 'queued' AND run_at <= now())
          OR (status = 'leased' AND lease_until < now())
        )
        ORDER BY run_at ASC, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      )
      UPDATE jobs AS job SET
        status = 'leased',
        lease_owner = ${workerId},
        lease_until = now() + (${leaseSeconds} * interval '1 second'),
        attempts = job.attempts + 1,
        updated_at = now()
      FROM candidates
      WHERE job.id = candidates.id
      RETURNING job.*
    `;
    return rows.map(parseJob);
  }

  async completeJob(jobId: string, workerId: string): Promise<boolean> {
    const rows = await this.#database<{ id: string }[]>`
      UPDATE jobs SET
        status = 'succeeded', lease_owner = NULL, lease_until = NULL, updated_at = now()
      WHERE id = ${jobId} AND status = 'leased' AND lease_owner = ${workerId}
      RETURNING id
    `;
    return rows.length === 1;
  }

  async extendJobLease(jobId: string, workerId: string, leaseSeconds: number): Promise<boolean> {
    const rows = await this.#database<{ id: string }[]>`
      UPDATE jobs SET
        lease_until = now() + (${leaseSeconds} * interval '1 second'),
        updated_at = now()
      WHERE id = ${jobId} AND status = 'leased' AND lease_owner = ${workerId}
      RETURNING id
    `;
    return rows.length === 1;
  }

  async failJob(
    jobId: string,
    workerId: string,
    error: string,
    retryAt?: string,
  ): Promise<boolean> {
    return this.#database.begin(async (transaction) => {
      const rows = await transaction<RawRow[]>`
        SELECT * FROM jobs
        WHERE id = ${jobId} AND status = 'leased' AND lease_owner = ${workerId}
        FOR UPDATE
      `;
      const row = rows[0];
      if (row === undefined) return false;
      const attempts = Number(row.attempts);
      const maxAttempts = Number(row.max_attempts);
      if (attempts >= maxAttempts) {
        await transaction`
          UPDATE jobs SET
            status = 'failed', last_error = ${error}, lease_owner = NULL,
            lease_until = NULL, updated_at = now()
          WHERE id = ${jobId} AND status = 'leased' AND lease_owner = ${workerId}
        `;
        return true;
      }
      const retryDelaySeconds = Math.min(3_600, 30 * 2 ** Math.max(0, attempts - 1));
      const nextRunAt = retryAt ?? new Date(Date.now() + retryDelaySeconds * 1_000).toISOString();
      await transaction`
        UPDATE jobs SET
          status = 'queued', run_at = ${nextRunAt}, last_error = ${error},
          lease_owner = NULL, lease_until = NULL, updated_at = now()
        WHERE id = ${jobId} AND status = 'leased' AND lease_owner = ${workerId}
      `;
      return true;
    });
  }

  async cancelBookingJobs(bookingId: string): Promise<void> {
    await this.#database`
      UPDATE jobs SET status = 'cancelled', updated_at = now()
      WHERE booking_id = ${bookingId} AND status IN ('queued', 'leased')
    `;
  }

  async startProviderAttempt(input: CreateProviderAttemptInput): Promise<string> {
    const id = randomUUID();
    await this.#database`
      INSERT INTO provider_attempts (
        id, booking_id, job_id, provider_id, operation, status,
        coupon_code_hash, request_summary
      ) VALUES (
        ${id}, ${input.bookingId}, ${input.jobId ?? null}, ${input.providerId},
        ${input.operation}, 'started', ${input.couponCodeHash ?? null},
        ${this.#database.json(serializableJson(input.requestSummary ?? {}))}
      )
    `;
    return id;
  }

  async finishProviderAttempt(attemptId: string, input: FinishProviderAttemptInput): Promise<void> {
    await this.#database`
      UPDATE provider_attempts SET
        status = ${input.status},
        response_summary = ${this.#database.json(serializableJson(input.responseSummary ?? {}))},
        error_code = ${input.errorCode ?? null},
        error_message = ${input.errorMessage ?? null},
        finished_at = now()
      WHERE id = ${attemptId} AND status = 'started'
    `;
  }

  async writeAuditEvent(input: CreateAuditEventInput): Promise<AuditEvent> {
    const rows = await this.#database<RawRow[]>`
      INSERT INTO audit_events (
        id, user_id, booking_id, actor_type, actor_id, action, outcome, metadata
      ) VALUES (
        ${randomUUID()}, ${input.userId}, ${input.bookingId ?? null}, ${input.actorType},
        ${input.actorId}, ${input.action}, ${input.outcome},
        ${this.#database.json(serializableJson(input.metadata ?? {}))}
      )
      RETURNING *
    `;
    return parseAuditEvent(rows[0] ?? {});
  }

  async listAuditEvents(userId: string, bookingId?: string, limit = 200): Promise<AuditEvent[]> {
    const rows =
      bookingId === undefined
        ? await this.#database<RawRow[]>`
            SELECT * FROM audit_events
            WHERE user_id = ${userId}
            ORDER BY created_at DESC LIMIT ${limit}
          `
        : await this.#database<RawRow[]>`
            SELECT * FROM audit_events
            WHERE user_id = ${userId} AND booking_id = ${bookingId}
            ORDER BY created_at DESC LIMIT ${limit}
          `;
    return rows.map(parseAuditEvent);
  }
}
