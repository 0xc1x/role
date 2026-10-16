# Supabase migrations

Migration history for the Rolé database, tracked in git so the schema is
reviewable and reproducible.

The Supabase ledger (`supabase_migrations.schema_migrations`) stores the SQL of
every applied migration in its `statements` column, so the historical files here
were reconstructed byte-for-byte from it. Every one of the 78 files below the
`20260925*` block was verified with `md5sum` against `md5(statements[1])` from
the database. None of them has been reformatted, and no trailing newline was
added to any file that did not already have one.

> **Do not "fix" the missing final newline.** Several files in this directory —
> including `20261015031154_shared_ttl_expiry_accounting.sql` and the four
> migrations applied alongside it — end on their last character with **no trailing
> newline**. That is deliberate and load-bearing, not an oversight: it is exactly
> what makes `md5sum <file>` equal `md5(statements[1])` in the ledger. A formatter
> run, an editor with "insert final newline", or a well-meaning cleanup commit will
> desync the file from the ledger by one byte, and the environment stops being
> reproducible — `supabase db push` would then reproduce a history that did not
> happen. If you touch one of these files, re-check
> `md5sum <file>` against `md5(statements[1])` before committing, and re-add the
> newline only if the file was *not* applied through `apply_migration`.

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

Eleven of the twelve `20260925*` hardening migrations in this directory differ
from the `statements` value in the ledger. The files here are the reviewed,
documented versions written before applying; the database received equivalent SQL
sent through the Supabase MCP. Only `20260925165931_offer_stock_write_grant.sql`
is byte-identical. (This section said "eight of the nine" when it was written;
the block has grown by three files since, and the count was not revisited.)

**The practical consequence: the local versions have never been executed.** They
are what `supabase db push` would replay on a fresh project, but equivalence was
reasoned about, and the reasoning has now been **disproved** — see the next
section, which is the more important half of this page.

The most recent divergence is a good illustration. `20260925163235` shipped a
dispatcher that passed its HTTP header map as
`params := jsonb_build_object('headers', ...)`, but pg_net's `params` is the
query string — the map shipped as a query parameter and no header was ever
attached. The file on disk here contains that defect. `20260925175051` is the
fix, and it supersedes the earlier file. Replaying the chain in order does
produce a working database; skipping to the latest file does not.

## The `20260925*` divergence is not cosmetic, and it broke three migrations

This is the finding that matters on this page, and it was found by replaying the
directory rather than by reading it.

`20260927025753_businesses_drop_sensitive_columns.sql` rewrites ten functions in
place by locating literal text in `pg_get_functiondef` and aborting if a literal
is absent. Its search strings are single lines:

```sql
'select commission_rate into v_commission_rate from public.businesses where id=v_offer.business_id;'
'b.verification_status=''approved'''
```

That file is **byte-identical to the ledger** (md5
`31607cd05ddc60a962c582c2c2223ed3`), so those literals are exactly what
production ran, and in production they matched. Two files in this directory that
recreate those function bodies do not:

| file | ledger md5 | what the ledger holds | what this directory held |
| --- | --- | --- | --- |
| `20260925155433` | `57b55f217ebe259d372de2555ab93dc8` | the tight one-liners | pretty-printed, one clause per line |
| `20260925163235` | `61c2a13f3bb83394e8a2d6e9fcc669d2` | `verification_status='approved'` | `verification_status = 'approved'` |

A cosmetic reformat is a semantic no-op to Postgres and a **hard failure** to a
literal-matching guard. Verified against the ledger text rather than assumed:

```sql
-- 20260925155433
select statements[1] ~ 'select commission_rate into v_commission_rate from public\.businesses where id=v_offer\.business_id;'  -- t
select statements[1] ~ 'select commission_rate\s+into v_commission_rate\s+from public\.businesses\s+where id = v_offer\.business_id;' -- f
```

**Both files were corrected, in place, toward the ledger** — the literals the
guards need were restored to the exact characters the ledger holds, and nothing
else in either file was touched. They still do not match the ledger
(`a87cb10a6034f99f92c34c6b6dc7a75a` and
`c9272d3941829bdd57bd6c025788ea4d`), because the rest of the reformatting is
still there. That is deliberate: the repair direction is the one production
dictates, and a partial edit toward the ledger is strictly closer to it than the
file was.

**This is not the same as editing a file that matches the ledger.** A file whose
md5 equals `md5(statements[1])` is the proof of what ran, and editing it destroys
that proof — which is why `20260906125927` was left alone when it failed, and why
its failure was closed in the harness instead. These two files were already
divergent; moving them toward the ledger cannot lose evidence.

> **Actualizado el 2026-10-05: el párrafo anterior quedó viejo.** Los dos
> archivos se corrigieron después **hasta** el ledger, no solo hacia él. Hoy
> `md5sum` da `6ff3cb80b9331a6c1d06384d42bd68f2` para `20260925155433` y
> `a98a9fc7e71a62850dc30fd5bc2a05ea` para `20260925163235`, que es exactamente lo
> que devuelve `md5(statements[1])` del ledger para ambas. Es decir: los dos
> archivos coinciden byte a byte con lo que production corrió, y el resto del
> reformateo ya no está.
>
> Se verificó las 24 migraciones de la ventana `20260925155153`–`20260927164628`
> con `md5sum -c` contra el ledger: **24 de 24 coinciden**. La deuda de
> reproducibilidad que este README describía para esa ventana está cerrada. Ver
> `docs/security-debt.md` §2.

### The divergence is semantic, and the next fidelity gap

> **Actualizado el 2026-10-05: esta tabla comparaba cosas distintas y la
> diferencia no era una brecha.** La columna "replay" era el hash del cuerpo que
> `20260925155433` creaba; la columna "production" es el hash del cuerpo que hay
> **hoy** en la base. Y el cuerpo de hoy ya no es el de esa migración:
> `20260927025753_businesses_drop_sensitive_columns` (fase 3 del split de
> `businesses`) reescribe `reserve_offer` para leer `commission_rate` de
> `business_finance`. Verificado en la base el 2026-10-05:
>
> ```sql
> select p.proname,
-- Esperado: true solo para reserve_offer, que es la que la fase 3 reescribio.
>   (p.prosrc like '%public.business_finance%') as lee_finance
>   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
>  where n.nspname = 'public'
>    and p.proname in ('reserve_offer', 'notify_business_pending');
> --  reserve_offer           | t
> --  notify_business_pending | f
> ```
>
> Es decir: comparar el archivo de `20260925155433` contra la base de hoy mide la
> diferencia entre "lo que esa migración creó" y "lo que una migración posterior
> reemplazó", que es lo esperado, no una infidelityidad del archivo. Como el
> md5 del archivo coincide con `md5(statements[1])` del ledger, el replay de esa
> migración produce exactamente lo que production recibió en su momento.
>
> La tabla y los dos párrafos que la siguen se conservan tal cual estaban, como
> registro del hallazgo original.

Whitespace is not the whole story, and it is worth not pretending otherwise.
Comparing the replayed function bodies against the live database with **all**
whitespace stripped still does not match:

| function | replay | production |
| --- | --- | --- |
| `reserve_offer(uuid,uuid,uuid,text)` | `07e070b5f9a39f200bdec6ec2adb9c12` | `550e53b7d60c069166c827f69787637d` |
| `notify_business_pending()` | `61d1d1dc2172bc919b230b1e78a045b7` | `0ea2c908b1aa70d8f44e6069cf2b16e4` |

```sql
select p.proname, md5(regexp_replace(p.prosrc, '\s+', '', 'g'))
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'reserve_offer';
```

So the `20260925*` block is **not** semantically equivalent to what production
received, which is the thing the previous version of this section asserted and
could not support. The harness now reproduces production's `businesses` shape
exactly — 16 columns, `trg_bootstrap_business_companions` installed, every owner
policy resolving through `business_ownership`, and the two grant facts from
`20260906125927` matching the live database one for one — but these two function
bodies do not match. Closing that means reconstructing all eleven divergent files
byte-for-byte from the ledger, which would discard the reviewed documentation in
them. It is a deliberate, separate decision and it has not been taken.

## The ledger does not describe the database: four `app_config` values

`20260927141336_confirm_admin_domain.sql` sets `links.admin_url` and then
asserts that **no** non-social `app_config` value still contains `role.app`. It
fails on a fresh replay, and it is byte-identical to the ledger
(`78dd39c9c15c52da9dd3be4b71f7bfe5`), so it is exactly what ran.

Four of the five keys it names are moved by **no row in the ledger**, the one on
the live project included:

```sql
select version from supabase_migrations.schema_migrations
 where statements[1] like '%soporte@role.ec%'
    or statements[1] like '%hola@role.ec%'
    or statements[1] like '%legal@role.ec%';
-- 0 rows
```

`20260821205638` seeds them as `role.app`; `20260830014803` inserts only
`email.from` and `contact.cities`; `20260926021657` touches
`email_templates.body_html` and never `app_config`; `20260927053728` moves
`privacy.contact_email` and nothing else. The live database holds all five as
`role.ec`:

```
contact.hola_email      = "hola@role.ec"
contact.negocios_email   = "negocios@role.ec"
legal.contact_email     = "legal@role.ec"
privacy.contact_email   = "privacidad@role.ec"
support.email           = "soporte@role.ec"
```

So those values were changed on the live project by a write path that left no
ledger row — the same class of gap as the `cancel_order` arity-2 drop that
`20260906131000` documents, and the same consequence: **`supabase db push` against
production would fail on `20260927141336`.**

The fix is a data migration recorded in the ledger, and it is deliberately NOT
written here. This directory may not gain a file claiming to be history that did
not happen, and it may not be applied to production from a test harness.

One correction to a claim made while investigating this, because the file itself
is easy to misread: `20260926021657`'s header does **not** say it moved eight
`app_config` values. It says eight values *agree* on `role.ec` and cites them as
the reason the template bodies are wrong. What it does claim, in its last line —
"A fresh environment replays the wrong value and then this one corrects it" — is
false, and that sentence is the actual defect.

## `20260906125927` and `20260906130017` are applied out of version order

`20260906125927_harden_rpc_grants.sql` revokes EXECUTE on
`public.cancel_order(uuid, uuid, uuid)`, and a `REVOKE ... ON FUNCTION` with a
signature that does not resolve raises `42883`. The file is byte-identical to the
ledger (`dac0889de56742d5b536806a0ae3fbad`) and the ledger holds a row for it, so
it succeeded — which means the arity-3 signature already existed. The only
migration here that creates it is `20260906130017`, and `CREATE OR REPLACE` keys
on identity argument types, so the arity-2 definition left by `20260829005426`
cannot have satisfied it.

**`130017` was therefore applied before `125927`**, and `125927`'s version
records when it was authored rather than when it ran. The ledger has no
timestamp column, so the inversion cannot be observed directly — it is provable
only from the dependency.

The harness records this as an audited inversion
(`APPLICATION_ORDER_OVERRIDES` in `apps/api/test/supabase-platform.ts`) and
replays that one pair in the order production used. The result is verified
against the live database rather than assumed: all seven grant facts that
`125927` establishes — `anon` EXECUTE on `reserve_offer` and `cancel_order`,
`authenticated` EXECUTE on `cancel_order` and `validate_pickup_code`, the
revokes on `notify_business_pending` and `get_platform_stats`, and
`sync_business_verification`'s `search_path` — match it one for one.

## The two seed migrations cannot replay, and closing them would be worse

`20260507200106` and `20260507200508` fail on foreign keys, and the reason is not
the one the constraint name suggests. The chain is

```
businesses.owner_id -> public.profiles(id) -> auth.users(id)
```

so satisfying it needs THREE things the repository does not have: the four
`b0000000-*` user ids (which the seed file itself carries literally), a
`public.profiles` row per id, and — because `profiles.email` is `NOT NULL` and
`profiles.role` is `NOT NULL DEFAULT 'user'` — an invented email and an invented
role. The rows that would supply them lived in `20260507195823`, which is a
documented `select 1;` because the original embedded bcrypt hashes.

Production holds 22 users and 20 profiles, including exactly four
`b0000000-*` users. Inventing the rest would not help anyway:
`trg_bootstrap_business_companions` is created by `20260927025753`, which runs
**after** both seeds, so seeded businesses would land with no
`business_ownership` row — while production holds 16 businesses and 16
`business_ownership` rows, a strict 1:1 invariant. Forcing the seeds to apply
would trade a loud, correct failure for a silent state production has never
been in, on the one table the harness exists to measure. Seed credentials are
operator data and are supplied out of band.

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

## Applied: `20261015001857_staff_permission_helpers`

Applied via `apply_migration` on 2026-10-15. The file's `md5sum` is
`61d0c80d952178d21f013dba03d6f252` and that is also the ledger's
`md5(statements[1])`: byte for byte. It creates the four permission functions of
spec §5.1 — `business_member_role`, `can_manage_location`, `business_has_feature`
and `business_member_session_state` — all `stable security definer` with
`search_path` pinned to `''`, all `revoke all … from public, anon`, bodies fully
qualified because the search path is empty.

**Two of the three migrations that finish this work are supersessions of this one,
and that is on purpose.** `20261015003929_business_member_permission_hardening`
and `20261015012253_business_member_session_disabled_reason` re-create all four
functions with `create or replace`. A superseded body is not an accident to be
tidied: each of those two migrations fixed a finding that a review measured
against the live database, and the sealed file that shows what was applied *at
that moment* is the only proof of which body was in effect when. Three files, one
final state.

**The ledger has one row for this work that this directory does not have.** See
the section immediately below.

## Applied: `20261015015012_business_members_policies`

Applied via `apply_migration` on 2026-10-15. The file's `md5sum` is
`d7b8364ec8fda2908caf20156b8c7041` and that is also the ledger's
`md5(statements[1])`: byte for byte, no trailing newline added.

It is step 5 of the §6.2 order and the first half of it: **25 new policies** — the
23 `TO authenticated` business policies, one of which is the self-read on
`business_members`, plus the two owner/manager reads of `business_members` and
`business_member_locations` — and three functions recreated with `create or
replace`: `cancel_order`, `set_order_status` and `validate_pickup_code`.

**Nothing was dropped, and that is the point, not an omission.** All **19**
policies that still resolve ownership through `business_ownership` are in place and
unchanged, and the table itself is untouched. The §6.2 order is new-first,
old-second, and the retirement — `drop table public.business_ownership` — is a
separate migration that has not been written. `business-members.rls.db.spec.ts`
pins the residue by name, so the drop surfaces as a **19-element array** failing in
three spec files — `business-members`, `businesses` and `orders` — plus the write
and read assertions that quote those policy names, not as a one-line diff. That is
deliberate: a count would pass with three policies moved somewhere else, and the
whole value of pinning them by name is that the diff shows *which* one changed. A
hand-written policy in the meantime shows up in the same place.

**The grants on the three recreated functions are unchanged, and that was measured
rather than assumed.** The brief for this task stated that `anon` holds EXECUTE on
`cancel_order` and `reserve_offer`; it does not, in the live database or in the
replayed one. `20260906125927_harden_rpc_grants` removed it and the ledger says so
— the roles that can execute the four order RPCs are `postgres`, `authenticated`
and `service_role`. The first is there only because it owns the functions, and it is
not an HTTP role. What matters is the negative: **`anon` holds nothing on any of the
four**, and the ACL is an explicit grant list rather than the implicit `PUBLIC`
default. The migration therefore carries **not one** `grant` or `revoke`
for those functions: `create or replace` preserves the ACL on its own, and a
`drop` + `create` would have handed them back to `PUBLIC`.

### That migration did one more thing than its own header says

**Its header claims the only change was who may call the function. That is not the
whole change, and a reader of the sealed file years from now would otherwise be
misled.** Recreating `validate_pickup_code` also deleted a manual
`insert into public.order_events`, and that insert was carrying information.

The deleted line ran *after* the function's `update` on the order. That `update`
fires `on_order_status_change`, which is `AFTER INSERT OR UPDATE ... FOR EACH ROW`
and inserts an event of its own, and `order_events` has no unique constraint beyond
its primary key. So every validated pickup was writing **two** `completed` events.
This was a genuine double-write bug, not intended behaviour — nobody designed the
duplication, and it is the reason the manual insert had to go.

What made it more than a duplicate is that the two rows were not identical:

| | manual insert (removed) | `on_order_status_change` (kept) |
| --- | --- | --- |
| `metadata` | `{"method": "pickup_code"}` | `{"source": "database"}` |
| `previous_status` | `v_order.status` | authoritative, from the row |
| `changed_by` | `auth.uid()` | `auth.uid()` with a GUC fallback |

Only `metadata` differed, and `method` existed nowhere else in the database. Removing
the insert fixed the row count and, silently, removed the audit trail's only record
of *how* an order was completed. Nothing reads `metadata->>'method'` today — the
mobile app uses the `pickup_code` column on `orders` — which is exactly why it could
go missing without anything failing: "nobody reads it" is how audit data disappears.
A question like "how many orders were completed by code versus by the business?"
becomes unanswerable from the audit table, with no sign it ever was.

**`20261015022233_validate_pickup_code_event_marker` restores the marker going
forward.** It recreates the same function with a second, tightly scoped `update` that
merges `{"method": "pickup_code"}` into the metadata of the event the trigger already
wrote — merged, not replaced, because `source` and `method` are two facts about the
same event and overwriting one with the other loses the first. The scope
(`order_id`, `status = 'completed'`, `metadata->>'source' = 'database'`, and not
already carrying a `method`) and the reasoning for why it cannot reach anyone else's
row are in the migration file. There is still exactly one event per pickup, and from
that migration on it says both things. `business-members.rls.db.spec.ts` pins both
halves.

**It restores it forward only, and the history it leaves behind is already a coin
flip.** Of the `completed`-from-`ready_for_pickup` events that exist in production, 3
carry `{"method": "pickup_code"}` and 2 carry `{}`. The reason is
`20260925155433`, which collapsed each duplicate pair with `order by created_at, id`
— and both rows of a pair were written in the same transaction, so `created_at`
tied and the uuid decided which one survived. There is no rule behind which. That
history is unrepairable: the row that lost was deleted, and nothing else in the
database records what its metadata said.

So do not read "the marker is restored" as "every completed event says how it was
completed". Any analytics over `order_events` written before `20261015022233` has to
treat the marker as absent-or-present at random, and only events written after it are
reliable. The fix makes the data *correct going forward*; it does not and cannot make
the past so.

## Applied: `20261015022233_validate_pickup_code_event_marker`

Applied via `apply_migration` on 2026-10-15. The file's `md5sum` is
`15cd20bb5359edd4f6c9bb690aea0ed2` and that is also the ledger's
`md5(statements[1])`.

It recreates `validate_pickup_code` and changes one thing: after the order update
that `on_order_status_change` already answers with an `order_events` row, a second
scoped `update` merges `{"method": "pickup_code"}` into that row's metadata. The
dedup itself belongs to the previous migration and is described in its section above;
this one puts back the marker that dedup took with it. No `grant` and no `revoke`,
for the same reason as everywhere else: `create or replace` preserves the ACL.

The event count stays at one per pickup and the metadata now carries both `source`
and `method`. `business-members.rls.db.spec.ts` pins both halves, including that the
marker does not spill onto events no code validated.

## Applied: `20261015024824_validate_pickup_code_null_code`

Applied via `apply_migration` on 2026-10-15. The file's `md5sum` is
`ceb9c6adb679472c7e7d8f3598c9bd76`, equal to the ledger's `md5(statements[1])`.

One character of behaviour, and it is a security fix: `pickup_code <> p_pickup_code`
became `is distinct from`. `pickup_code` is NOT NULL but the argument is
caller-supplied and PostgREST passes a JSON `null` through, and `'ABC123' <> null` is
NULL, which an `IF` treats as false — so the function fell through to
`update … set status = 'completed'`. Any caller could complete a ready order without
knowing any code.

The hole is old (`20260615195645`); what changed is the population that can reach it.
The permission used to be `businesses.owner_id = auth.uid()`, owner only, and an
owner could complete an order with or without the code at no cost to themselves.
It is now `can_manage_location`, which admits managers and branch-scoped staff — so a
cashier could complete any ready order in their branch with no code, accrue the
revenue, and bypass the invariant `set_order_status` enforces a few lines above it
("Transición reservada al sistema": a business may never move its own order to
`completed`).

## Applied: `20261015024825_business_policy_tightening`

Applied via `apply_migration` on 2026-10-15. The file's `md5sum` is
`2274a8f0a437523d7a1d36d819991ce1`, equal to the ledger's `md5(statements[1])`.

Three tightenings that all rewrite the same group of policies, done in one migration
so each policy is defined exactly once and none is left in its old shape:

**The TTL now reaches the policies that resolve by role.** `20261015015012`'s header
claims the session check applies to every role, owner and manager included. That was
true for the seven tables routed through `can_manage_location` and false for the
eleven routed through `business_member_role`, whose body has no expiry branch at
all: an expired owner or manager could still write `business_hours` and `coupons`
(both `FOR ALL`), update the `businesses` row, write notification preferences, read
`payouts`, create branches, and list the team with its aliases.

The fix is **not** to add the TTL to `business_member_role`. Task 4 left it TTL-free
on purpose so `business_member_session_state` can report `role: 'staff'` alongside
`reason: 'session_expired'` — the panel needs the role precisely so it can explain the
exit. So a companion helper was added instead:

```
business_member_session_valid(p_business_id uuid) → boolean
```

`stable security definer set search_path = ''`, revoked from `public` and `anon`,
granted to `authenticated`. It answers "is this caller's session live for this
business" with the same membership predicates (`deleted_at is null`,
`status = 'active'`), the same `session_ttl_hours = 0` skip and the same expiry
arithmetic, and the eleven policies now call it **in addition to** their role check.

The expiry arithmetic was meant to live in one place,
`business_member_session_expires_at(session_ttl_hours, last_authenticated_at)`, with
`can_manage_location` and `business_member_session_state` calling it. At the moment this
migration was sealed that was **not** the case, and both of those functions were still
computing it inline — see the correction below. The eleven policies call
`business_member_session_valid` **in addition to** their role check, and that part did
hold.

**`deleted_at is null` on the two membership reads**, which §6.3 names explicitly and
neither of which applied it to the row being listed:
`Owners and managers view business members` filtered nothing, and
`Owners and managers view member scope` filtered the foreign row inside its `exists`
and nothing on the `business_member_locations` row itself. This came from the brief,
whose SQL was followed verbatim and whose gap was flagged in `20261015015012`'s own
header; it is closed here. The cost was disclosure, not access: a soft-deleted row
grants nothing by any path, but `business_members.alias` mirrors `auth.users.email`,
so a departed employee's login address stayed in the team list.

**Branch deletion is owner-only.** `Members can delete business locations` used
`can_manage_location`, which returns true for managers, while §5.1 defines the
helper's contract as `manager → todo el negocio, excepto borrar sucursales`. It is
now `business_member_role(business_id) = 'owner' and can_manage_location(business_id,
id)`. This is a restoration rather than a regression — the `business_ownership`
policy it replaced was owner-only — and
`business_member_locations_location_id_fkey` is `ON DELETE CASCADE`, so a manager
deleting a branch silently strips every staff scope row pointing at it. After the
`drop` of `business_ownership` this is the only branch-delete path in the system.

### ⚠ `20261015024825`'s own header overstates this, and it is sealed

`20261015024825:46-52` says `business_member_session_expires_at` "es la única cuenta",
and the paragraph above said the same. **That was false when it was written**, and the
re-reviewer was right to close the finding: measured live, the arithmetic existed in
**three** places. Only `business_member_session_valid` called the new function;
`can_manage_location` and `business_member_session_state` still carried
`last_authenticated_at + (session_ttl_hours * interval '1 hour')` inline. The shared
function shared with nobody, and the only thing preventing drift was a behavioural
test matrix — which catches a divergence when someone trips over it, not when someone
reintroduces the duplicate.

The sealed header cannot be edited, so it will keep making that claim. Read it as what
it is: a statement of intent that was not true on the day it was sealed.

**`20261015031154_shared_ttl_expiry_accounting` makes it true.** Both functions now
call `business_member_session_expires_at` instead of computing the expiry inline — one
line each, with the semantics unchanged, no signature/volatility/`security definer`/
`search_path` touched and no `grant`/`revoke`. There is now exactly one copy of the
arithmetic, and all three consumers read it.

The claim is also now **enforced**, not just made: a catalog guard asserts that
exactly one of the four bodies may contain `interval '1 hour'` and that the other
three must reference `business_member_session_expires_at`. It was verified by putting
the inline arithmetic back into `can_manage_location`, which turns the guard red
*while the behavioural matrix in the same test still passes* — which is precisely the
gap the matrix alone leaves open.

## Applied: `20261015031154_shared_ttl_expiry_accounting`

Applied via `apply_migration` on 2026-10-15. The file's `md5sum` is
`46291d4ebb6126f51c750797dd4b8c6d`, equal to the ledger's `md5(statements[1])`.

Recreates `can_manage_location` and `business_member_session_state` so both read the
expiry from `business_member_session_expires_at` instead of computing it. In
`can_manage_location` the "expired" branch becomes the two halves asked of the shared
value — stamped and past, or unstamped with a TTL set — which is exactly what the
inline expression meant. In `business_member_session_state` the assignment becomes a
call, and the `reason` logic below it, which already read from `v_expires_at`, is
untouched. No error code, message or returned `jsonb` shape changes.

## The plan limits took three migrations, and that is the point

**One feature, three sealed files, one final state.** They are written here together
because reading only the newest one is how a reader ends up believing the first never
existed.

| version | name | md5 | what it does |
| --- | --- | --- | --- |
| `20261015034230` | `plan_limit_guards` | `556416b2b4baa383e6452a0c64fe9295` | creates the two limit triggers and `business_plan_of` |
| `20261016000829` | `plan_limit_guard_counting_and_message` | `3ba17681f995f7355f7abd1f57724ddf` | corrects the member counting, both messages and the `else` |
| `20261016000934` | `plan_limit_message_suffix` | `a54c50eec8f7904833664c27f319e0a8` | restores the «, no más» that the previous one dropped |

Every one of those md5 values was re-measured against `md5(statements[1])` in
`supabase_migrations.schema_migrations`, and all three match. **All three files end
on `;` with no trailing newline**, and that is what makes the equality hold — see the
block at the top of this file. Do not add the newline.

The second and third were applied 65 seconds apart. The third exists because someone
read back the *text* the second one produced, saw that it said «el plan free admite
hasta 1 sucursal» instead of «… hasta 1 sucursal, no más», and knew that a message
without the closing reads as a description of the plan rather than as a refusal. A
fix that is correct, tested and applied is still a fix that was wrong for 65 seconds,
and the ledger is the only place that can show that both states existed.

**A defect found after applying is a new migration here, and that is not a workaround
— it is the reason the sealed file exists.** `20261015015012`'s section above makes
the same argument for the same reason: editing an applied file would make this
directory stop describing the database, which is the one failure mode this README
exists to prevent.

## Applied: `20261015034230_plan_limit_guards`

Applied via `apply_migration` on 2026-10-15. The file's `md5sum` is
`556416b2b4baa383e6452a0c64fe9295` and that is also the ledger's
`md5(statements[1])`: byte for byte, ending on `;` with no trailing newline.

It creates `public.business_plan_of(business_id) → public.business_plan_code` and
routes `public.business_has_feature` through it, so that the two limit triggers and
the feature check have exactly one definition of «qué plan tiene este negocio».
Before this, that question was answered in two places and the two could disagree: a
soft-deleted plan row read as `free` to the check and as `pro` to the message, so the
owner was told they were paying for a plan they no longer had.

Then it creates `enforce_business_location_limit` and `enforce_business_member_limit`
plus the two `BEFORE INSERT OR UPDATE` row triggers `trg_enforce_location_limit` and
`trg_enforce_member_limit`, all `security definer` with `search_path` pinned to `''`,
all revoked from `public` and `anon`.

**`business_plan_of` is deliberately not executable by `authenticated`, and that is
the right ACL rather than an omission.** It is granted to `postgres` and `service_role`
only, which is exactly what the project's own defaults give a new function in `public`:
`pg_default_acl` for role `postgres` on `public`, objtype `f`, reads
`{postgres=X/postgres, service_role=X/postgres}` — `anon` and `authenticated` are not
in it. The revoke in the migration is therefore belt-and-braces on top of that default,
and it keeps being right if the default is ever widened.

Nothing client-facing calls it. `business_has_feature` is the client-facing answer to
«does this business have this feature», and it is granted to `authenticated`; it calls
`business_plan_of` from inside its own `security definer` body, so the call runs as
the owner. The two triggers do the same. §5.1 names three helpers that `authenticated`
may execute and this is not one of them — it did not exist when §5.1 was written.

**Its own header cannot be corrected, so what this file got wrong is recorded here.**
Three defects are visible by reading it. The member trigger's `v_agrega` tests
`old.role is distinct from 'owner'`, which is true exactly when the row *already*
counted, so an edit to a row that already occupied a seat was read as growth — and the
location trigger has the same idea written correctly a few lines above, which is what
makes the member one a misunderstanding rather than a design choice. The branch message
uses `%s`, which is not a format specifier in plpgsql. Both `case` expressions end in
`else null`, where "nobody described this plan" and "this plan has no cap" are
indistinguishable. `20261016000829` corrects those three, and `20261016000934` restores
the «, no más» suffix that `…00829` dropped while rewriting the line.

What this file does **not** contain is the defect the brief specified. It counts the
after-state rather than the rows that already exist, so a business above its cap can
still rename a branch. That correction was made before the file was applied, which is
why no ledger row in this chain shows the broken version.

## Applied: `20261016000829_plan_limit_guard_counting_and_message`

Applied via `apply_migration` on 2026-10-16. The file's `md5sum` is
`3ba17681f995f7355f7abd1f57724ddf` and that is also the ledger's
`md5(statements[1])`: byte for byte, ending on `;` with no trailing newline.

It supersedes `20261015034230` and changes three things in the two trigger bodies:

1. **The member `v_agrega` had `is distinct from` inverted.**
   `old.role is distinct from 'owner'` is true exactly when the row *already* counted,
   so an edit to a row that already occupied a seat was read as growth. A
   grandfathered business with three staff on `free` could not change a `label`.
2. **`%s` is not a format specifier in plpgsql.** The marker is `%`; `%s` is a marker
   followed by a literal `s`. The noun argument was appended as text, so the owner
   read «el plan free admite hasta 1 sucursals, no más».
3. **Both `case` expressions got the loud `else`** —
   `raise exception 'el plan % no tiene límites definidos'` — so that a fourth plan
   tier cannot fall through to `null`, which would mean *no cap*.

It does not recreate the triggers and carries no `grant`/`revoke`: `create or replace`
keeps the OID, and the two triggers from `20261015034230` point at these same function
names.

**Its successor corrects it.** The rewrite of the noun argument dropped the «, no
más» that `20261015034230` had.

## Applied: `20261016000934_plan_limit_message_suffix`

Applied via `apply_migration` on 2026-10-16. The file's `md5sum` is
`a54c50eec8f7904833664c27f319e0a8` and that is also the ledger's
`md5(statements[1])`: byte for byte, ending on `;` with no trailing newline.

One line. It recreates `enforce_business_location_limit` and nothing else: the `raise`
goes from `'el plan % admite hasta % %'` back to `'el plan % admite hasta % %, no
más'`. It does not recreate `enforce_business_member_limit`, whose message never lost
the suffix, and re-declaring an unchanged body would be a second copy of a function
that did not change — which is how these chains start to diverge without anyone
deciding to.

**This is the terminal state for the plan limits.** Three files, and the order to read
them in is the order they were applied.

## The ledger has a `staff_permission_helpers` row with no file: `20261014011033`

The ledger contains three rows from the development of the helpers above:

| version | name | file here? |
| --- | --- | --- |
| `20261014011030` | `staff_permission_helpers_probe` | yes — its content is exactly `select 1` |
| `20261014011033` | `staff_permission_helpers` | **no** |
| `20261015001857` | `staff_permission_helpers` | yes |

`20261014011030` was a probe applied while checking the `apply_migration` path,
before the real migration was written. Its file is here and its md5
(`95adb6e77a0884d9e50232cb8c5c969d`) matches the ledger, so the directory mirrors
that row completely.

`20261014011033` was an earlier, never-committed version of the helpers applied
during the same session. **It has no file here and none should be written.** Two
reasons, and the second is the one that matters:

1. Its content is unreviewed and superseded. It defined `business_has_feature(uuid,
   text)` where the shipped one takes the `business_feature` enum, and a
   `can_manage_location` with different semantics. Reconstructing it would put
   SQL that never passed review into this directory's history, where a later
   reader would reasonably assume it had.
2. A reconstructed file would be *approximately* right and would therefore be
   worse than an absent one: it would look like the mirror of the ledger and fail
   the md5 check this README tells you to run, and an unverifiable file in this
   directory is the failure mode the whole document exists to prevent.

**Nothing survives from it in the database.** Both `20261014011033` and
`20261015001857` define the same four function names, and `create or replace`
means the later one wins outright. Verified: `pg_proc` holds exactly those four
functions with no leftover overload of the `text` signature, and every one carries
`proconfig = {"search_path=""}` and an ACL of `postgres`, `service_role`,
`authenticated` — never `anon`, never PUBLIC. So a from-scratch replay of this
directory reaches the same schema as production, and the gap is bookkeeping rather
than state.

The asymmetry is deliberate: one orphan row is mirrored because it can be mirrored
exactly, the other is documented because it cannot.

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

## Applied: `20261002174845_boundary_sync_seeded_secret`

Aplicada por `apply_migration` el 2026-10-02. El `md5sum` del archivo es
`0b80d017e13a7ed737e1f29a2755b928` y ese es también el `md5(statements[1])` del
ledger.

Cierra un hueco que **no** es de formato sino de comportamiento, y que solo se
vio al comparar las migraciones del directorio contra el ledger byte a byte:
once de los doce archivos `20260925*` de `main` no coincidían con lo que la base
ejecutó, y el spec de grants estaba escrito contra esa copia. Al sincronizar,
un fallo que parecía test viejo resultó ser real.

El bloque de sincronización de `20260925163235` arranca con
`if legacy_src is null then … return; end if`, donde `legacy_src` es el cuerpo de
`handle_order_event_push`. En un entorno **nuevo** ese cuerpo no existe —que es
justo el caso que el propio `raise` de al lado pide resolver sembrando Vault a
mano—, así que el bloque validaba los secretos y salía **antes** de sincronizar.
Un operador que sembraba `internal_secret` y replayeaba las migraciones quedaba
con las cinco Edge functions sin su secreto; como son `verify_jwt:false`, el
gateway reenvía igual y cada dispatch falla 401. Se lee como "el secreto no se
inyectó" y manda a investigar al subsistema equivocado, el mismo modo de fallo del
dispatcher que arregló `20260925175051`.

Esta migración repite el sync sin mirar `legacy_src`. Es idempotente
(`update_secret` si la entrada existe, `create_secret` si no), toma el valor de
`vault.decrypted_secrets` y no de una constante, y falla ruidoso si el secreto no
está: preferible una migración que para a cinco funciones que devuelven 401 sin
explicación.

Antes de sincronizar, valida que los cinco slugs sigan siendo los que la
allowlist de `invoke_internal_edge_function` acepta, leyendo la propia función
con `pg_get_functiondef`. Si alguien cambia la allowlist y no esta migración, el
error sale en el `raise` en vez de quedar como cinco funciones sincronizadas que
nadie puede despachar.

**Por qué una migración nueva y no editar `20260925163235`:** ya corrió, y su md5
es la única prueba de lo que pasó. Editarla haría que `supabase db push`
reprodujese un archivo que la base nunca ejecutó.

## Applied: `20261002041038_bug_report_inbox_filter_index`

Aplicada por `apply_migration` el 2026-10-02. El `md5sum` del archivo es
`2ceb034da1d5ea4ea96b841bc4890867` y ese es también el `md5(statements[1])` del
ledger: archivo y base coinciden byte a byte. Una sola sentencia, un índice
compuesto y parcial sobre `(namespace, origin, created_at desc)`. No se borró
nada.

**El `md5` volvió a ser el único que detectó una palabra en inglés.** Es la
segunda vez que este repo sufre la misma sustitución (la otra está en
`20260927*_reviews_moderation_soft_hide`, arriba). Los dos casos son el mismo:

| | archivo | ledger |
| --- | --- | --- |
| `reviews_moderation` | `businesses/oferts` | `businesses/offers` |
| este | `recognizable` | `reconocible` |

En los dos, la sustitución tiene **exactamente la misma longitud** que la
palabra correcta, así que un conteo de bytes no la ve: solo el md5 la cazó. En
ambos casos estaba dentro de un comentario `--`, o sea que **ningún DDL estaba
en juego** y ningún `tsc`, `biome` o suite de tests la habría visto.

Y acá el sentido es el contrario al de `reviews_moderation`: allá el **ledger**
tenía el typo y el archivo el español correcto, así que el archivo se dejó como
estaba y la diferencia quedó registrada acá. Acá el **ledger** tenía el español
correcto, así que alinear el archivo lo reparó en vez de importar un error.

**El comentario en español es la especificación, pero el md5 es el que la
verifica.**
Ninguna herramienta lee comentarios; por eso el sello tiene que seguir siendo el
md5 y no "el archivo parece correcto".

## Applied: `20260930234450_bug_reports_and_delivery_axis`

Aplicada por `apply_migration` el 2026-09-30. El `md5sum` del archivo es
`3b302c90f0ae124e5697d5879cdd3263` y ese es también el `md5(statements[1])` del
ledger, así que el archivo y la base coinciden byte a byte — a diferencia de
las dos entradas de arriba. No se borró nada y no corrió ningún backfill: la
migración es aditiva más un rename, y todavía no existe ninguna fila
`bug_report` en producción.

Tres cosas de las que no se ven leyendo el DDL:

**El rename es de tres objetos, no de uno.** `public.app_store.status` pasó a
`delivery_status`, el tipo `public.store_entry_status` pasó a
`public.delivery_status`, y el índice `app_store_status_idx` pasó a
`app_store_delivery_status_idx`. Postgres no deshace un `rename`, así que la §13
del diseño trata esto como de ida a propósito: la alternativa es conservar una
columna llamada `status` que significa una sola cosa. La etiqueta que el panel
ya usaba (`PROCESADO: "Notificado"`) es lo que la columna debería haberse
llamado desde el principio. Los dos ejes nuevos — `state text` y
`origin public.entry_origin` — son ortogonales, no variantes: `delivery_status`
contesta "¿llegó el aviso al equipo?" y `state` contesta "¿el bug está
resuelto?". Los mensajes de contacto usan solo el primero y siempre con
`state = NULL`.

**El bucket es privado, y de eso se trata.** `bug_report_images` se crea con
`public = false`, 5 MB y tres MIME types, a diferencia de los cinco buckets que
ya existen, todos de lectura pública. Una captura de un bug puede llevar
pedidos, direcciones y teléfonos, y un bucket público la deja al alcance de
cualquiera que tenga la URL. Las dos policies de `storage.objects` copian la
forma completa de `20260925155445` (líneas 66-74) y no la abreviada de la §4
del diseño: `bucket_id`, más `owner = (select auth.uid())`, más el primer
segmento de la carpeta igual al uid de quien llama. Por eso el panel le pide
URLs firmadas de corta duración al API en vez de leer el bucket.

**El `revoke select on public.app_store from anon, authenticated` viaja en esta
migración a propósito.** `20260928184943` revocó de esa tabla solo `truncate`,
`trigger` y `references`, así que `SELECT`, `INSERT`, `UPDATE` y `DELETE`
seguían todos en manos de los roles cliente, y lo único que los frenaba eran
cero policies. La tabla colgaba, entonces, de un accidente: un GRANT, o una
policy de SELECT permisiva escrita después por comodidad, habría hecho legible
la tabla entera — la bandeja de contactos incluida — para cualquiera con la
anon key, que viaja dentro del bundle móvil. `anon` y `authenticated` ya no
tienen `SELECT` sobre `app_store`; `postgres` y `service_role` sí. El API lee
la tabla por una conexión `postgres` construida desde `DATABASE_URL`, no como
un rol cliente (`apps/api/src/database/database.module.ts:22-25`), y las Edge
Functions usan la service key — los mismos dos hechos en los que se apoya
`20260928181714`, y la razón por la que este revoke no los toca.

El camino de escritura que esto deja para el cliente es exactamente una policy
de INSERT, "Users submit bug reports", cuyo `WITH CHECK` fija `namespace`,
`delivery_status = 'PENDIENTE'`, `state = 'ABIERTO'` y un `origin` en
`('ios','android','pwa')`. No hay policy de UPDATE ni de DELETE, así que esos
dos los sigue negando RLS: un usuario puede reportar, nunca auto-atenderse. La
autoría la sella en el servidor el trigger BEFORE INSERT
`on_bug_report_stamped` (`security definer`, `search_path = public`), de modo
que `value.reporter_id` es lo que diga `auth.uid()` y no lo que mande el
cliente.

## Applied: `20261004022647_announcements`

Aplicada por `apply_migration` el 2026-10-04. El `md5sum` del archivo es
`7f17bb5d5712246a4d17c70e1b167eb1` y ese es también el `md5(statements[1])` del
ledger: archivo y base coinciden byte a byte. Crea `public.announcements` y
`public.announcement_acknowledgements`, más tres índices: uno parcial sobre
`(active, priority desc, created_at desc) where active` y dos GIN, uno por cada
arreglo de audiencia. Del índice parcial está aserida la FORMA —el nombre, en el
conjunto de los cinco de las dos tablas—, no que el planner lo elija: no corrió
ningún `EXPLAIN` ni contra producción ni contra el replay del harness, y el plan
depende del volumen. No borra nada y no corre ningún backfill.

**La elegibilidad entera vive en la policy de select, no en el cliente.** El
móvil y el landing leen Supabase directo, así que la consulta no pasa por la
API: con el `USING` de esta migración la fila que no le corresponde a alguien no
llega a su dispositivo. Los cinco términos son `active`, la ventana
`start_at`/`end_at`, `severity = 'info' or auth.uid() is not null` —sin lo cual
un `required` llega a un anónimo que no puede acknowledge y vuelve en cada
apertura, para siempre—, y la audiencia: `all`, `consumers` contra
`auth_helpers.my_role() = 'user'`, `businesses` contra `= 'business'`, y
`specific` por `user_ids @> array[auth.uid()]`. Es `my_role()` y no un subquery
a `profiles` porque es `security definer` y estable: la policy no depende de que
el lector tenga permiso sobre `profiles`.

**Y un anónimo entra por la rama de consumidora.** `my_role()` devuelve `'user'`
por el `UNION ALL` de su fallback cuando no hay fila de perfil, y el visitante
del landing no tiene perfil porque no tiene sesión: así que `anon` matchea
`consumers`, y ve `all` y `consumers`. Es una decisión y no un descuido —el
banner de consumidora tiene que existir fuera de la app, y no hay sesión que lo
habilite—, pero conviene que quede escrito porque `consumers` no significa
"usuarios con sesión". Lo que el anónimo no alcanza es lo demás: `businesses`
exige `my_role() = 'business'` y `specific` exige `user_ids @>
array[auth.uid()]`, que con `auth.uid()` nulo es falso. Y ninguna policy de
escritura existe, así que leer `consumers` no compra nada. Está fijado y medido
en el spec.

**Las ausencias son la decisión, y hay que contarlas como ausencias.** En
`announcements` no hay policy de INSERT, de UPDATE ni de DELETE: publicar es
del operador y va por la API, y lo único que frena al cliente es la ausencia
de policy, que es justo lo que RLS sabe hacer. En
`announcement_acknowledgements` no hay UPDATE ni DELETE: no existe forma de
des-acknowledgear, y un `required` entendido no vuelve a aparecer nunca, ni
aunque el operador lo edite para corregir una errata. Por eso el ack es de la
fila y no de su contenido. Ninguna de las dos usa `force row level security`: el
rol dueño es con el que la API escribe, y forzado le pagaría el `USING` en cada
fila. Y ninguna policy dice `TO public`: el rol decide, no el `sub` presente.
Todo eso está medido en
`apps/api/src/database/security/announcements.rls.db.spec.ts` (14 tests), y la
forma de cada policy también —los tres inventarios del spec asertan `roles`,
`qual` y `with_check` completos, no el nombre—, así que el
`TO anon, authenticated` y el `TO authenticated` son un hecho medido y no una
lectura del DDL.

**El `revoke truncate, trigger, references` viaja en esta migración a
propósito, y el motivo es el orden de las versiones.** La migración
`20260928181714` —`revoke_client_destructive_privileges`— itera `pg_class`
filtrado por `relrowsecurity`: una migración que resuelve un conjunto lo
resuelve el día que corre, y la suya es anterior a esta, así que no vio estas
dos tablas. Truncate y trigger no los gobierna ninguna policy —no hay `USING`
que los filtre, y trigger además le deja al rol colgar su propio trigger a una
tabla que no es suya—, así que el revoke por tabla es la parte del contrato que
no depende de quién creó la tabla. Es el mismo hueco que `20260928184943`
cerró para cinco tablas y que `20260930234450` volvió a cerrar para `app_store`.

Vale la pena precisar qué parte de ese hueco cierra, porque la segunda mitad de
`20260928181714` **también** revocó las tres de los default privileges de
`postgres`: toda tabla de este directorio nace por una migración, o sea que por
ahí ya sale limpia. Lo que ese revoke por defecto no alcanza es el ACL por
defecto de `supabase_admin`, que `apply_migration` no puede alterar —corre
como `postgres`, y un rol solo altera los default privileges que le
pertenecen—, así que allá el revoke de aquella migración falló con `42501` y
quedó sin cubrir. Si alguien quiere afirmar si este revoke explícito es o no
redundante **hoy en producción**, la pregunta es de `pg_default_acl` en la base
viva, no de este archivo: la segunda mitad de `20260928181714` ya dejó medido
ese reparto y esta entrada no lo vuelve a medir.

**La obligación es por migración, no por esquema.** Ninguna migración que
resolvió un conjunto vuelve a correr: `20260928181714` no verá las tablas de
mañana, y `public.rls_auto_enable()` —que existe en producción— no habilita
RLS sola porque no está conectada a ningún event trigger, como fija
`enable-rls.rls.db.spec.ts`. Así que cada `create table` en `public` trae su
propio `alter table … enable row level security` y su propio revoke, y el
precio de olvidarlo es invisible en el archivo equivocado: se descubre
leyendo el spec, no la migración. Por eso el conteo de tablas está fijado en
41 en los dos specs que miden el conjunto, y sube de a uno con cada tabla
nueva —39 antes de esta migración—: esos pines son los que convierten la
obligación en algo que falla ruidosamente en vez de algo que nadie nota.

**Dos cosas que esta migración deja abiertas. Son follow-ups, no notas.**

La primera es el hueco de `business_ids`, y conviene decirlo con precisión
porque la validación que lo rodea se lee al revés de lo que es. El endpoint de
publicación exige que un `specific` traiga al menos un id en `user_ids` **o** en
`business_ids`, y eso **no cierra el hueco: lo deja alcanzable**. Un `specific`
cargado solo con `business_ids` pasa esa validación, y con el `USING` de esta
migración es **invisible para todos**: no matchea `all`, ni `consumers`, ni
`businesses`, y `user_ids @> array[auth.uid()]` es falso porque el arreglo viene
vacío. El índice GIN de `business_ids` está creado igual, que es lo correcto: es
el que va a necesitar cualquiera de las salidas. Hasta que se elija una, un
anuncio publicado puede no verlo nadie, y el operador no tiene forma de saberlo
desde el panel.

| salida | qué cambia | quién tiene que decidirla |
| --- | --- | --- |
| (a) un `CHECK` de frontera | el DDL rechaza el `specific` sin `user_ids` | una migración nueva, y es la más barata |
| (b) la API resuelve `business_ids` → `user_ids` al publicar | la fila llega con los `user_ids` resueltos | el endpoint, y el diseño |
| (c) el endpoint rechaza el `specific` solo con `business_ids` | el error es explícito y el panel puede avisarlo | el endpoint, y el diseño |

La segunda salida que nombra la cabecera de la migración —que la policy mire
`business_ownership`— es más invasiva y está aparte: tocaría el spec de RLS y el
modelo de permisos. Ninguna de las cuatro se toma desde un DDL, y por eso la
columna de la derecha dice quién decide en vez de decir qué hace el SQL.

La segunda es un índice que falta, y es la más barata de las dos. La PK de
`announcement_acknowledgements` es `(announcement_id, user_id)`, así que su
lado izquierdo es `announcement_id` y **no sirve** para
`using (user_id = auth.uid())`, que es la policy de lectura de esa tabla, ni
para la consulta caliente de la app —el `not in (select announcement_id … where
user_id = auth.uid())` que descarta lo entendido—. Hoy el costo es cero y no
porque el índice esté, sino porque no hay volumen: el spec siembra once anuncios
—`toBe(11)`, "las once filas sembradas"— y tres acknowledgements, así que
ninguna de las dos tablas tiene tamaño que dé trabajo. El día que las tablas
crezcan, esa ausencia se paga así: sin índice sobre `user_id`, tanto el `select`
de la policy como el `not in` de la app **recorren la tabla entera** y evalúan
el predicado fila por fila, para cada persona y en cada arranque — no "la lista
de esa persona", que es lo que sugiere leerlo al revés: sin índice no hay lista
de nadie, hay tabla completa. Un índice sobre `(user_id)` lo resuelve. No se
agrega acá porque **esta migración ya está aplicada y sellada con su md5**:
sería una migración nueva, y una que se aplica por un índice que hoy no urge es
la clase de cambio que entra junto con el próximo que sí lo urge.
