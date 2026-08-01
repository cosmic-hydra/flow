import { CreateApprovalSchema, CreateBookingSchema, UpdateBookingSchema } from '@flow/contracts';
import type { FlowStore } from '@flow/db';
import type { BookingService } from '@flow/runtime';
import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth.js';

export function registerBookingRoutes(
  app: FastifyInstance,
  input: { store: FlowStore; bookings: BookingService },
): void {
  app.get('/v1/bookings', { preHandler: app.authenticate }, async (request) => {
    const user = requireUser(request);
    return { bookings: await input.store.listBookings(user.id) };
  });

  app.post('/v1/bookings', { preHandler: app.authenticate }, async (request, reply) => {
    const user = requireUser(request);
    const body = CreateBookingSchema.parse(request.body);
    const booking = await input.bookings.createBooking(user.id, body);
    reply.code(201);
    return { booking };
  });

  app.get('/v1/bookings/:bookingId', { preHandler: app.authenticate }, async (request) => {
    const user = requireUser(request);
    const { bookingId } = request.params as { bookingId: string };
    const booking = await input.store.getBooking(user.id, bookingId);
    if (booking === undefined) throw app.httpErrors.notFound('Booking not found');
    const [offers, approval, checkout, audit] = await Promise.all([
      input.store.listOffers(user.id, bookingId),
      input.store.getActiveApproval(user.id, bookingId),
      input.store.getBookingCheckout(user.id, bookingId),
      input.store.listAuditEvents(user.id, bookingId, 100),
    ]);
    return { booking, offers, approval, checkout, audit };
  });

  app.patch('/v1/bookings/:bookingId', { preHandler: app.authenticate }, async (request) => {
    const user = requireUser(request);
    const { bookingId } = request.params as { bookingId: string };
    const body = UpdateBookingSchema.parse(request.body);
    const update: Parameters<FlowStore['updateBooking']>[2] = {};
    if (body.intent !== undefined) update.intent = body.intent;
    if (body.automation !== undefined) update.automation = body.automation;
    return { booking: await input.bookings.updateBooking(user.id, bookingId, update) };
  });

  app.post(
    '/v1/bookings/:bookingId/search',
    {
      preHandler: app.authenticate,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request) => {
      const user = requireUser(request);
      const { bookingId } = request.params as { bookingId: string };
      return input.bookings.researchBooking(user.id, bookingId);
    },
  );

  app.post(
    '/v1/bookings/:bookingId/offers/:offerId/select',
    { preHandler: app.authenticate },
    async (request) => {
      const user = requireUser(request);
      const { bookingId, offerId } = request.params as { bookingId: string; offerId: string };
      return { booking: await input.bookings.selectOffer(user.id, bookingId, offerId) };
    },
  );

  app.post(
    '/v1/bookings/:bookingId/approve',
    {
      preHandler: app.authenticate,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request) => {
      const user = requireUser(request);
      const { bookingId } = request.params as { bookingId: string };
      const body = CreateApprovalSchema.parse(request.body);
      return input.bookings.approveBooking(user.id, bookingId, body);
    },
  );

  app.post('/v1/bookings/:bookingId/cancel', { preHandler: app.authenticate }, async (request) => {
    const user = requireUser(request);
    const { bookingId } = request.params as { bookingId: string };
    return { booking: await input.bookings.cancelBooking(user.id, bookingId) };
  });
}
