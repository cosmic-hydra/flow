import { createHash, randomUUID } from 'node:crypto';
import type { Booking, Money, Offer } from '@flow/contracts';
import { canonicalJson, multiplyMoney } from '@flow/core';

export function rowsFromPayload(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter(
      (value): value is Record<string, unknown> =>
        value !== null && typeof value === 'object' && !Array.isArray(value),
    );
  }
  if (payload !== null && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    for (const key of ['data', 'results', 'rows', 'items']) {
      if (Array.isArray(record[key])) return rowsFromPayload(record[key]);
    }
    return [record];
  }
  return [];
}

export function textValue(row: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return undefined;
}

export function numberValue(row: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const normalized = value.replaceAll(',', '').match(/-?\d+(?:\.\d+)?/u)?.[0];
      if (normalized !== undefined) {
        const parsed = Number(normalized);
        if (Number.isFinite(parsed)) return parsed;
      }
    }
  }
  return undefined;
}

export function currencyValue(row: Record<string, unknown>, fallback: string): string {
  const explicit = textValue(row, 'currency', 'price_currency', 'priceCurrency');
  if (explicit !== undefined && /^[A-Z]{3}$/u.test(explicit.toUpperCase())) {
    return explicit.toUpperCase();
  }
  const price = textValue(row, 'price', 'priceRange', 'price_amount');
  const embeddedCode = price?.match(
    /\b(?:AED|AUD|CAD|CHF|CNY|EUR|GBP|HKD|IDR|INR|JPY|KRW|MYR|NZD|PHP|SGD|THB|USD|VND)\b/u,
  )?.[0];
  if (embeddedCode !== undefined) return embeddedCode;
  if (price?.includes('₹') === true) return 'INR';
  if (price?.includes('€') === true) return 'EUR';
  if (price?.includes('£') === true) return 'GBP';
  if (price?.includes('¥') === true) return 'JPY';
  if (price?.includes('$') === true) return 'USD';
  return fallback;
}

export function priceMoney(
  row: Record<string, unknown>,
  fallbackCurrency: string,
  ...keys: string[]
): Money {
  const currency = currencyValue(row, fallbackCurrency);
  const major = numberValue(row, ...keys) ?? 0;
  const multiplier = currency === 'JPY' || currency === 'KRW' ? 1 : 100;
  return { amountMinor: Math.max(0, Math.round(major * multiplier)), currency };
}

function dateTimeParts(value: string, timezone: string): Record<string, string> {
  try {
    return Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      })
        .formatToParts(new Date(value))
        .map((part) => [part.type, part.value]),
    );
  } catch {
    return {};
  }
}

export function dateInTimeZone(value: string, timezone: string): string {
  const parts = dateTimeParts(value, timezone);
  if (parts.year !== undefined && parts.month !== undefined && parts.day !== undefined) {
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  return value.slice(0, 10);
}

export function timeInTimeZone(value: string, timezone: string): string {
  const parts = dateTimeParts(value, timezone);
  if (parts.hour !== undefined && parts.minute !== undefined) {
    return `${parts.hour}:${parts.minute}`;
  }
  const fallback = new Date(value);
  return `${String(fallback.getUTCHours()).padStart(2, '0')}:${String(fallback.getUTCMinutes()).padStart(2, '0')}`;
}

export function externalId(row: Record<string, unknown>, prefix: string): string {
  return (
    textValue(row, 'showId', 'flightNo', 'hotelId', 'id', 'url', 'slug') ??
    `${prefix}-${createHash('sha256').update(canonicalJson(row)).digest('hex').slice(0, 20)}`
  );
}

export function offerFromWebcmd(input: {
  booking: Booking;
  providerId: string;
  providerName: string;
  row: Record<string, unknown>;
  title: string;
  subtitle?: string;
  priceKeys: string[];
  attributes?: Record<string, unknown>;
}): Offer {
  const fallbackCurrency = input.booking.intent.budget?.currency ?? 'INR';
  const listedPrice = numberValue(input.row, ...input.priceKeys);
  const finalPrice = priceMoney(input.row, fallbackCurrency, ...input.priceKeys);
  const url = textValue(input.row, 'url');
  const startAt = textValue(input.row, 'startAt', 'departure');
  const offer: Offer = {
    id: randomUUID(),
    bookingId: input.booking.id,
    providerId: input.providerId,
    providerName: input.providerName,
    externalId: externalId(input.row, input.providerId.replaceAll(':', '-')),
    title: input.title,
    subtitle: input.subtitle ?? '',
    basePrice: finalPrice,
    fees: { amountMinor: 0, currency: finalPrice.currency },
    taxes: { amountMinor: 0, currency: finalPrice.currency },
    savings: { amountMinor: 0, currency: finalPrice.currency },
    finalPrice,
    attributes: {
      ...input.row,
      ...input.attributes,
      priceKnown: listedPrice !== undefined && listedPrice > 0,
      priceCompleteness: 'listed',
    },
    deals: [],
    score: 0,
    scoreBreakdown: {},
    fetchedAt: new Date().toISOString(),
  };
  if (url !== undefined && URL.canParse(url)) offer.url = url;
  if (startAt !== undefined && !Number.isNaN(Date.parse(startAt))) {
    offer.startAt = new Date(startAt).toISOString();
  }
  return offer;
}

export function priceOfferForQuantity(offer: Offer, quantity: number): Offer {
  const pricedQuantity = Math.max(1, quantity);
  return {
    ...offer,
    basePrice: multiplyMoney(offer.basePrice, pricedQuantity),
    fees: multiplyMoney(offer.fees, pricedQuantity),
    taxes: multiplyMoney(offer.taxes, pricedQuantity),
    savings: multiplyMoney(offer.savings, pricedQuantity),
    finalPrice: multiplyMoney(offer.finalPrice, pricedQuantity),
    attributes: {
      ...offer.attributes,
      unitPrice: offer.finalPrice,
      pricedQuantity,
    },
  };
}
