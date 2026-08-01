import { z } from 'zod';
import { CreateBookingSchema } from '@flow/contracts';

export const SearchBookingToolSchema = z
  .object({
    bookingId: z.uuid(),
  })
  .strict();

export const GetBookingToolSchema = SearchBookingToolSchema;

export const ListBookingsToolSchema = z
  .object({
    limit: z.int().min(1).max(100).default(25),
  })
  .strict();

export const SelectOfferToolSchema = z
  .object({
    bookingId: z.uuid(),
    offerId: z.uuid(),
  })
  .strict();

export type BookingAgentToolName =
  'create_booking' | 'search_booking' | 'get_booking' | 'list_bookings' | 'select_offer';

const bookingAgentToolNames: ReadonlySet<string> = new Set<BookingAgentToolName>([
  'create_booking',
  'search_booking',
  'get_booking',
  'list_bookings',
  'select_offer',
]);

export function isBookingAgentToolName(value: string): value is BookingAgentToolName {
  return bookingAgentToolNames.has(value);
}

const uuidSchema = { type: 'string', format: 'uuid' } as const;

export const bookingAgentTools = [
  {
    type: 'function',
    name: 'create_booking',
    description:
      'Create a local booking request and schedule its research. This never approves, purchases, or charges anything. Ask for missing material constraints before calling it.',
    parameters: z.toJSONSchema(CreateBookingSchema),
    strict: false,
  },
  {
    type: 'function',
    name: 'search_booking',
    description:
      'Search configured providers for a booking and deterministically rank current offers. This is read-only on provider sites.',
    parameters: {
      type: 'object',
      properties: { bookingId: uuidSchema },
      required: ['bookingId'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: 'function',
    name: 'get_booking',
    description: 'Get a booking, its ranked offers, and current approval-safe lifecycle status.',
    parameters: {
      type: 'object',
      properties: { bookingId: uuidSchema },
      required: ['bookingId'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: 'function',
    name: 'list_bookings',
    description: 'List the current user booking requests, newest first.',
    parameters: {
      type: 'object',
      properties: { limit: { type: 'integer', minimum: 1, maximum: 100 } },
      required: ['limit'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: 'function',
    name: 'select_offer',
    description:
      'Select an offer for review. This moves the booking to awaiting approval but does not approve or execute it.',
    parameters: {
      type: 'object',
      properties: { bookingId: uuidSchema, offerId: uuidSchema },
      required: ['bookingId', 'offerId'],
      additionalProperties: false,
    },
    strict: true,
  },
] as const;

export function parseToolArguments(name: BookingAgentToolName, value: unknown): unknown {
  switch (name) {
    case 'create_booking':
      return CreateBookingSchema.parse(value);
    case 'search_booking':
      return SearchBookingToolSchema.parse(value);
    case 'get_booking':
      return GetBookingToolSchema.parse(value);
    case 'list_bookings':
      return ListBookingsToolSchema.parse(value);
    case 'select_offer':
      return SelectOfferToolSchema.parse(value);
  }
}
