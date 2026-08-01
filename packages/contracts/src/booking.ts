import { z } from 'zod';
import {
  CurrencyCodeSchema,
  HttpsUrlSchema,
  IanaTimeZoneSchema,
  IdSchema,
  IsoDateTimeSchema,
  LocationSchema,
  MoneySchema,
} from './primitives.js';

export const BookingCategorySchema = z.enum([
  'movie',
  'flight',
  'train',
  'bus',
  'hotel',
  'restaurant',
  'event',
  'activity',
  'appointment',
  'rental',
  'shopping',
  'service',
  'generic',
]);
export type BookingCategory = z.infer<typeof BookingCategorySchema>;

export const BookingStatusSchema = z.enum([
  'draft',
  'scheduled',
  'searching',
  'options_ready',
  'awaiting_approval',
  'approved',
  'executing',
  'awaiting_user_action',
  'booked',
  'failed',
  'cancelled',
  'expired',
]);
export type BookingStatus = z.infer<typeof BookingStatusSchema>;

export const SeatPreferenceSchema = z
  .object({
    count: z.int().min(1).max(20),
    together: z.boolean().default(true),
    preferredRows: z.array(z.string().trim().min(1).max(12)).max(20).default([]),
    preferredSections: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
    preferredClasses: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
    avoidFrontRows: z.int().min(0).max(20).default(2),
    preferCenter: z.boolean().default(true),
    accessibilityRequired: z.boolean().default(false),
    maxPricePerSeat: MoneySchema.optional(),
  })
  .strict();
export type SeatPreference = z.infer<typeof SeatPreferenceSchema>;

export const TravelPreferenceSchema = z
  .object({
    cabinClasses: z.array(z.string().trim().min(1).max(40)).max(8).default([]),
    maxStops: z.int().min(0).max(5).optional(),
    preferredCarriers: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
    avoidedCarriers: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
    refundableOnly: z.boolean().default(false),
    baggageRequired: z.boolean().default(false),
  })
  .strict();

export const LodgingPreferenceSchema = z
  .object({
    rooms: z.int().min(1).max(20).default(1),
    adults: z.int().min(1).max(30).default(2),
    children: z.int().min(0).max(20).default(0),
    minimumRating: z.number().min(0).max(10).optional(),
    amenities: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
    refundableOnly: z.boolean().default(false),
  })
  .strict();

export const TimeWindowSchema = z
  .object({
    start: IsoDateTimeSchema,
    end: IsoDateTimeSchema,
    timezone: IanaTimeZoneSchema,
  })
  .strict()
  .refine((value) => Date.parse(value.end) > Date.parse(value.start), {
    message: 'Time window end must be after start',
    path: ['end'],
  });
export type TimeWindow = z.infer<typeof TimeWindowSchema>;

export const BookingIntentSchema = z
  .object({
    category: BookingCategorySchema,
    title: z.string().trim().min(2).max(240),
    description: z.string().trim().max(2_000).default(''),
    partySize: z.int().min(1).max(100).default(1),
    origin: LocationSchema.optional(),
    destination: LocationSchema.optional(),
    venue: LocationSchema.optional(),
    timeWindow: TimeWindowSchema.optional(),
    returnWindow: TimeWindowSchema.optional(),
    budget: MoneySchema.optional(),
    seatPreference: SeatPreferenceSchema.optional(),
    travelPreference: TravelPreferenceSchema.optional(),
    lodgingPreference: LodgingPreferenceSchema.optional(),
    preferredProviders: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
    excludedProviders: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
    constraints: z.array(z.string().trim().min(1).max(300)).max(50).default([]),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type BookingIntent = z.infer<typeof BookingIntentSchema>;

export const AutomationPlanSchema = z
  .object({
    researchAt: IsoDateTimeSchema,
    executeAt: IsoDateTimeSchema.optional(),
    deadline: IsoDateTimeSchema,
    refreshIntervalMinutes: z.int().min(5).max(10_080).default(60),
    maxCouponAttempts: z.int().min(0).max(25).default(8),
    autoExecuteWithinApproval: z.boolean().default(false),
  })
  .strict()
  .refine((value) => Date.parse(value.deadline) > Date.parse(value.researchAt), {
    message: 'Deadline must be after research start',
    path: ['deadline'],
  })
  .refine(
    (value) =>
      value.executeAt === undefined ||
      (Date.parse(value.executeAt) >= Date.parse(value.researchAt) &&
        Date.parse(value.executeAt) <= Date.parse(value.deadline)),
    {
      message: 'Execution time must fall between research start and deadline',
      path: ['executeAt'],
    },
  );
export type AutomationPlan = z.infer<typeof AutomationPlanSchema>;

export const DealEvidenceSchema = z
  .object({
    kind: z.enum(['coupon', 'provider_offer', 'card_offer', 'cashback', 'membership', 'bundle']),
    title: z.string().trim().min(1).max(200),
    code: z.string().trim().min(1).max(80).optional(),
    sourceUrl: HttpsUrlSchema.optional(),
    terms: z.string().trim().max(1_000).optional(),
    savings: MoneySchema.optional(),
    confidence: z.number().min(0).max(1),
    verifiedAt: IsoDateTimeSchema.optional(),
  })
  .strict();
export type DealEvidence = z.infer<typeof DealEvidenceSchema>;

export const OfferSchema = z
  .object({
    id: IdSchema,
    bookingId: IdSchema,
    providerId: z.string().trim().min(1).max(80),
    providerName: z.string().trim().min(1).max(120),
    externalId: z.string().trim().min(1).max(300),
    title: z.string().trim().min(1).max(300),
    subtitle: z.string().trim().max(500).default(''),
    url: HttpsUrlSchema.optional(),
    startAt: IsoDateTimeSchema.optional(),
    endAt: IsoDateTimeSchema.optional(),
    basePrice: MoneySchema,
    fees: MoneySchema,
    taxes: MoneySchema,
    savings: MoneySchema,
    finalPrice: MoneySchema,
    refundable: z.boolean().optional(),
    availability: z.int().nonnegative().optional(),
    attributes: z.record(z.string(), z.unknown()).default({}),
    deals: z.array(DealEvidenceSchema).max(30).default([]),
    score: z.number().min(0).max(100).default(0),
    scoreBreakdown: z.record(z.string(), z.number()).default({}),
    fetchedAt: IsoDateTimeSchema,
    expiresAt: IsoDateTimeSchema.optional(),
  })
  .strict();
export type Offer = z.infer<typeof OfferSchema>;

export const CreateBookingSchema = z
  .object({
    intent: BookingIntentSchema,
    automation: AutomationPlanSchema,
  })
  .strict();
export type CreateBookingInput = z.infer<typeof CreateBookingSchema>;

export const UpdateBookingSchema = z
  .object({
    intent: BookingIntentSchema.optional(),
    automation: AutomationPlanSchema.optional(),
  })
  .strict()
  .refine((value) => value.intent !== undefined || value.automation !== undefined, {
    message: 'At least one booking field must be provided',
  });

export const BookingSchema = z
  .object({
    id: IdSchema,
    userId: IdSchema,
    status: BookingStatusSchema,
    intent: BookingIntentSchema,
    automation: AutomationPlanSchema,
    selectedOfferId: IdSchema.optional(),
    failureCode: z.string().max(100).optional(),
    failureMessage: z.string().max(2_000).optional(),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .strict();
export type Booking = z.infer<typeof BookingSchema>;

export const CreateApprovalSchema = z
  .object({
    offerId: IdSchema,
    maxCharge: MoneySchema,
    validUntil: IsoDateTimeSchema,
    executeNotBefore: IsoDateTimeSchema.optional(),
    executeNotAfter: IsoDateTimeSchema.optional(),
    allowLowerPricedEquivalent: z.boolean().default(false),
    confirmationText: z.string().trim().min(12).max(500),
  })
  .strict()
  .refine(
    (value) =>
      value.executeNotBefore === undefined ||
      Date.parse(value.executeNotBefore) <= Date.parse(value.validUntil),
    {
      message: 'Execution start must not be after approval expiry',
      path: ['executeNotBefore'],
    },
  )
  .refine(
    (value) =>
      value.executeNotAfter === undefined ||
      Date.parse(value.executeNotAfter) <= Date.parse(value.validUntil),
    {
      message: 'Execution end must not be after approval expiry',
      path: ['executeNotAfter'],
    },
  )
  .refine(
    (value) =>
      value.executeNotBefore === undefined ||
      value.executeNotAfter === undefined ||
      Date.parse(value.executeNotBefore) <= Date.parse(value.executeNotAfter),
    {
      message: 'Execution end must not be before execution start',
      path: ['executeNotAfter'],
    },
  );
export type CreateApprovalInput = z.infer<typeof CreateApprovalSchema>;

export const ApprovalStatusSchema = z.enum(['active', 'consumed', 'revoked', 'expired']);
export const ApprovalSchema = z
  .object({
    id: IdSchema,
    bookingId: IdSchema,
    userId: IdSchema,
    offerId: IdSchema,
    providerId: z.string().trim().min(1).max(80),
    status: ApprovalStatusSchema,
    maxCharge: MoneySchema,
    offerFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    validUntil: IsoDateTimeSchema,
    executeNotBefore: IsoDateTimeSchema.optional(),
    executeNotAfter: IsoDateTimeSchema.optional(),
    allowLowerPricedEquivalent: z.boolean(),
    confirmationText: z.string().trim().min(12).max(500),
    approvedAt: IsoDateTimeSchema,
    consumedAt: IsoDateTimeSchema.optional(),
  })
  .strict();
export type Approval = z.infer<typeof ApprovalSchema>;

export const CouponCandidateSchema = z
  .object({
    code: z.string().trim().min(2).max(80),
    providerId: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500).default(''),
    sourceUrl: HttpsUrlSchema.optional(),
    expectedSavingsMinor: z.int().nonnegative().optional(),
    currency: CurrencyCodeSchema.optional(),
    confidence: z.number().min(0).max(1).default(0.5),
    expiresAt: IsoDateTimeSchema.optional(),
    publicCode: z.boolean().default(true),
  })
  .strict();
export type CouponCandidate = z.infer<typeof CouponCandidateSchema>;

export const CheckoutStatusSchema = z.enum([
  'prepared',
  'awaiting_user_action',
  'confirmed',
  'failed',
]);

export const CheckoutResultSchema = z
  .object({
    status: CheckoutStatusSchema,
    providerId: z.string(),
    externalReference: z.string().optional(),
    finalPrice: MoneySchema.optional(),
    seats: z.array(z.string()).optional(),
    nextAction: z.string().max(1_000).optional(),
    handoffUrl: HttpsUrlSchema.optional(),
    receiptUrl: HttpsUrlSchema.optional(),
    providerPayload: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type CheckoutResult = z.infer<typeof CheckoutResultSchema>;

export const BookingCheckoutSchema = z
  .object({
    bookingId: IdSchema,
    status: CheckoutStatusSchema,
    providerId: z.string().trim().min(1).max(80),
    externalReference: z.string().max(500).optional(),
    finalPrice: MoneySchema.optional(),
    seats: z.array(z.string().trim().min(1).max(80)).max(100).default([]),
    nextAction: z.string().max(1_000).optional(),
    handoffUrl: HttpsUrlSchema.optional(),
    receiptUrl: HttpsUrlSchema.optional(),
    updatedAt: IsoDateTimeSchema,
  })
  .strict();
export type BookingCheckout = z.infer<typeof BookingCheckoutSchema>;
