import type {
  Approval,
  Booking,
  CouponCandidate,
  CreateApprovalInput,
  CreateBookingInput,
  DealEvidence,
  Offer,
} from '@flow/contracts';
import { CheckoutResultSchema, type CheckoutResult } from '@flow/contracts';
import {
  assertApprovalAllowsOffer,
  compareMoney,
  DomainError,
  fingerprintOffer,
  isTerminalBookingStatus,
  rankCouponCandidates,
  rankOffers,
} from '@flow/core';
import type { FlowStore } from '@flow/db';
import type { ProviderDiagnostic, ProviderRegistry } from '@flow/providers';
import type { RuntimeLogger } from './logger.js';
import { silentLogger } from './logger.js';

export interface ResearchOutcome {
  booking: Booking;
  offers: Offer[];
  diagnostics: ProviderDiagnostic[];
  deferredRuns: Array<{
    providerId: string;
    externalReference: string;
    status: 'queued' | 'running';
    message: string;
  }>;
}

export interface CouponResearcher {
  discover(booking: Booking, offers: readonly Offer[]): Promise<CouponCandidate[]>;
}

function publicCouponsFromOffer(offer: Offer): CouponCandidate[] {
  return offer.deals.flatMap((deal) => {
    if (deal.kind !== 'coupon' || deal.code === undefined) return [];
    const candidate: CouponCandidate = {
      code: deal.code,
      providerId: offer.providerId,
      description: deal.title,
      confidence: deal.confidence,
      publicCode: true,
    };
    if (deal.sourceUrl !== undefined) candidate.sourceUrl = deal.sourceUrl;
    if (deal.savings !== undefined) {
      candidate.expectedSavingsMinor = deal.savings.amountMinor;
      candidate.currency = deal.savings.currency;
    }
    return [candidate];
  });
}

function attachCouponEvidence(
  offers: readonly Offer[],
  candidates: readonly CouponCandidate[],
): Offer[] {
  return offers.map((offer) => {
    const knownCodes = new Set(
      offer.deals
        .filter((deal) => deal.kind === 'coupon' && deal.code !== undefined)
        .map((deal) => deal.code?.trim().toUpperCase()),
    );
    const discovered: DealEvidence[] = candidates
      .filter((candidate) => candidate.providerId === offer.providerId)
      .filter((candidate) => !knownCodes.has(candidate.code.trim().toUpperCase()))
      .slice(0, Math.max(0, 30 - offer.deals.length))
      .map((candidate) => {
        const evidence: DealEvidence = {
          kind: 'coupon',
          title: candidate.description,
          code: candidate.code,
          confidence: candidate.confidence,
        };
        if (candidate.sourceUrl !== undefined) evidence.sourceUrl = candidate.sourceUrl;
        if (
          candidate.expectedSavingsMinor !== undefined &&
          candidate.currency === offer.finalPrice.currency
        ) {
          evidence.savings = {
            amountMinor: candidate.expectedSavingsMinor,
            currency: candidate.currency,
          };
        }
        if (candidate.expiresAt !== undefined) {
          evidence.terms = `Public offer; listed expiry ${candidate.expiresAt}`;
        }
        return evidence;
      });
    return discovered.length === 0 ? offer : { ...offer, deals: [...offer.deals, ...discovered] };
  });
}

export class BookingService {
  readonly #store: FlowStore;
  readonly #providers: ProviderRegistry;
  readonly #maxCouponAttempts: number;
  readonly #logger: RuntimeLogger;
  readonly #couponResearcher?: CouponResearcher;

  constructor(input: {
    store: FlowStore;
    providers: ProviderRegistry;
    maxCouponAttempts: number;
    logger?: RuntimeLogger;
    couponResearcher?: CouponResearcher;
  }) {
    this.#store = input.store;
    this.#providers = input.providers;
    this.#maxCouponAttempts = input.maxCouponAttempts;
    this.#logger = input.logger ?? silentLogger;
    if (input.couponResearcher !== undefined) this.#couponResearcher = input.couponResearcher;
  }

  async createBooking(
    userId: string,
    input: CreateBookingInput,
    conversationId?: string,
  ): Promise<Booking> {
    const booking = await this.#store.createBooking(userId, input, conversationId);
    await this.#store.enqueueJob({
      kind: 'research_booking',
      bookingId: booking.id,
      userId,
      runAt: input.automation.researchAt,
      idempotencyKey: `research:${booking.id}:${input.automation.researchAt}`,
    });
    await this.#store.writeAuditEvent({
      userId,
      bookingId: booking.id,
      actorType: 'user',
      actorId: userId,
      action: 'booking.created',
      outcome: 'success',
      metadata: { category: booking.intent.category, researchAt: booking.automation.researchAt },
    });
    return booking;
  }

  async updateBooking(
    userId: string,
    bookingId: string,
    input: Partial<Pick<Booking, 'intent' | 'automation'>>,
  ): Promise<Booking> {
    const current = await this.#requireBooking(userId, bookingId);
    if (
      isTerminalBookingStatus(current.status) ||
      ['approved', 'executing', 'awaiting_user_action'].includes(current.status)
    ) {
      throw new DomainError(
        'booking_edit_denied',
        `Booking cannot be edited from ${current.status}`,
      );
    }
    const updated = await this.#store.updateBooking(userId, bookingId, input);
    await this.#store.revokeApproval(userId, bookingId);
    await this.#store.cancelBookingJobs(bookingId);
    await this.#store.enqueueJob({
      kind: 'research_booking',
      bookingId,
      userId,
      runAt: new Date().toISOString(),
      idempotencyKey: `research:update:${bookingId}:${updated.updatedAt}`,
    });
    await this.#store.writeAuditEvent({
      userId,
      bookingId,
      actorType: 'user',
      actorId: userId,
      action: 'booking.updated',
      outcome: 'success',
      metadata: {
        intentChanged: input.intent !== undefined,
        automationChanged: input.automation !== undefined,
      },
    });
    return updated;
  }

  async researchBooking(userId: string, bookingId: string): Promise<ResearchOutcome> {
    const current = await this.#requireBooking(userId, bookingId);
    if (isTerminalBookingStatus(current.status)) {
      return { booking: current, offers: [], diagnostics: [], deferredRuns: [] };
    }
    if (['approved', 'executing', 'awaiting_user_action'].includes(current.status)) {
      return {
        booking: current,
        offers: await this.#store.listOffers(userId, bookingId),
        diagnostics: [],
        deferredRuns: [],
      };
    }
    if (Date.parse(current.automation.deadline) <= Date.now()) {
      const expired = await this.#store.transitionBooking(userId, bookingId, 'expired');
      return { booking: expired, offers: [], diagnostics: [], deferredRuns: [] };
    }

    const searching = await this.#store.transitionBooking(userId, bookingId, 'searching');
    const supersededOutcome = async (): Promise<ResearchOutcome | undefined> => {
      const latest = await this.#requireBooking(userId, bookingId);
      if (latest.status === 'searching' && latest.updatedAt === searching.updatedAt) {
        return undefined;
      }
      return {
        booking: latest,
        offers: await this.#store.listOffers(userId, bookingId),
        diagnostics: [
          {
            providerId: 'flow',
            level: 'info',
            code: 'research_superseded',
            message: 'A newer booking change or research run superseded these results.',
            retryable: false,
          },
        ],
        deferredRuns: [],
      };
    };
    const result = await this.#providers.searchAll({ booking: searching });
    const supersededAfterProviders = await supersededOutcome();
    if (supersededAfterProviders !== undefined) return supersededAfterProviders;
    let researchedOffers = result.offers;
    let couponCandidateCount = 0;
    if (this.#couponResearcher !== undefined && researchedOffers.length > 0) {
      try {
        const candidates = await this.#couponResearcher.discover(searching, researchedOffers);
        couponCandidateCount = candidates.length;
        researchedOffers = attachCouponEvidence(researchedOffers, candidates);
      } catch (error) {
        result.diagnostics.push({
          providerId: 'openai:web-deals',
          level: 'warning',
          code: 'web_coupon_research_failed',
          message: error instanceof Error ? error.message : 'Web coupon research failed',
          retryable: true,
        });
      }
    }
    const supersededBeforePersistence = await supersededOutcome();
    if (supersededBeforePersistence !== undefined) return supersededBeforePersistence;
    const ranked = rankOffers(searching.intent, researchedOffers);
    const persistedOffers = await this.#store.replaceOffers(bookingId, ranked);

    const nextStatus = persistedOffers.length > 0 ? 'options_ready' : 'scheduled';
    const updated = await this.#store.transitionBooking(userId, bookingId, nextStatus);
    await this.#store.writeAuditEvent({
      userId,
      bookingId,
      actorType: 'worker',
      actorId: 'booking-research',
      action: 'booking.researched',
      outcome: persistedOffers.length > 0 || result.deferredRuns.length > 0 ? 'success' : 'failure',
      metadata: {
        offerCount: persistedOffers.length,
        providers: [...new Set(persistedOffers.map((offer) => offer.providerId))],
        couponCandidateCount,
        diagnostics: result.diagnostics,
        deferredRuns: result.deferredRuns,
      },
    });

    if (updated.status === 'scheduled') {
      await this.#scheduleRefresh(updated);
    } else if (Date.parse(updated.automation.deadline) > Date.now()) {
      await this.#scheduleRefresh(updated);
    }
    this.#logger.info(
      {
        bookingId,
        offerCount: persistedOffers.length,
        deferredCount: result.deferredRuns.length,
      },
      'Booking research completed',
    );
    return {
      booking: updated,
      offers: persistedOffers,
      diagnostics: result.diagnostics,
      deferredRuns: result.deferredRuns,
    };
  }

  async selectOffer(userId: string, bookingId: string, offerId: string): Promise<Booking> {
    const [current, offer] = await Promise.all([
      this.#requireBooking(userId, bookingId),
      this.#store.getOffer(userId, bookingId, offerId),
    ]);
    if (offer === undefined) throw new DomainError('offer_not_found', 'Offer not found');
    if (!['options_ready', 'awaiting_approval'].includes(current.status)) {
      throw new DomainError(
        'offer_selection_denied',
        `An offer cannot be selected from ${current.status}`,
      );
    }
    const booking = await this.#store.selectOffer(userId, bookingId, offerId);
    await this.#store.writeAuditEvent({
      userId,
      bookingId,
      actorType: 'user',
      actorId: userId,
      action: 'booking.offer_selected',
      outcome: 'success',
      metadata: { offerId },
    });
    return booking;
  }

  async approveBooking(
    userId: string,
    bookingId: string,
    input: CreateApprovalInput,
  ): Promise<{ booking: Booking; approval: Approval }> {
    let booking = await this.#requireBooking(userId, bookingId);
    const offer = await this.#store.getOffer(userId, bookingId, input.offerId);
    if (offer === undefined) throw new DomainError('offer_not_found', 'Offer not found');
    if (offer.finalPrice.currency !== input.maxCharge.currency) {
      throw new DomainError(
        'approval_currency_mismatch',
        'Approval currency must match the selected offer',
      );
    }
    if (compareMoney(offer.finalPrice, input.maxCharge) > 0) {
      throw new DomainError(
        'approval_ceiling_too_low',
        'Approval ceiling is below the selected offer price',
      );
    }
    if (Date.parse(input.validUntil) <= Date.now()) {
      throw new DomainError('approval_expiry_invalid', 'Approval must remain valid in the future');
    }
    if (booking.status === 'options_ready' || booking.selectedOfferId !== offer.id) {
      booking = await this.selectOffer(userId, bookingId, offer.id);
    }
    if (booking.status !== 'awaiting_approval') {
      throw new DomainError(
        'booking_approval_denied',
        `Booking cannot be approved from ${booking.status}`,
      );
    }
    const executeAt =
      input.executeNotBefore ?? booking.automation.executeAt ?? new Date().toISOString();
    if (Date.parse(input.validUntil) > Date.parse(booking.automation.deadline)) {
      throw new DomainError(
        'approval_after_deadline',
        'Approval expiry falls after the booking deadline',
      );
    }
    if (
      Date.parse(executeAt) > Date.parse(input.validUntil) ||
      (input.executeNotAfter !== undefined &&
        Date.parse(executeAt) > Date.parse(input.executeNotAfter))
    ) {
      throw new DomainError(
        'approval_execution_window_invalid',
        'Execution time falls after the approval expiry',
      );
    }
    const approval = await this.#store.createApproval(
      userId,
      bookingId,
      input,
      offer,
      fingerprintOffer(offer),
    );
    booking = await this.#requireBooking(userId, bookingId);
    try {
      await this.#store.enqueueJob({
        kind: 'execute_booking',
        bookingId,
        userId,
        runAt: executeAt,
        maxAttempts: 1,
        idempotencyKey: `execute:${approval.id}`,
        payload: { approvalId: approval.id },
      });
    } catch (error) {
      await this.#store.revokeApproval(userId, bookingId);
      await this.#store.transitionBooking(userId, bookingId, 'awaiting_approval');
      await this.#store.writeAuditEvent({
        userId,
        bookingId,
        actorType: 'system',
        actorId: 'approval-scheduler',
        action: 'booking.execution_scheduling',
        outcome: 'failure',
        metadata: { error: error instanceof Error ? error.message : 'Unknown scheduling error' },
      });
      throw error;
    }
    await this.#store.writeAuditEvent({
      userId,
      bookingId,
      actorType: 'user',
      actorId: userId,
      action: 'booking.approved',
      outcome: 'success',
      metadata: {
        approvalId: approval.id,
        offerId: offer.id,
        providerId: offer.providerId,
        maxCharge: input.maxCharge,
        executeAt,
      },
    });
    return { booking, approval };
  }

  async executeBooking(userId: string, bookingId: string): Promise<CheckoutResult> {
    const booking = await this.#requireBooking(userId, bookingId);
    if (booking.status !== 'approved') {
      throw new DomainError(
        'booking_execution_denied',
        `Booking is not approved for execution; current status is ${booking.status}`,
      );
    }
    const failPreflight = async (code: string, message: string): Promise<never> => {
      await this.#store.revokeApproval(userId, bookingId);
      await this.#store.transitionBooking(userId, bookingId, 'failed', { code, message });
      await this.#store.writeAuditEvent({
        userId,
        bookingId,
        actorType: 'system',
        actorId: 'execution-preflight',
        action: 'booking.execution_preflight',
        outcome: 'denied',
        metadata: { code },
      });
      throw new DomainError(code, message);
    };
    if (booking.selectedOfferId === undefined) {
      return failPreflight('offer_not_selected', 'No offer has been selected');
    }
    const [offer, approval] = await Promise.all([
      this.#store.getOffer(userId, bookingId, booking.selectedOfferId),
      this.#store.getActiveApproval(userId, bookingId),
    ]);
    if (offer === undefined) {
      return failPreflight('offer_not_found', 'Selected offer no longer exists');
    }
    if (approval === undefined) {
      return failPreflight('approval_not_found', 'No active approval exists');
    }
    try {
      assertApprovalAllowsOffer(approval, offer);
    } catch (error) {
      if (error instanceof DomainError) return failPreflight(error.code, error.message);
      throw error;
    }

    const executing = await this.#store.transitionBooking(userId, bookingId, 'executing');
    const provider = this.#providers.require(offer.providerId);
    const coupons = provider.capability.couponApplication
      ? rankCouponCandidates(
          publicCouponsFromOffer(offer),
          offer.providerId,
          Math.min(executing.automation.maxCouponAttempts, this.#maxCouponAttempts),
        )
      : [];
    const providerAttemptId = await this.#store.startProviderAttempt({
      bookingId,
      providerId: offer.providerId,
      operation: 'prepare_checkout',
      requestSummary: {
        offerId: offer.id,
        externalId: offer.externalId,
        approvalId: approval.id,
        couponCandidateCount: coupons.length,
      },
    });
    let checkout: CheckoutResult;
    try {
      checkout = CheckoutResultSchema.parse(
        await this.#providers.prepareCheckout({
          booking: executing,
          offer,
          approval,
          coupons,
        }),
      );
    } catch (error) {
      await this.#store.finishProviderAttempt(providerAttemptId, {
        status: 'failed',
        errorCode: error instanceof Error ? error.name : 'provider_checkout_failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown provider checkout failure',
      });
      await this.#store.consumeApproval(approval.id);
      await this.#store.transitionBooking(userId, bookingId, 'failed', {
        code: 'provider_checkout_failed',
        message: error instanceof Error ? error.message : 'Unknown provider checkout failure',
      });
      await this.#store.writeAuditEvent({
        userId,
        bookingId,
        actorType: 'provider',
        actorId: offer.providerId,
        action: 'booking.checkout_prepared',
        outcome: 'failure',
        metadata: { error: error instanceof Error ? error.message : 'Unknown error' },
      });
      throw error;
    }

    const failCheckout = async (
      code: string,
      message: string,
      status: 'failed' | 'denied',
    ): Promise<never> => {
      await this.#store.finishProviderAttempt(providerAttemptId, {
        status,
        errorCode: code,
        errorMessage: message,
        responseSummary: { providerStatus: checkout.status },
      });
      await this.#store.consumeApproval(approval.id);
      await this.#store.transitionBooking(userId, bookingId, 'failed', { code, message });
      await this.#store.writeAuditEvent({
        userId,
        bookingId,
        actorType: 'provider',
        actorId: offer.providerId,
        action: 'booking.checkout_prepared',
        outcome: 'failure',
        metadata: { code, providerStatus: checkout.status },
      });
      throw new DomainError(code, message);
    };

    if (checkout.providerId !== offer.providerId) {
      return failCheckout(
        'checkout_provider_mismatch',
        'Provider checkout response did not match the approved provider',
        'denied',
      );
    }
    if (checkout.status === 'failed') {
      return failCheckout(
        'provider_checkout_failed',
        checkout.nextAction ?? 'Provider could not prepare checkout',
        'failed',
      );
    }
    if (checkout.finalPrice === undefined) {
      return failCheckout(
        'checkout_total_unverifiable',
        'Provider checkout did not return an actual final total',
        'denied',
      );
    }
    if (checkout.finalPrice.currency !== approval.maxCharge.currency) {
      return failCheckout(
        'checkout_currency_changed',
        'Provider checkout changed the approved currency',
        'denied',
      );
    }
    if (compareMoney(checkout.finalPrice, approval.maxCharge) > 0) {
      return failCheckout(
        'checkout_price_exceeded',
        'Provider checkout exceeded the approved maximum charge',
        'denied',
      );
    }

    await this.#store.finishProviderAttempt(providerAttemptId, {
      status: 'succeeded',
      responseSummary: {
        providerStatus: checkout.status,
        finalPrice: checkout.finalPrice,
        externalReference: checkout.externalReference,
      },
    });
    await this.#store.consumeApproval(approval.id);
    await this.#store.saveBookingCheckout(bookingId, checkout);
    const finalStatus = checkout.status === 'confirmed' ? 'booked' : 'awaiting_user_action';
    await this.#store.transitionBooking(userId, bookingId, finalStatus);
    await this.#store.writeAuditEvent({
      userId,
      bookingId,
      actorType: 'provider',
      actorId: offer.providerId,
      action: 'booking.checkout_prepared',
      outcome: 'success',
      metadata: {
        status: checkout.status,
        externalReference: checkout.externalReference,
        seats: checkout.seats,
        couponAttempts: coupons.length,
        couponApplicationSupported: provider.capability.couponApplication,
        finalPrice: checkout.finalPrice,
      },
    });
    return checkout;
  }

  async cancelBooking(userId: string, bookingId: string): Promise<Booking> {
    const booking = await this.#requireBooking(userId, bookingId);
    if (isTerminalBookingStatus(booking.status)) return booking;
    if (booking.status === 'executing') {
      throw new DomainError(
        'booking_cancellation_denied',
        'A provider checkout is already in progress and cannot be cancelled safely',
      );
    }
    await this.#store.revokeApproval(userId, bookingId);
    await this.#store.cancelBookingJobs(bookingId);
    const cancelled = await this.#store.transitionBooking(userId, bookingId, 'cancelled');
    await this.#store.writeAuditEvent({
      userId,
      bookingId,
      actorType: 'user',
      actorId: userId,
      action: 'booking.cancelled',
      outcome: 'success',
    });
    return cancelled;
  }

  async #scheduleRefresh(booking: Booking): Promise<void> {
    const nextRun = new Date(
      Math.min(
        Date.now() + booking.automation.refreshIntervalMinutes * 60_000,
        Date.parse(booking.automation.deadline),
      ),
    );
    if (nextRun.getTime() <= Date.now()) return;
    await this.#store.enqueueJob({
      kind: 'refresh_offers',
      bookingId: booking.id,
      userId: booking.userId,
      runAt: nextRun.toISOString(),
      idempotencyKey: `refresh:${booking.id}:${nextRun.toISOString()}`,
    });
  }

  async #requireBooking(userId: string, bookingId: string): Promise<Booking> {
    const booking = await this.#store.getBooking(userId, bookingId);
    if (booking === undefined) {
      throw new DomainError('booking_not_found', 'Booking not found');
    }
    return booking;
  }
}
