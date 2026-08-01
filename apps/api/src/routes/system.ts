import type { FlowConfig } from '@flow/config';
import type { Database } from '@flow/db';
import { checkDatabase } from '@flow/db';
import type { ProviderRegistry } from '@flow/providers';
import type { FastifyInstance } from 'fastify';

export function registerSystemRoutes(
  app: FastifyInstance,
  input: { config: FlowConfig; database: Database; providers: ProviderRegistry },
): void {
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
  }));
}
