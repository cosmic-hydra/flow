import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FlowConfig } from '@flow/config';
import { DomainError } from '@flow/core';
import type { Database, FlowStore } from '@flow/db';
import type { ChatService } from '@flow/ai';
import { ProviderError, type ProviderRegistry } from '@flow/providers';
import type { BookingService } from '@flow/runtime';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { registerAuthentication } from './auth.js';
import { registerBookingRoutes } from './routes/bookings.js';
import { registerConversationRoutes } from './routes/conversations.js';
import { registerSystemRoutes } from './routes/system.js';

export async function createApp(input: {
  config: FlowConfig;
  database: Database;
  store: FlowStore;
  providers: ProviderRegistry;
  bookings: BookingService;
  chat: ChatService;
}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: input.config.server.logLevel,
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers.set-cookie',
          '*.token',
          '*.accessToken',
        ],
        censor: '[REDACTED]',
      },
    },
    bodyLimit: 1_048_576,
    requestTimeout: 120_000,
    trustProxy: input.config.environment === 'production',
  });
  await app.register(sensible);
  await app.register(cookie, {
    hook: 'onRequest',
    ...(input.config.auth.sessionSecret === undefined
      ? {}
      : { secret: input.config.auth.sessionSecret }),
  });
  await app.register(cors, {
    origin: input.config.server.webOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Flow Booking API',
        description: 'Approval-safe AI booking and deal optimization API',
        version: '0.1.0',
      },
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  app.addHook('onRequest', async (request) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
    const origin = request.headers.origin;
    if (origin !== undefined && origin !== input.config.server.webOrigin) {
      throw app.httpErrors.forbidden('Cross-origin mutation denied');
    }
  });

  registerAuthentication({ app, store: input.store, config: input.config });
  registerSystemRoutes(app, {
    config: input.config,
    database: input.database,
    providers: input.providers,
  });
  registerConversationRoutes(app, { store: input.store, chat: input.chat });
  registerBookingRoutes(app, { store: input.store, bookings: input.bookings });

  app.setErrorHandler((error, request, reply) => {
    const requestId = request.id;
    if (error instanceof ZodError) {
      void reply.code(400).send({
        error: {
          code: 'validation_error',
          message: 'Request validation failed',
          requestId,
          details: error.issues,
        },
      });
      return;
    }
    if (error instanceof DomainError) {
      const statusCode = error.code.endsWith('_not_found') ? 404 : 409;
      void reply.code(statusCode).send({
        error: { code: error.code, message: error.message, requestId, details: error.details },
      });
      return;
    }
    if (error instanceof ProviderError) {
      void reply.code(error.retryable ? 503 : 422).send({
        error: { code: error.code, message: error.message, requestId, details: error.details },
      });
      return;
    }
    const statusCode =
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof error.statusCode === 'number'
        ? error.statusCode
        : 500;
    const message = error instanceof Error ? error.message : 'Request failed';
    if (statusCode >= 500) request.log.error({ err: error }, 'Request failed');
    void reply.code(statusCode).send({
      error: {
        code: statusCode >= 500 ? 'internal_error' : 'request_error',
        message: statusCode >= 500 ? 'An unexpected error occurred' : message,
        requestId,
      },
    });
  });

  return app;
}
