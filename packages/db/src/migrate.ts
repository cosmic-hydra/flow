import { createHash } from 'node:crypto';
import { access, readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Database } from './database.js';

async function resolveMigrationsDirectory(): Promise<string> {
  const candidates = [
    fileURLToPath(new URL('../migrations', import.meta.url)),
    fileURLToPath(new URL('./migrations', import.meta.url)),
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next source or bundled-artifact location.
    }
  }
  throw new Error('Database migrations directory is missing from this Flow artifact');
}

export async function migrateDatabase(database: Database): Promise<string[]> {
  const migrationsDirectory = await resolveMigrationsDirectory();
  await database`
    CREATE TABLE IF NOT EXISTS flow_migrations (
      name text PRIMARY KEY,
      checksum char(64) NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  const fileNames = (await readdir(migrationsDirectory))
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort();
  const applied: string[] = [];

  for (const fileName of fileNames) {
    const sqlText = await readFile(`${migrationsDirectory}/${fileName}`, 'utf8');
    const checksum = createHash('sha256').update(sqlText).digest('hex');
    const existing = await database<{ checksum: string }[]>`
      SELECT checksum FROM flow_migrations WHERE name = ${fileName}
    `;
    const migration = existing[0];
    if (migration !== undefined) {
      if (migration.checksum !== checksum) {
        throw new Error(`Applied migration ${fileName} has been modified`);
      }
      continue;
    }

    await database.begin(async (transaction) => {
      await transaction.unsafe(sqlText);
      await transaction`
        INSERT INTO flow_migrations (name, checksum) VALUES (${fileName}, ${checksum})
      `;
    });
    applied.push(fileName);
  }

  return applied;
}
