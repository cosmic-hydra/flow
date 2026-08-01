import { loadConfig } from '@flow/config';
import { closeDatabase, createDatabase } from '../database.js';
import { migrateDatabase } from '../migrate.js';
import { PostgresFlowStore } from '../postgres-store.js';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const email = argument('email');
const displayName = argument('display-name') ?? 'Flow user';
const timezone = argument('timezone') ?? 'UTC';
const tokenName = argument('token-name') ?? 'default';
const expiresAt = argument('expires-at');

if (email === undefined) {
  throw new Error(
    'Usage: npm run token:create -- --email user@example.com [--display-name Name] [--timezone UTC]',
  );
}

const config = loadConfig();
const database = createDatabase(config.database.url);

try {
  await migrateDatabase(database);
  const store = new PostgresFlowStore(database);
  const existingRows = await database<Record<string, unknown>[]>`
    SELECT id FROM users WHERE email = ${email.toLowerCase()}
  `;
  const existingId = existingRows[0]?.id;
  const user =
    typeof existingId === 'string'
      ? await store.getUser(existingId)
      : await store.createUser({ email, displayName, timezone });
  if (user === undefined) throw new Error('Unable to create or load user');
  const input: { userId: string; name: string; expiresAt?: string } = {
    userId: user.id,
    name: tokenName,
  };
  if (expiresAt !== undefined) input.expiresAt = expiresAt;
  const token = await store.createApiToken(input);
  console.log('Store this token now; it will not be shown again:');
  console.log(token.token);
} finally {
  await closeDatabase(database);
}
