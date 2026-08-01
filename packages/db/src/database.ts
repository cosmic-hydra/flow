import postgres, { type Sql } from 'postgres';

export type Database = Sql<Record<string, unknown>>;

export function createDatabase(databaseUrl: string): Database {
  return postgres(databaseUrl, {
    max: 20,
    idle_timeout: 20,
    connect_timeout: 10,
    max_lifetime: 60 * 30,
    prepare: true,
    onnotice: () => undefined,
  });
}

export async function checkDatabase(database: Database): Promise<void> {
  await database`SELECT 1 AS ok`;
}

export async function closeDatabase(database: Database): Promise<void> {
  await database.end({ timeout: 5 });
}
