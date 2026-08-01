import { BookingChatAgent, ChatService, OpenAIWebCouponResearcher } from '@flow/ai';
import { loadConfig, redactedConfig } from '@flow/config';
import { closeDatabase, createDatabase, migrateDatabase, PostgresFlowStore } from '@flow/db';
import { createProviderRegistry } from '@flow/providers';
import { BookingService } from '@flow/runtime';
import { createApp } from './app.js';
import { RuntimeChatToolExecutor } from './chat-tool-executor.js';

const config = loadConfig();
const database = createDatabase(config.database.url);
await migrateDatabase(database);
const store = new PostgresFlowStore(database);
const providers = createProviderRegistry(config);
const couponResearcher = new OpenAIWebCouponResearcher(config.openai);

const bookings = new BookingService({
  store,
  providers,
  maxCouponAttempts: config.deals.maxCouponAttempts,
  couponResearcher,
});
const executor = new RuntimeChatToolExecutor({ store, bookings });
const agent = new BookingChatAgent({ config: config.openai, executor });
const chat = new ChatService({ store, agent });
const app = await createApp({ config, database, store, providers, bookings, chat });

app.log.info({ config: redactedConfig(config) }, 'Starting Flow API');

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, 'Shutting down Flow API');
  await app.close();
  await closeDatabase(database);
};
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ host: config.server.host, port: config.server.port });
