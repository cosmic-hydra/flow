import { CreateBookingSchema, type CreateBookingInput } from '@flow/contracts';
import type { FlowStore } from '@flow/db';
import type { BookingService } from '@flow/runtime';
import {
  GetBookingToolSchema,
  ListBookingsToolSchema,
  SearchBookingToolSchema,
  SelectOfferToolSchema,
  type BookingAgentToolName,
  type ChatToolContext,
  type ChatToolExecutor,
} from '@flow/ai';

export class RuntimeChatToolExecutor implements ChatToolExecutor {
  readonly #store: FlowStore;
  readonly #bookings: BookingService;

  constructor(input: { store: FlowStore; bookings: BookingService }) {
    this.#store = input.store;
    this.#bookings = input.bookings;
  }

  async execute(
    name: BookingAgentToolName,
    argumentsValue: unknown,
    context: ChatToolContext,
  ): Promise<unknown> {
    switch (name) {
      case 'create_booking': {
        const input: CreateBookingInput = CreateBookingSchema.parse(argumentsValue);
        return this.#bookings.createBooking(context.userId, input, context.conversationId);
      }
      case 'search_booking': {
        const input = SearchBookingToolSchema.parse(argumentsValue);
        return this.#bookings.researchBooking(context.userId, input.bookingId);
      }
      case 'get_booking': {
        const input = GetBookingToolSchema.parse(argumentsValue);
        const booking = await this.#store.getBooking(context.userId, input.bookingId);
        if (booking === undefined) throw new Error('Booking not found');
        const offers = await this.#store.listOffers(context.userId, input.bookingId);
        return { booking, offers };
      }
      case 'list_bookings': {
        const input = ListBookingsToolSchema.parse(argumentsValue);
        return this.#store.listBookings(context.userId, input.limit);
      }
      case 'select_offer': {
        const input = SelectOfferToolSchema.parse(argumentsValue);
        return this.#bookings.selectOffer(context.userId, input.bookingId, input.offerId);
      }
    }
  }
}
