/**
 * Ledger diagnostic. Answers "can `supabase/migrations/` be applied to a plain
 * PostGIS container, and if not, what exactly is missing?" — and prints the
 * drift against the pinned debt.
 *
 * Run: bun test/spike-rls.mjs
 *
 * This used to hold its own copy of the replay loop. That was a second
 * implementation of the same thing, and two implementations of a ledger
 * replay will disagree: this one reported 25 failures where the harness
 * reported 7, because only the harness ran one transaction per migration file
 * the way `apply_migration` does. It is now a thin wrapper so there is exactly
 * one replay to be right.
 *
 * The real gate is `categories.rls.db.spec.ts`, which asserts the failure set.
 * This script is for the times you are CHANGING the ledger and need the whole
 * catalogue rather than a pass/fail.
 */
import postgres from 'postgres';
import {
  diffReplayFailures,
  KNOWN_REPLAY_FAILURES,
  ledgerFingerprint,
  migrationFiles,
  replayMigrations,
  SUPABASE_PLATFORM_BOOTSTRAP,
} from './supabase-platform.ts';

const BASE =
  process.env.TEST_DATABASE_URL ??
  'postgres://postgres:postgres@localhost:6432/role_test';
const DB = process.env.SPIKE_DB ?? 'spike_rls';

const admin = postgres(BASE, { prepare: false, max: 1, database: 'postgres' });
await admin.unsafe(`drop database if exists "${DB}" with (force)`);
await admin.unsafe(`create database "${DB}"`);
await admin.end({ timeout: 5 });

const url = new URL(BASE);
url.pathname = `/${DB}`;
const db = postgres(url.toString(), { prepare: false, max: 1, onnotice: () => {} });

let bootFailed = 0;
for (const [i, s] of SUPABASE_PLATFORM_BOOTSTRAP.entries()) {
  try {
    await db.unsafe(s);
  } catch (e) {
    bootFailed++;
    console.log(
      `BOOTSTRAP FAIL [${i}] ${e.message.slice(0, 140)}\n   ${s.split('\n')[0].slice(0, 80)}`,
    );
  }
}
console.log(
  `bootstrap: ${SUPABASE_PLATFORM_BOOTSTRAP.length - bootFailed}/${SUPABASE_PLATFORM_BOOTSTRAP.length} ok`,
);
console.log(`fingerprint: ${ledgerFingerprint().slice(0, 16)}\n`);

const r = await replayMigrations(db);
const total = migrationFiles().length;
console.log(
  `statements aplicados: ${r.applied}/${r.applied + r.failures.length}`,
);
console.log(`migraciones limpias: ${total - r.failures.length}/${total}\n`);
console.log(`fallos: ${r.failures.length}\n`);

for (const f of r.failures) {
  console.log(`── ${f.file}`);
  console.log(`   ${f.msg}`);
}
console.log();

console.log(`omitidos a proposito: ${r.skipped.length}`);
for (const s of r.skipped) console.log(`   ${s.file}  — ${s.reason}`);
console.log();

const drift = diffReplayFailures(r.failures);
if (drift.length === 0) {
  console.log(
    `sin drift: los ${KNOWN_REPLAY_FAILURES.length} fallos conocidos son los pineados`,
  );
} else {
  console.log('DRIFT contra la deuda pineada:');
  for (const d of drift) console.log(`   ${d}`);
}

const state = await db.unsafe(
  `select
     (select count(*)::int from pg_policies where schemaname = 'public') as policies,
     (select count(*)::int from pg_tables where schemaname = 'public' and rowsecurity) as rls_tables,
     (select count(*)::int from pg_tables where schemaname = 'public') as tables`,
);
console.log('\nestado final:', JSON.stringify(state[0]));

await db.end({ timeout: 5 });
