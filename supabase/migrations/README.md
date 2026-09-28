# Supabase migrations

Migration history for the Rolé database, tracked in git so the schema is
reviewable and reproducible.

The Supabase ledger (`supabase_migrations.schema_migrations`) stores the SQL of
every applied migration in its `statements` column, so the historical files here
were reconstructed byte-for-byte from it. Every one of the 78 files below the
`20260925*` block was verified with `md5sum` against `md5(statements[1])` from
the database. None of them has been reformatted, and no trailing newline was
added to any file that did not already have one.

## Six migrations are deliberately absent

This repository is public. These six embed a live credential in their SQL, and
committing them would publish it permanently and irreversibly — git history is
not something a later rotation can take back.

| Version | Name | Contains |
| --- | --- | --- |
| `20260507195823` | `insert_seed_auth_users_and_profiles` | `encrypted_password` with `crypt(...)`: bcrypt hashes of seed auth users |
| `20260615210819` | `add_order_event_push_trigger` | the Supabase anon JWT as a literal |
| `20260616005903` | `update_order_event_push_to_notify_func` | the Supabase anon JWT as a literal |
| `20260622140156` | `fix_trigger_to_use_handle_order_event` | the Supabase anon JWT as a literal |
| `20260821213650` | `move_pg_net_and_tighten_rpc` | the Supabase anon JWT as a literal |
| `20260821213748` | `fix_handle_order_event_push_net_schema` | the Supabase anon JWT as a literal |

The JWT is the project's anon key. It was rotated out of the database during
the `20260925163235` hardening and now lives only in Vault under
`supabase_anon_key`, so publishing these files would republish a credential that
is already dead. The seed password hashes are permanent regardless of rotation.

### Restoring them safely

Do not add these files as-is. The credential-bearing statements they perform
were all replaced downstream:

- The anon key and the internal dispatch secret are read from
  `vault.decrypted_secrets` by `public.invoke_internal_edge_function()` and
  verified by `public.internal_dispatch_secret_matches()`. See
  `20260925163235`, `20260925170147`, `20260925173639` and `20260925175051`.
- Seed credentials must be supplied out of band, never committed.

If the exact historical text is needed for an audit, read it from the ledger
directly:

```sql
select statements[1] from supabase_migrations.schema_migrations
where version = '20260615210819';
```

`rollback` statements are also stored per migration, so down-migrations are
recoverable the same way.

## The `20260925*` files are not byte-identical to what was applied

Eight of the nine hardening migrations in this directory differ from the
`statements` value in the ledger. The files here are the reviewed, documented
versions written before applying; the database received equivalent SQL sent
through the Supabase MCP. Only `20260925165931_offer_stock_write_grant.sql` is
byte-identical.

**The practical consequence: the local versions have never been executed.** They
are semantically equivalent and are what `supabase db push` would replay on a
fresh project, but equivalence was reasoned about, not proven. Before trusting
this directory to rebuild an environment, replay it on a disposable Supabase
branch and let the database be the judge.

The most recent divergence is a good illustration. `20260925163235` shipped a
dispatcher that passed its HTTP header map as
`params := jsonb_build_object('headers', ...)`, but pg_net's `params` is the
query string — the map shipped as a query parameter and no header was ever
attached. The file on disk here contains that defect. `20260925175051` is the
fix, and it supersedes the earlier file. Replaying the chain in order does
produce a working database; skipping to the latest file does not.

## How to apply a migration

Always through `apply_migration`. Never `execute_sql`, never the Supabase
dashboard, never psql against the project. Then:

1. Read back the server-assigned version:
   `select version, name from supabase_migrations.schema_migrations where name = '<snake_case_name>';`
2. Rename the file to `<that version>_<that name>.sql`. The server assigns the
   version, not you; the file must carry the version the ledger recorded.
3. Prove the file is what ran: `md5sum <file>` must equal
   `select md5(statements[1]) ... where version = '<that version>'`.

Step 3 is the only check that distinguishes "committed" from "applied". Two
migrations here have now been repaired after being applied out-of-band, and
the symptom in both cases was identical: a fix that was correct, tested, and
committed, and a database that never received it.

## Repaired: an accidental data change, reverted and recorded here (2026-09-28)

**This one has no migration file, on purpose.** A verification query I wrote to
prove the new moderation gate worked contained an `UPDATE` inside a data-modifying
CTE. In PostgreSQL a data-modifying CTE is not a dry run — it executes. The query
was meant to observe what `active_businesses_near` returned for a business under
review and instead set that business to `approved`.

The blast radius was larger than the column I typed, because `business_moderation`
carries three triggers and an approval fires all of them:

- `sync_business_verification` (BEFORE) set `verified_at = now()`.
- `apply_business_verification_state` (AFTER) set `businesses.is_active = true`.
- `notify_business_verification` (AFTER) **inserted a `business-approved` email
  into `email_sends` with status `pending` and `attempts = 0`**, addressed to the
  owner. It had not been sent. It was the most urgent part of the repair and also
  the most likely to be missed, because a queued email looks identical to a
  legitimate one in every table you would think to check.

Repair, in the order that mattered:

1. Deleted the queued `email_sends` row (`b5330ef3-…`, `pending`, `attempts = 0`).
2. Set the row back to `pending` with `verified_at = null`, which fires
   `apply_business_verification_state` and so restored `businesses.is_active = false`.
   The notify trigger was not a risk for the revert: it only acts on `approved` and
   `rejected`, so `pending` inserts nothing.

**The prior status was not `pending` by luck, it was reconstructed from evidence.**
The `UPDATE` destroyed `verified_at`, so the direct evidence was gone. What
settled it is `rejection_reason` still being null: the rejection path always
records one — the notify function itself writes
`coalesce(NEW.rejection_reason, 'No especificado')` when it queues a rejection
email — so a business that had been rejected could not have an empty reason. The
row was pending, and it is pending again. If that reasoning is ever in doubt,
check it against this paragraph rather than assuming.

Final state: `Cevicheria Falsa` is `pending`, `is_active = false`, `verified_at`
null, `updated_at` back to its original `2026-09-02 00:48:47.948573+00` (the
revert did not touch it, because the BEFORE trigger only rewrites `verified_at`),
zero queued emails from the window, and the moderation split back to 14 approved /
2 pending.

**Recorded here rather than in a migration file** because a file named after this
would put "put a business back to pending" in the permanent schema history, and
because the rule this directory exists to enforce — every DDL change enters
through `apply_migration` and is proven with `md5sum` — is about DDL. This was
data, not schema, and pretending otherwise would have been the same class of
mistake in a new place.

**The lesson is about the query, not the trigger.** Reading a "before" value by
running an `UPDATE` and observing what the query returns is a reasonable-sounding
idiom and a data write. Any verification query here must be a `SELECT`, and
anything that mutates has to be a separate statement whose effect is stated in
advance.

## Repaired: migrations applied without touching the ledger

`businesses_client_write_grants` restored the client write path on
`public.businesses` after `20260925163235` ran `revoke all` and never gave the
grants back. Every owner action in the mobile business panel was failing with
`42501 permission denied for table businesses`.

The SQL was executed directly. Its effects were real and are still in the
database — the column grants, and the `trg_set_business_owner_from_jwt` and
`trg_default_business_inactive` triggers — but the ledger had no row for it, so
the migration directory did not describe the database and `supabase db push`
would have replayed it against a live project as if it had never run. It has
since been applied through `apply_migration` (idempotent: `create or replace
function`, `drop trigger if exists`, `grant`) and recorded as
`20260926010336_businesses_client_write_grants`.

**The failure was not the SQL.** It was writing to the database through a path
that leaves no evidence, and then trusting a commit as proof of application.
When a fix seems not to work, read the ledger before re-writing the fix.

## Applied: `20260926212729_email_sends_redact_legacy_error_message`

A destructive backfill. It rewrote all 15 historical `email_sends.error_message`
values that still held raw Resend provider text into the fixed marker
`Error:legacy_redacted`; after it, zero rows in the table carry raw provider
text. It changed no column, no schema, and no API.

**The forensic archive exists.** The migration is irreversible, so the affected
rows (`id`, `created_at`, `error_message`) were exported to
`~/.local/share/role-archives/email_sends_error_message_20260926T212654Z.csv`
(mode `600`, outside the repository so it can never be committed) BEFORE the
migration ran. It is the only copy of the original text.

**The SQL file still says "NOT APPLIED" in its header, and that is deliberate.**
Editing it would change its bytes and break the `md5sum` equality that is the
only proof of what ran. The file is the statement the server stored, verbatim —
do not reformat it, do not add a trailing newline, and record future status
changes here rather than in the SQL. This applies to every file in this
directory.

Note that `length(statements[1])` reports 5626 while the file is 5639 bytes:
`length()` counts characters, and the header contains em dashes and accented
Spanish. The `md5sum` check is the authoritative one, and it matches.

## Verifying this directory against the database

```sh
# every historical file should report OK
cd supabase/migrations
md5sum -c <(psql "$DATABASE_URL" -At -F' ' -c \
  "select md5(statements[1]), version || '_' || name || '.sql'
     from supabase_migrations.schema_migrations
    where version < '20260925'")
```

`length()` is not a valid substitute: it counts characters, so any file with
accents or em dashes differs in bytes without being wrong.

## Applied: `20260927021015_reviews_moderation_soft_hide`

Soft-hide moderation for `public.reviews`: five columns (`is_hidden`,
`moderated_at`, `moderated_by`, `hidden_reason`, `moderation_reason`), four
CHECK constraints, four indexes, the replacement of the `"Anyone can view
reviews"` SELECT policy, column-level UPDATE grants, and a whole-body rewrite of
`update_business_rating` / `update_offer_rating` so a hidden review leaves the
public average. Applied through `apply_migration` on 2026-09-27. No backfill: all
19 existing reviews read `is_hidden = false` and nothing was deleted.

**This file is NOT byte-identical to what the ledger holds, and that is
documented rather than repaired.** One word inside one SQL comment differs:

| | text |
| --- | --- |
| file on disk | `businesses/oferts row` |
| ledger `statements[1]` | `businesses/offers row` |

`md5sum` of the file is `fb6757485108cda55259792b3ecf6104`; the ledger's is
`d527a5343579760062c81e4a65633fb6`. Both are exactly 17981 bytes, which is why
the length check passed and only the md5 caught it — the substitution is the
same length, so a byte count cannot see it.

The difference is proven to be exactly that and nothing else: substituting that
one word in the file reproduces the ledger's md5 bit for bit. Every byte of DDL
is identical; the divergence is one English word where the Spanish table name
`oferts` was intended, inside a `--` comment.

**The file was deliberately NOT edited to match the ledger.** Editing it would
have imported the typo into the reviewed source and would have moved the file
further from the only proof of what ran. The file stays the reviewed version, the
ledger stays the statement the server stored, and the gap is recorded here —
the same treatment the `20260925*` files above already have.

