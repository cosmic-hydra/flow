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
      composioConfigured: false,
      webcmdEnabled: false,
    });
  });

  it('exposes setup status without authentication', async () => {
    const server = await testApp();
    const response = await server.inject({
      method: 'GET',
      url: '/v1/setup/status',
      headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)' },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      ok: boolean;
      os: string;
      webcmd: { available: boolean };
      mcp: { server: string };
    };
    expect(body.ok).toBe(true);
    expect(body.os).toBe('macos');
    expect(body.mcp.server).toBe('Composio');
    expect(typeof body.webcmd.available).toBe('boolean');
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

  it('allows localhost and 127.0.0.1 as equivalent web origins', async () => {
    const server = await testApp();
    const response = await server.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: { origin: 'http://127.0.0.1:5173' },
    });
    // Development auth still requires store; origin check must pass first.
    expect(response.statusCode).not.toBe(403);
  });
});
