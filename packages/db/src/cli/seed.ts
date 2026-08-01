import { loadConfig } from '@flow/config';
import { closeDatabase, createDatabase } from '../database.js';
import { migrateDatabase } from '../migrate.js';
import { PostgresFlowStore } from '../postgres-store.js';

const config = loadConfig();
const database = createDatabase(config.database.url);

try {
  await migrateDatabase(database);
  const store = new PostgresFlowStore(database);
  const user = await store.ensureDevelopmentUser();
  console.log(`Development user ready: ${user.email} (${user.id})`);
} finally {
  await closeDatabase(database);
}
