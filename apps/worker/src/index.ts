import { OpenAIWebCouponResearcher } from '@flow/ai';
import { loadConfig, redactedConfig } from '@flow/config';
import { closeDatabase, createDatabase, migrateDatabase, PostgresFlowStore } from '@flow/db';
import { createProviderRegistry } from '@flow/providers';
import { BookingService, WorkerEngine, type RuntimeLogger } from '@flow/runtime';
import pino from 'pino';

const config = loadConfig();
const logger = pino({
  level: config.server.logLevel,
  redact: {
    paths: ['*.token', '*.accessToken', '*.authorization', '*.cookie'],
    censor: '[REDACTED]',
  },
});
const runtimeLogger: RuntimeLogger = {
  debug: (context, message) => logger.debug(context, message),
  info: (context, message) => logger.info(context, message),
  warn: (context, message) => logger.warn(context, message),
  error: (context, message) => logger.error(context, message),
};
const database = createDatabase(config.database.url);
await migrateDatabase(database);
const store = new PostgresFlowStore(database);
const providers = createProviderRegistry(config);
const couponResearcher = new OpenAIWebCouponResearcher(config.openai);
const bookingService = new BookingService({
  store,
  providers,
  maxCouponAttempts: config.deals.maxCouponAttempts,
  couponResearcher,
  logger: runtimeLogger,
});
const worker = new WorkerEngine({
  store,
  bookingService,
  options: {
    workerId: config.worker.id,
    pollMs: config.worker.pollMs,
    concurrency: config.worker.concurrency,
    leaseSeconds: config.worker.leaseSeconds,
  },
  logger: runtimeLogger,
});

logger.info({ config: redactedConfig(config) }, 'Starting Flow worker');
worker.start();

let shuttingDown = false;
const shutdown = async (signal: string): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down Flow worker');
  await worker.stop();
  await closeDatabase(database);
};
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
