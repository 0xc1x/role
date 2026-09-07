import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';

export type TestDatabase = PostgresJsDatabase;

export interface TestDbContext {
  db: TestDatabase;
  connectionString: string;
  stop: () => Promise<void>;
}

/** Base del Postgres de test: `docker compose up postgres-test` o CI. */
const BASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgres://postgres:postgres@localhost:6432/role_test';

async function loadInitSql(): Promise<string> {
  const dir = join(__dirname, '..', 'drizzle');
  const entries = await readdir(dir);
  const folder = entries.find((e) => e !== 'meta' && !e.startsWith('.'));
  if (!folder) throw new Error('Sin migraciones en drizzle/');
  const raw = await readFile(join(dir, folder, 'migration.sql'), 'utf8');
  // drizzle-kit pull envuelve el SQL en /* ... */ ("uncomment to run"); lo desenvolvemos.
  const open = raw.indexOf('/*');
  const close = raw.lastIndexOf('*/');
  if (open === -1 || close === -1 || close < open) return raw;
  return raw.slice(0, open) + raw.slice(open + 2, close) + raw.slice(close + 2);
}

const INIT_SQL = loadInitSql();

/**
 * DATABASE fresca por archivo sobre el Postgres de test compartido.
 * DDL generado offline desde el schema Drizzle (`drizzle-kit generate`);
 * Supabase sigue siendo dueño del DDL real — esto solo levanta un espejo.
 */
export async function createTestDb(): Promise<TestDbContext> {
  const base = new URL(BASE_URL);
  const admin: Sql = postgres(BASE_URL, {
    prepare: false,
    max: 1,
    database: 'postgres',
  });

  const dbName = `test_${randomUUID().replaceAll('-', '')}`;
  await admin.unsafe(`CREATE DATABASE "${dbName}"`);
  await admin.end({ timeout: 5 });

  base.pathname = `/${dbName}`;
  const client = postgres(base.toString(), { prepare: false, max: 5 });
  await client`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
  // El espejo de test corre en postgres pelado: sin auth/PostGIS ni roles de
  // Supabase. Policies, grants y FKs enteras a auth.users se descartan; las
  // FKs inline dentro de CREATE TABLE pierden solo el REFERENCES (la columna
  // queda). geog ya se excluyó del baseline a mano (memoria workflow DDL).
  const parts = (await INIT_SQL).split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter(
      (s) =>
        !/CREATE\s+POLICY|^\s*GRANT\s|^\s*REVOKE\s|auth\.(uid|jwt|role)\(/i.test(
          s,
        ),
    )
    .filter(
      (s) => !/ADD CONSTRAINT[^;]*REFERENCES\s+"?auth"?\."?users"?/i.test(s),
    )
    .map((s) =>
      s.replace(/\s*REFERENCES\s+"?auth"?\."?users"?\s*\([^)]*\)/g, ''),
    );
  for (let i = 0; i < parts.length; i += 25) {
    await client.unsafe(parts.slice(i, i + 25).join(';\n'));
  }

  const db: TestDatabase = drizzle({ client });
  let stopped = false;
  return {
    db,
    connectionString: base.toString(),
    stop: async () => {
      if (stopped) return;
      stopped = true;
      const killer: Sql = postgres(BASE_URL, {
        prepare: false,
        max: 1,
        database: 'postgres',
      });
      await client.end({ timeout: 5 });
      await killer.unsafe(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${dbName}'`,
      );
      await killer.unsafe(`DROP DATABASE "${dbName}"`);
      await killer.end({ timeout: 5 });
    },
  };
}
