import { loadConfig } from '@flow/config';
import { closeDatabase, createDatabase } from '../database.js';
import { migrateDatabase } from '../migrate.js';

const config = loadConfig();
const database = createDatabase(config.database.url);

try {
  const applied = await migrateDatabase(database);
  if (applied.length === 0) {
    console.log('Database is up to date.');
  } else {
    console.log(`Applied migrations: ${applied.join(', ')}`);
  }
} finally {
  await closeDatabase(database);
}
