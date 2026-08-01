import type { BookingIntent, Offer } from '@flow/contracts';

export interface DealRankingOptions {
  priceWeight?: number;
  preferenceWeight?: number;
  qualityWeight?: number;
  evidenceWeight?: number;
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function attributeString(offer: Offer, key: string): string | undefined {
  const value = offer.attributes[key];
  return typeof value === 'string' ? value : undefined;
}

function normalizedRating(offer: Offer): number | undefined {
  const rating = offer.attributes.rating;
  if (typeof rating !== 'number' || !Number.isFinite(rating)) return undefined;
  const ratingScale = offer.attributes.ratingScale;
  const scale = typeof ratingScale === 'number' && ratingScale > 0 ? ratingScale : 5;
  return clamp(rating / scale) * 10;
}

function normalizedStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim().toLowerCase())
    : [];
}

function attributeMoney(
  offer: Offer,
  key: string,
): { amountMinor: number; currency: string } | undefined {
  const value = offer.attributes[key];
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  return typeof record.amountMinor === 'number' && typeof record.currency === 'string'
    ? { amountMinor: record.amountMinor, currency: record.currency }
    : undefined;
}

function preferenceScore(intent: BookingIntent, offer: Offer): number {
  let possible = 0;
  let matched = 0;

  const providerPreferences = intent.preferredProviders;
  if (providerPreferences.length > 0) {
    possible += 1;
    if (providerPreferences.some((provider) => provider === offer.providerId)) {
      matched += 1;
    }
  }

  const travel = intent.travelPreference;
  if (travel !== undefined) {
    if (travel.refundableOnly) {
      possible += 1;
      if (offer.refundable === true) matched += 1;
    }
    if (travel.maxStops !== undefined) {
      possible += 1;
      const stops = offer.attributes.stops;
      if (typeof stops === 'number' && stops <= travel.maxStops) matched += 1;
    }
    if (travel.preferredCarriers.length > 0) {
      possible += 1;
      const carrier = attributeString(offer, 'carrier');
      if (carrier !== undefined && travel.preferredCarriers.includes(carrier)) matched += 1;
    }
  }

  const lodging = intent.lodgingPreference;
  if (lodging?.minimumRating !== undefined) {
    possible += 1;
    const rating = normalizedRating(offer);
    if (rating !== undefined && rating >= lodging.minimumRating) matched += 1;
  }

  if (intent.seatPreference !== undefined) {
    possible += 1;
    const adjacent = offer.attributes.adjacentSeatsAvailable;
    if (!intent.seatPreference.together || adjacent === true) matched += 1;
  }

  return possible === 0 ? 0.75 : matched / possible;
}

function qualityScore(offer: Offer): number {
  const rating = normalizedRating(offer);
  if (rating !== undefined) return clamp(rating / 10);
  return offer.refundable === true ? 0.7 : 0.5;
}

function evidenceScore(offer: Offer): number {
  if (offer.deals.length === 0) return 0;
  const bestConfidence = Math.max(...offer.deals.map((deal) => deal.confidence));
  const verifiedBonus = offer.deals.some((deal) => deal.verifiedAt !== undefined) ? 0.15 : 0;
  return clamp(bestConfidence + verifiedBonus);
}

function isEligible(intent: BookingIntent, offer: Offer): boolean {
  if (intent.excludedProviders.includes(offer.providerId)) return false;
  if (offer.availability !== undefined && offer.availability < intent.partySize) return false;
  if (intent.budget !== undefined) {
    if (offer.finalPrice.currency !== intent.budget.currency) return false;
    if (offer.finalPrice.amountMinor > intent.budget.amountMinor) return false;
  }
  if (intent.timeWindow !== undefined && offer.startAt !== undefined) {
    const start = Date.parse(offer.startAt);
    if (start < Date.parse(intent.timeWindow.start) || start > Date.parse(intent.timeWindow.end)) {
      return false;
    }
  }

  const travel = intent.travelPreference;
  if (travel !== undefined) {
    if (travel.refundableOnly && offer.refundable !== true) return false;
    if (travel.maxStops !== undefined) {
      const stops = offer.attributes.stops;
      if (typeof stops !== 'number' || stops > travel.maxStops) return false;
    }
    if (travel.avoidedCarriers.length > 0) {
      const carrier = attributeString(offer, 'carrier')?.toLowerCase();
      if (
        carrier === undefined ||
        travel.avoidedCarriers.some((avoided) => avoided.toLowerCase() === carrier)
      ) {
        return false;
      }
    }
    if (travel.baggageRequired && offer.attributes.baggageIncluded !== true) return false;
  }

  const lodging = intent.lodgingPreference;
  if (lodging !== undefined) {
    if (lodging.refundableOnly && offer.refundable !== true) return false;
    if (lodging.minimumRating !== undefined) {
      const rating = normalizedRating(offer);
      if (rating === undefined || rating < lodging.minimumRating) return false;
    }
    if (lodging.amenities.length > 0) {
      const availableAmenities = new Set(normalizedStrings(offer.attributes.amenities));
      if (lodging.amenities.some((amenity) => !availableAmenities.has(amenity.toLowerCase()))) {
        return false;
      }
    }
  }

  const seatPreference = intent.seatPreference;
  if (seatPreference?.maxPricePerSeat !== undefined) {
    const unitPrice = attributeMoney(offer, 'unitPrice');
    if (
      unitPrice === undefined ||
      unitPrice.currency !== seatPreference.maxPricePerSeat.currency ||
      unitPrice.amountMinor > seatPreference.maxPricePerSeat.amountMinor
    ) {
      return false;
    }
  }
  return true;
}

export function rankOffers(
  intent: BookingIntent,
  offers: readonly Offer[],
  options: DealRankingOptions = {},
): Offer[] {
  const eligible = offers.filter((offer) => isEligible(intent, offer));
  if (eligible.length === 0) return [];

  const priceWeight = options.priceWeight ?? 45;
  const preferenceWeight = options.preferenceWeight ?? 30;
  const qualityWeight = options.qualityWeight ?? 15;
  const evidenceWeight = options.evidenceWeight ?? 10;
  const weightTotal = priceWeight + preferenceWeight + qualityWeight + evidenceWeight;

  const currencyBounds = new Map<string, { minimum: number; maximum: number }>();
  for (const offer of eligible) {
    const priceKnown = offer.attributes.priceKnown !== false && offer.finalPrice.amountMinor > 0;
    if (!priceKnown) continue;
    const current = currencyBounds.get(offer.finalPrice.currency);
    const amount = offer.finalPrice.amountMinor;
    currencyBounds.set(offer.finalPrice.currency, {
      minimum: Math.min(current?.minimum ?? amount, amount),
      maximum: Math.max(current?.maximum ?? amount, amount),
    });
  }

  return eligible
    .map((offer) => {
      const bounds = currencyBounds.get(offer.finalPrice.currency);
      const priceKnown = offer.attributes.priceKnown !== false && offer.finalPrice.amountMinor > 0;
      const priceScore = !priceKnown
        ? 0.35
        : bounds === undefined || bounds.maximum === bounds.minimum
          ? 1
          : 1 - (offer.finalPrice.amountMinor - bounds.minimum) / (bounds.maximum - bounds.minimum);
      const preference = preferenceScore(intent, offer);
      const quality = qualityScore(offer);
      const evidence = evidenceScore(offer);
      const score =
        ((priceScore * priceWeight +
          preference * preferenceWeight +
          quality * qualityWeight +
          evidence * evidenceWeight) /
          weightTotal) *
        100;

      return {
        ...offer,
        score: Math.round(score * 100) / 100,
        scoreBreakdown: {
          price: Math.round(priceScore * 10000) / 100,
          preference: Math.round(preference * 10000) / 100,
          quality: Math.round(quality * 10000) / 100,
          dealEvidence: Math.round(evidence * 10000) / 100,
        },
      } satisfies Offer;
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.finalPrice.amountMinor - right.finalPrice.amountMinor ||
        left.providerId.localeCompare(right.providerId) ||
        left.externalId.localeCompare(right.externalId),
    );
}
