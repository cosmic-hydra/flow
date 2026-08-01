import { loadConfig } from '@flow/config';
import type { FlowStore } from '@flow/db';
import type { Database } from '@flow/db';
import { DemoProvider, ProviderRegistry } from '@flow/providers';
import type { BookingService } from '@flow/runtime';
import type { ChatService } from '@flow/ai';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from './app.js';

let app: FastifyInstance | undefined;

async function testApp(): Promise<FastifyInstance> {
  const config = loadConfig({
    NODE_ENV: 'test',
    FLOW_AUTH_MODE: 'development',
    FLOW_ENABLE_WEBCMD: 'false',
    FLOW_ENABLE_WEB_DEAL_RESEARCH: 'false',
    FLOW_LOG_LEVEL: 'fatal',
  });
  app = await createApp({
    config,
    database: {} as Database,
    store: {} as FlowStore,
    providers: new ProviderRegistry([new DemoProvider()]),
    bookings: {} as BookingService,
    chat: {} as ChatService,
  });
  return app;
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('Flow API shell', () => {
  it('serves liveness and public metadata without authentication', async () => {
    const server = await testApp();
    const live = await server.inject({ method: 'GET', url: '/health/live' });
    const meta = await server.inject({ method: 'GET', url: '/v1/meta' });

    expect(live.statusCode).toBe(200);
    expect(live.json()).toEqual({ status: 'ok' });
    expect(meta.statusCode).toBe(200);
    expect(meta.json()).toMatchObject({
      name: 'Flow',
      authMode: 'development',
      modelConfigured: false,
    });
  });

  it('rejects a cross-origin mutation before authentication or domain work', async () => {
    const server = await testApp();
    const response = await server.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: { origin: 'https://attacker.invalid' },
    });

    expect(response.statusCode).toBe(403);
  });
});
