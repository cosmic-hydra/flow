import { createHash } from 'node:crypto';
import type { FlowConfig } from '@flow/config';
import type { Booking, CouponCandidate, Offer } from '@flow/contracts';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';

const CouponResearchOutputSchema = z
  .object({
    coupons: z
      .array(
        z
          .object({
            code: z.string().trim().min(2).max(80),
            providerId: z.string().trim().min(1).max(80),
            description: z.string().trim().min(1).max(500),
            sourceUrl: z.string().nullable(),
            expectedSavingsMinor: z.int().nonnegative().nullable(),
            currency: z
              .string()
              .regex(/^[A-Z]{3}$/u)
              .nullable(),
            confidence: z.number().min(0).max(1),
            expiresAt: z.string().nullable(),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();

function safetyIdentifier(userId: string): string {
  return createHash('sha256').update(`flow:deal-research:${userId}`).digest('hex');
}

function locationFor(booking: Booking): {
  type: 'approximate';
  city?: string;
  country?: string;
  timezone?: string;
} {
  const location = booking.intent.venue ?? booking.intent.destination ?? booking.intent.origin;
  const result: {
    type: 'approximate';
    city?: string;
    country?: string;
    timezone?: string;
  } = { type: 'approximate' };
  if (location?.city !== undefined) result.city = location.city;
  if (location?.countryCode !== undefined) result.country = location.countryCode;
  if (booking.intent.timeWindow?.timezone !== undefined) {
    result.timezone = booking.intent.timeWindow.timezone;
  }
  return result;
}

export class OpenAIWebCouponResearcher {
  readonly #client?: OpenAI;
  readonly #config: FlowConfig['openai'];

  constructor(config: FlowConfig['openai']) {
    this.#config = config;
    if (config.apiKey !== undefined && config.webDealResearchEnabled) {
      this.#client = new OpenAI({ apiKey: config.apiKey });
    }
  }

  isEnabled(): boolean {
    return this.#client !== undefined;
  }

  async discover(booking: Booking, offers: readonly Offer[]): Promise<CouponCandidate[]> {
    if (this.#client === undefined) return [];
    const providers = [
      ...new Set(offers.map((offer) => offer.providerId).filter((id) => id !== 'demo')),
    ];
    if (providers.length === 0) return [];

    const response = await this.#client.responses.parse({
      model: this.#config.model,
      instructions: [
        'Find currently public coupon codes for the named booking providers.',
        'Use web search and return only codes shown verbatim on a public source page.',
        'Prefer first-party provider pages, then reputable public deal pages.',
        'Never invent, transform, enumerate, or guess codes. Never return referral, employee, private, leaked, single-use, or account-specific codes.',
        'Use only one of the supplied provider IDs. A source URL is mandatory for every returned code.',
        'Confidence reflects evidence that the exact code is current and relevant; it does not mean the code has been checkout-verified.',
        'Return an empty list when evidence is insufficient.',
      ].join(' '),
      input: JSON.stringify({
        category: booking.intent.category,
        query: booking.intent.title,
        providers,
        market: booking.intent.venue?.city ?? booking.intent.destination?.city,
        bookingDate: booking.intent.timeWindow?.start.slice(0, 10),
        currency: booking.intent.budget?.currency,
      }),
      tools: [
        {
          type: 'web_search',
          search_context_size: 'low',
          user_location: locationFor(booking),
        },
      ],
      text: {
        format: zodTextFormat(CouponResearchOutputSchema, 'flow_coupon_research'),
        verbosity: 'low',
      },
      reasoning: { effort: 'low' },
      max_output_tokens: 4_000,
      safety_identifier: safetyIdentifier(booking.userId),
      store: false,
    });
    const parsed = response.output_parsed;
    if (parsed === null) return [];
    const providerSet = new Set(providers);

    return parsed.coupons.flatMap((coupon): CouponCandidate[] => {
      if (!providerSet.has(coupon.providerId)) return [];
      if (coupon.sourceUrl === null || !URL.canParse(coupon.sourceUrl)) return [];
      const sourceUrl = new URL(coupon.sourceUrl);
      if (sourceUrl.protocol !== 'https:') return [];
      const expiresAt =
        coupon.expiresAt !== null && !Number.isNaN(Date.parse(coupon.expiresAt))
          ? new Date(coupon.expiresAt).toISOString()
          : undefined;
      const result: CouponCandidate = {
        code: coupon.code,
        providerId: coupon.providerId,
        description: coupon.description,
        sourceUrl: sourceUrl.toString(),
        confidence: coupon.confidence,
        publicCode: true,
      };
      if (coupon.expectedSavingsMinor !== null && coupon.currency !== null) {
        result.expectedSavingsMinor = coupon.expectedSavingsMinor;
        result.currency = coupon.currency;
      }
      if (expiresAt !== undefined) result.expiresAt = expiresAt;
      return [result];
    });
  }
}
