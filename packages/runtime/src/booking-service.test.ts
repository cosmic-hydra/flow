import type { Approval, Booking, CheckoutResult, Offer } from '@flow/contracts';
import { fingerprintOffer } from '@flow/core';
import type { FlowStore } from '@flow/db';
import { ProviderRegistry, type BookingProvider } from '@flow/providers';
import { describe, expect, it, vi } from 'vitest';
import { BookingService } from './booking-service.js';

const userId = '30000000-0000-4000-8000-000000000001';
const bookingId = '30000000-0000-4000-8000-000000000002';
const offerId = '30000000-0000-4000-8000-000000000003';
const approvalId = '30000000-0000-4000-8000-000000000004';

function fixture(): { booking: Booking; offer: Offer; approval: Approval } {
  const offer: Offer = {
    id: offerId,
    bookingId,
    providerId: 'unverified-provider',
    providerName: 'Unverified provider',
    externalId: 'external-offer',
    title: 'Approved option',
    subtitle: '',
    basePrice: { amountMinor: 10_000, currency: 'INR' },
    fees: { amountMinor: 500, currency: 'INR' },
    taxes: { amountMinor: 0, currency: 'INR' },
    savings: { amountMinor: 0, currency: 'INR' },
    finalPrice: { amountMinor: 10_500, currency: 'INR' },
    attributes: {},
    deals: [],
    score: 80,
    scoreBreakdown: {},
    fetchedAt: '2026-08-01T10:00:00.000Z',
  };
  const booking: Booking = {
    id: bookingId,
    userId,
    selectedOfferId: offerId,
    status: 'approved',
    intent: {
      category: 'movie',
      title: 'Approved option',
      description: '',
      partySize: 1,
      preferredProviders: [],
      excludedProviders: [],
      constraints: [],
      metadata: {},
    },
    automation: {
      researchAt: '2026-08-01T10:00:00.000Z',
      deadline: '2099-08-02T10:00:00.000Z',
      refreshIntervalMinutes: 60,
      maxCouponAttempts: 3,
      autoExecuteWithinApproval: false,
    },
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
  };
  const approval: Approval = {
    id: approvalId,
    bookingId,
    userId,
    offerId,
    providerId: offer.providerId,
    status: 'active',
    maxCharge: { amountMinor: 11_000, currency: 'INR' },
    offerFingerprint: fingerprintOffer(offer),
    validUntil: '2099-08-02T10:00:00.000Z',
    allowLowerPricedEquivalent: true,
    confirmationText: 'I approve this provider up to INR 110.00.',
    approvedAt: '2026-08-01T10:01:00.000Z',
  };
  return { booking, offer, approval };
}

describe('booking execution', () => {
  it('fails closed when a non-failed provider response omits its actual total', async () => {
    const { booking, offer, approval } = fixture();
    const transitionBooking = vi.fn(
      async (_userId: string, _bookingId: string, status: Booking['status']) => ({
        ...booking,
        status,
      }),
    );
    const finishProviderAttempt = vi.fn(async () => undefined);
    const consumeApproval = vi.fn(async () => undefined);
    const store = {
      getBooking: vi.fn(async () => booking),
      getOffer: vi.fn(async () => offer),
      getActiveApproval: vi.fn(async () => approval),
      transitionBooking,
      startProviderAttempt: vi.fn(async () => 'provider-attempt-id'),
      finishProviderAttempt,
      consumeApproval,
      writeAuditEvent: vi.fn(async () => ({ id: 'audit-event-id' })),
    } as unknown as FlowStore;
    const provider: BookingProvider = {
      id: offer.providerId,
      name: offer.providerName,
      capability: {
        categories: ['movie'],
        search: false,
        checkout: true,
        couponApplication: false,
        scheduling: true,
      },
      isEnabled: () => true,
      supports: (category) => category === 'movie',
      health: async () => ({ available: true, message: 'Test provider' }),
      search: async () => ({ offers: [], diagnostics: [], deferredRuns: [] }),
      prepareCheckout: async (): Promise<CheckoutResult> => ({
        status: 'awaiting_user_action',
        providerId: offer.providerId,
        nextAction: 'Continue to payment',
        providerPayload: {},
      }),
    };
    const service = new BookingService({
      store,
      providers: new ProviderRegistry([provider]),
      maxCouponAttempts: 3,
    });

    await expect(service.executeBooking(userId, bookingId)).rejects.toMatchObject({
      code: 'checkout_total_unverifiable',
    });
    expect(finishProviderAttempt).toHaveBeenCalledWith(
      'provider-attempt-id',
      expect.objectContaining({
        status: 'denied',
        errorCode: 'checkout_total_unverifiable',
      }),
    );
    expect(consumeApproval).toHaveBeenCalledWith(approvalId);
    expect(transitionBooking).toHaveBeenLastCalledWith(userId, bookingId, 'failed', {
      code: 'checkout_total_unverifiable',
      message: 'Provider checkout did not return an actual final total',
    });
  });

  it('persists a validated checkout handoff before completing execution', async () => {
    const { booking, offer, approval } = fixture();
    const checkout: CheckoutResult = {
      status: 'awaiting_user_action',
      providerId: offer.providerId,
      externalReference: 'checkout-123',
      finalPrice: { amountMinor: 10_500, currency: 'INR' },
      seats: ['H8'],
      nextAction: 'Complete payment with the provider.',
      handoffUrl: 'https://provider.example/checkout/123',
      providerPayload: {},
    };
    const saveBookingCheckout = vi.fn(async () => ({
      bookingId,
      ...checkout,
      providerPayload: undefined,
      updatedAt: '2026-08-01T10:02:00.000Z',
    }));
    const transitionBooking = vi.fn(
      async (_userId: string, _bookingId: string, status: Booking['status']) => ({
        ...booking,
        status,
      }),
    );
    const store = {
      getBooking: vi.fn(async () => booking),
      getOffer: vi.fn(async () => offer),
      getActiveApproval: vi.fn(async () => approval),
      transitionBooking,
      startProviderAttempt: vi.fn(async () => 'provider-attempt-id'),
      finishProviderAttempt: vi.fn(async () => undefined),
      consumeApproval: vi.fn(async () => undefined),
      saveBookingCheckout,
      writeAuditEvent: vi.fn(async () => ({ id: 'audit-event-id' })),
    } as unknown as FlowStore;
    const provider: BookingProvider = {
      id: offer.providerId,
      name: offer.providerName,
      capability: {
        categories: ['movie'],
        search: false,
        checkout: true,
        couponApplication: false,
        scheduling: true,
      },
      isEnabled: () => true,
      supports: (category) => category === 'movie',
      health: async () => ({ available: true, message: 'Test provider' }),
      search: async () => ({ offers: [], diagnostics: [], deferredRuns: [] }),
      prepareCheckout: async () => checkout,
    };
    const service = new BookingService({
      store,
      providers: new ProviderRegistry([provider]),
      maxCouponAttempts: 3,
    });

    await expect(service.executeBooking(userId, bookingId)).resolves.toEqual(checkout);
    expect(saveBookingCheckout).toHaveBeenCalledWith(bookingId, checkout);
    expect(transitionBooking).toHaveBeenLastCalledWith(userId, bookingId, 'awaiting_user_action');
  });
});

describe('booking research', () => {
  it('returns the stable IDs assigned by persistence after an offer refresh', async () => {
    const { booking: approvedBooking, offer } = fixture();
    const booking: Booking = { ...approvedBooking, status: 'draft' };
    delete booking.selectedOfferId;
    const persistedOffer = {
      ...offer,
      id: '30000000-0000-4000-8000-000000000005',
    };
    let currentBooking = booking;
    const store = {
      getBooking: vi.fn(async () => currentBooking),
      transitionBooking: vi.fn(
        async (_userId: string, _bookingId: string, status: Booking['status']) => {
          currentBooking = {
            ...currentBooking,
            status,
            updatedAt:
              status === 'searching' ? '2026-08-01T10:00:01.000Z' : '2026-08-01T10:00:02.000Z',
          };
          return currentBooking;
        },
      ),
      replaceOffers: vi.fn(async () => [persistedOffer]),
      enqueueJob: vi.fn(async () => ({ id: 'queued-job-id' })),
      writeAuditEvent: vi.fn(async () => ({ id: 'audit-event-id' })),
    } as unknown as FlowStore;
    const provider: BookingProvider = {
      id: offer.providerId,
      name: offer.providerName,
      capability: {
        categories: ['movie'],
        search: true,
        checkout: false,
        couponApplication: false,
        scheduling: true,
      },
      isEnabled: () => true,
      supports: (category) => category === 'movie',
      health: async () => ({ available: true, message: 'Test provider' }),
      search: async () => ({ offers: [offer], diagnostics: [], deferredRuns: [] }),
      prepareCheckout: async () => ({
        status: 'failed',
        providerId: offer.providerId,
        providerPayload: {},
      }),
    };
    const service = new BookingService({
      store,
      providers: new ProviderRegistry([provider]),
      maxCouponAttempts: 3,
    });

    const outcome = await service.researchBooking(userId, bookingId);

    expect(outcome.offers).toEqual([persistedOffer]);
  });

  it('does not persist provider results after a newer booking change', async () => {
    const { booking: approvedBooking, offer } = fixture();
    let currentBooking: Booking = { ...approvedBooking, status: 'draft' };
    delete currentBooking.selectedOfferId;
    const replaceOffers = vi.fn(async () => [offer]);
    const store = {
      getBooking: vi.fn(async () => currentBooking),
      transitionBooking: vi.fn(
        async (_userId: string, _bookingId: string, status: Booking['status']) => {
          currentBooking = {
            ...currentBooking,
            status,
            updatedAt: '2026-08-01T10:00:01.000Z',
          };
          return currentBooking;
        },
      ),
      listOffers: vi.fn(async () => []),
      replaceOffers,
    } as unknown as FlowStore;
    const provider: BookingProvider = {
      id: offer.providerId,
      name: offer.providerName,
      capability: {
        categories: ['movie'],
        search: true,
        checkout: false,
        couponApplication: false,
        scheduling: true,
      },
      isEnabled: () => true,
      supports: (category) => category === 'movie',
      health: async () => ({ available: true, message: 'Test provider' }),
      search: async () => {
        currentBooking = {
          ...currentBooking,
          updatedAt: '2026-08-01T10:00:02.000Z',
        };
        return { offers: [offer], diagnostics: [], deferredRuns: [] };
      },
      prepareCheckout: async () => ({
        status: 'failed',
        providerId: offer.providerId,
        providerPayload: {},
      }),
    };
    const service = new BookingService({
      store,
      providers: new ProviderRegistry([provider]),
      maxCouponAttempts: 3,
    });

    const outcome = await service.researchBooking(userId, bookingId);

    expect(outcome.diagnostics).toEqual([expect.objectContaining({ code: 'research_superseded' })]);
    expect(replaceOffers).not.toHaveBeenCalled();
  });
});
