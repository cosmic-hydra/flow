import type { FlowConfig } from '@flow/config';
import { checkDatabase, type Database } from '@flow/db';
import {
  isWebcmdDoctorHealthy,
  parseWebcmdJsonSafe,
  type ProviderRegistry,
  WebcmdRunner,
} from '@flow/providers';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  BOOKING_TOOLKITS,
  initiateConnection,
  isComposioConfigured,
  listAccounts,
  markDemoAccountConnected,
} from '../composio.js';
import { buildSetupCommands, detectOsFromUserAgent } from '../setup.js';

const ConnectAccountSchema = z.object({
  toolkit: z.string().trim().min(1).max(80),
  action: z.enum(['connect', 'demo-link']).default('connect'),
  userId: z.string().trim().min(1).max(120).optional(),
});

const WebcmdRunSchema = z.object({
  args: z.array(z.string().min(1).max(200)).min(1).max(20),
  timeoutMs: z.number().int().positive().max(120_000).optional(),
});

export function registerSystemRoutes(
  app: FastifyInstance,
  input: { config: FlowConfig; database: Database; providers: ProviderRegistry },
): void {
  const webcmd = new WebcmdRunner(input.config.webcmd);

  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health/ready', async () => {
    await checkDatabase(input.database);
    return { status: 'ready' };
  });

  app.get('/v1/providers', { preHandler: app.authenticate }, async () => {
    const providers = await Promise.all(
      input.providers.listAll().map(async (provider) => ({
        id: provider.id,
        name: provider.name,
        capability: provider.capability,
        health: await provider.health(),
      })),
    );
    return { providers };
  });

  app.get('/v1/meta', async () => ({
    name: 'Flow',
    version: '0.1.0',
    authMode: input.config.auth.mode,
    modelConfigured: input.config.openai.apiKey !== undefined,
    composioConfigured: isComposioConfigured(input.config.composio.apiKey),
    webcmdEnabled: input.config.webcmd.enabled,
  }));

  app.get('/v1/setup/status', async (request) => {
    const os = detectOsFromUserAgent(request.headers['user-agent']);
    const commandOs = os === 'unknown' ? 'macos' : os;
    const [webcmdProbe, accounts] = await Promise.all([
      webcmd.probe(),
      listAccounts(input.config.composio.apiKey),
    ]);

    return {
      ok: true,
      os,
      commands: buildSetupCommands(commandOs),
      runtime: {
        node: process.version,
        platform: process.platform,
        ready: true,
      },
      webcmd: {
        enabled: input.config.webcmd.enabled,
        path: input.config.webcmd.path,
        profile: input.config.webcmd.profile,
        available: webcmdProbe.available,
        version: webcmdProbe.version ?? null,
        doctorOk: webcmdProbe.doctorOk,
        message: webcmdProbe.message,
        adapterCount: webcmdProbe.adapterCount ?? null,
      },
      accounts: {
        mode: accounts.mode,
        count: accounts.accounts.length,
        items: accounts.accounts,
      },
      composioConfigured: isComposioConfigured(input.config.composio.apiKey),
      mcp: {
        server: 'Composio',
        tools: [
          'COMPOSIO_SEARCH_TOOLS',
          'COMPOSIO_MANAGE_CONNECTIONS',
          'COMPOSIO_WAIT_FOR_CONNECTIONS',
        ],
        hint: 'In Cursor, enable the Composio MCP server, then ask: “Connect my Gmail with Composio”.',
        snippet: `{
  "mcpServers": {
    "composio": {
      "url": "https://mcp.composio.dev"
    }
  }
}`,
      },
    };
  });

  app.get('/v1/accounts', { preHandler: app.authenticate }, async () => {
    const accounts = await listAccounts(input.config.composio.apiKey);
    return {
      ok: true,
      toolkits: BOOKING_TOOLKITS,
      ...accounts,
    };
  });

  app.post('/v1/accounts', { preHandler: app.authenticate }, async (request) => {
    const parsed = ConnectAccountSchema.parse(request.body);
    if (parsed.action === 'demo-link') {
      const account = markDemoAccountConnected(parsed.toolkit);
      return {
        ok: true,
        mode: 'demo' as const,
        account,
        message: `Linked ${parsed.toolkit} in demo mode.`,
      };
    }
    const result = await initiateConnection(
      parsed.toolkit,
      input.config.composio.apiKey,
      parsed.userId ?? 'flow-default',
    );
    return { ok: true, ...result };
  });

  app.get('/v1/webcmd', { preHandler: app.authenticate }, async (request) => {
    const query = request.query as { action?: string };
    const action = query.action ?? 'status';

    if (action === 'version') {
      const result = await webcmd.runRaw(['--version'], 10_000);
      return { ok: result.ok, result };
    }
    if (action === 'doctor') {
      const result = await webcmd.doctor();
      return {
        ok: isWebcmdDoctorHealthy(result),
        result,
        summary: result.stdout,
        parsed: parseWebcmdJsonSafe(result.stdout) ?? null,
      };
    }
    if (action === 'list') {
      const result = await webcmd.list();
      return {
        ok: result.ok,
        result,
        parsed: parseWebcmdJsonSafe(result.stdout) ?? null,
      };
    }

    const probe = await webcmd.probe();
    return { ok: probe.available, ...probe };
  });

  app.post('/v1/webcmd/run', { preHandler: app.authenticate }, async (request) => {
    const parsed = WebcmdRunSchema.parse(request.body);
    const result = await webcmd.runSafeArgs(parsed.args, parsed.timeoutMs);
    return {
      ok: result.ok,
      result,
      parsed: parseWebcmdJsonSafe(result.stdout) ?? null,
    };
  });
}
