import { z } from 'zod';

export const IdSchema = z.uuid();
export const IsoDateTimeSchema = z.iso.datetime({ offset: true });
export const IsoDateSchema = z.iso.date();
export const HttpUrlSchema = z.url().refine(
  (value) => {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  },
  { message: 'Expected an HTTP or HTTPS URL' },
);
export const HttpsUrlSchema = z.url().refine((value) => new URL(value).protocol === 'https:', {
  message: 'Expected an HTTPS URL',
});
export const IanaTimeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine(
    (value) => {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Expected a valid IANA timezone' },
  );
export const CurrencyCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Z]{3}$/, 'Expected an ISO 4217 currency code');

export const MoneySchema = z
  .object({
    amountMinor: z.int().nonnegative(),
    currency: CurrencyCodeSchema,
  })
  .strict();

export type Money = z.infer<typeof MoneySchema>;

export const LocationSchema = z
  .object({
    label: z.string().trim().min(1).max(200),
    city: z.string().trim().min(1).max(120).optional(),
    countryCode: z
      .string()
      .trim()
      .regex(/^[A-Z]{2}$/)
      .optional(),
    code: z.string().trim().min(2).max(12).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  })
  .strict();

export type Location = z.infer<typeof LocationSchema>;

export const PageInfoSchema = z
  .object({
    nextCursor: z.string().optional(),
    hasMore: z.boolean(),
  })
  .strict();

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId?: string;
    details?: unknown;
  };
}
