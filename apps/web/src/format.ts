import type { Money } from '@flow/contracts';

export function formatMoney(money: Money): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: money.currency,
    maximumFractionDigits: money.currency === 'JPY' || money.currency === 'KRW' ? 0 : 2,
  }).format(money.amountMinor / (money.currency === 'JPY' || money.currency === 'KRW' ? 1 : 100));
}

export function formatDateTime(value: string, timezone?: string): string {
  const options: Intl.DateTimeFormatOptions = {
    dateStyle: 'medium',
    timeStyle: 'short',
  };
  if (timezone !== undefined) options.timeZone = timezone;
  return new Intl.DateTimeFormat(undefined, options).format(new Date(value));
}

export function relativeTime(value: string): string {
  const differenceSeconds = Math.round((Date.parse(value) - Date.now()) / 1_000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (Math.abs(differenceSeconds) < 60) return formatter.format(differenceSeconds, 'second');
  const minutes = Math.round(differenceSeconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, 'hour');
  return formatter.format(Math.round(hours / 24), 'day');
}

export function statusLabel(status: string): string {
  return status.replaceAll('_', ' ').replace(/^./u, (character) => character.toUpperCase());
}
