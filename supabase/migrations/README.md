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
