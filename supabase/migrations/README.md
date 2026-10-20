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

### ⚠ Its header calls the drop "the next migration", and that stopped being true

**`20261015015012:18-19` says "El retiro de `business_ownership` es la migración
SIGUIENTE, y no esta." That is no longer the plan, and the file is sealed, so this
paragraph is where the correction lives.**

The drop moved to **Plan 3**, because the mobile app reads `business_ownership` on
its first panel query, so Plan 3 has to migrate `getBusinessesByOwnerId` before
the table can go. It is not coming at the end of this branch.

The current fact, stated plainly, so nobody has to reconstruct it:

- The new policies are **in place and exercised** — 25 of them, plus the three
  recreated RPCs.
- The legacy generation is **still in place**: 19 policies across 12 tables, and
  the table itself, untouched. `business-members.rls.db.spec.ts` pins those 19 by
  name in three spec files, so a drop shows up as a 19-element array failing.
- The two generations coexist because they were **verified equivalent — for an
  owner with a live session**. That is the scope of the word, and it is not
  wider: the legacy policies carry no TTL, so an owner whose session has lapsed
  keeps passing them. It is invisible while a real owner has a live session,
  because then both sets grant the same thing, and it stops being invisible the
  moment the second generation is the only one. Whoever runs the drop has to
  close that gap first.

Three test files and this README were the places still telling the next author
the drop was the next migration; all of them now say Plan 3.

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
computing it inline — see the correction below.

**This paragraph used to say those two functions were still computing it inline as of
*this* migration, which was wrong about the origin — and its correction was wrong
twice in the same sentence.** It said `20261015015012` "creates policies and grants;
it never wrote a function body". It does one of those and not the other:

- **It wrote three function bodies.** `cancel_order` (`:260`), `set_order_status`
  (`:343`) and `validate_pickup_code` (`:424`), all three `create or replace`.
- **It carries no `grant` or `revoke` at all** — `grep -cE '^[[:space:]]*(grant|revoke)\b'`
  returns 0, which is not an omission but a decision its own header states at
  `:71`: `replace` preserves the ACL and a fresh `create` would hand EXECUTE
  back to `PUBLIC` on a function that cancels orders.

The substantive point is unaffected and was re-checked:
`grep -c "interval '1 hour'" 20261015015012*.sql` → **0**. It inherited the
duplicates from `20261015001857`, which is where the copies were born (`:39` in
`can_manage_location`, `:124` and `:136` in `business_member_session_state`) — and
by the time `20261015003929` recreated both bodies it had already written a header
claiming the opposite. That earlier claim is recorded beside the `20261015024825`
one, because it is the same defect class and a migration earlier, and because the
two sealed files saying it are the reason a reader who checks only the newest one
concludes the arithmetic was always shared.

The eleven policies call `business_member_session_valid` **in addition to** their role
check, and that part did hold.

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

### ⚠ `20261015003929` made the same claim, one migration earlier, and it is sealed too

`20261015024825:46-52` is not the first sealed header to assert a single copy of the
expiry arithmetic. `20261015003929:51` says, in the paragraph that introduced
`reason: 'session_never_stamped'`, that "la fecha de expiración se calcula una sola
vez". **That was false inside the very file that says it**, and it is false in a way
that is checkable by reading nothing but that file:

| line | what it is |
| --- | --- |
| `20261015003929:140` | `or m.last_authenticated_at + (m.session_ttl_hours * interval '1 hour') < now()` — the arithmetic, inline, inside `can_manage_location` |
| `20261015003929:286` | `v_expires_at := v_row.last_authenticated_at + (v_row.session_ttl_hours * interval '1 hour');` — the same arithmetic, computed a second time, independently, inside `business_member_session_state` |
| `20261015003929:51` | "se calcula una sola vez" |

Two copies that disagree by construction is the worst shape of this defect: the function
that AUTHORIZES and the function that EXPLAINS are the two holding them, and §5.2 says
they have to tell the same story. They could drift, and nothing but a behavioural test
would notice — and the behavioural matrix passed at the time, because the two copies
happened to agree.

**The copies were not born in `20261015003929`.** `grep -n "interval '1 hour'"` over the
chain: `20261015001857:39,124,136` put them there, `20261015012253:89,213` carried them
through another rewrite of `business_member_session_state`, `20261015003929:140,286`
recreated both, and `20261015024825` is the migration that finally introduced the shared
function — while its own header described it as "la única cuenta". So the sentence was
repeated across three sealed files over four migrations, each of which could have been
made true and none of which was.

Two corrections in one place would have left the defect class intact, which is why the
enforcement below is a catalog guard and not a second note.

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

That matrix cannot catch a `20261015003929`-shaped regression on its own, and the
history above is the proof: every one of those three migrations had a green
behavioural matrix while two copies of the arithmetic were live.

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
Before this, **only one function answered that question** — `business_has_feature`
itself, whose subselect has filtered `deleted_at is null` since `20261015003929`
(`:171-190`, and the filter itself at `:182`) — so there was no disagreement inside
the database to fix. The disagreement this migration removed was one the **brief**
would have introduced: its triggers carried their own `left join
public.business_plans_state` with no `deleted_at` filter, so a soft-deleted plan row
would have read as `free` to the check and as `pro` to the message, and the owner
would have been told they were paying for a plan they no longer had. That `left join`
never reached the ledger, and the sealed file's own header repeats the
anachronism — it names its triggers' `left join` as one of the two pre-existing
answers. It is sealed; this paragraph is where the correction lives.

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

**This was the terminal state for the plan limits when it was written, and it stopped
being one the next day.** The two bodies were superseded again — by
`20261017033947_owner_is_untouchable`, for the error code and nothing else — and that
is the terminal state now. The order to read the chain in is still the order it was
applied in.

## Applied: `20261017033947_owner_is_untouchable`

Applied via `apply_migration` on 2026-10-17. The file's `md5sum` is
`41a16c7fbcbd973f4990dc614b4f6a95` and that is the ledger's `md5(statements[1])`: byte
for byte, ending on `;` with no trailing newline.

Four things, and three of them are the ones a reader would otherwise not expect to find
here.

**1. The partial unique index, `business_members_one_owner_per_business`.** One live
owner per business. It is partial —`where role = 'owner' and deleted_at is null`—
because the §8 soft delete keeps the row as history, and a row that stays as history
must not block the next owner. It does **not** filter by `status`, deliberately: what
has to be protected is «there are not two», and a disabled owner is not «owner in
fact», it is a gap that could be filled from behind.

**2. `trg_enforce_owner_is_untouchable`, `BEFORE UPDATE` and nothing else.** The brief
proposed `before insert or update`; this is `before update`. On insert the index
already does the work, and a trigger that only inspects the `old → new` transition
would sit underneath the Plan 1 backfill — the reason those 16 rows exist — and
underneath any reload of the table. The price is stated in the file and is one state:
an `insert` of an owner with `status = 'disabled'` is not seen by anyone, and that row
counts as the owner. It is not a door (it opens no second owner) and it is fixed by an
`update` this same trigger lets through.

The trigger denies two exits and allows a third. Denied: `status = 'disabled'` on an
owner row, and `deleted_at` going from null to not null. Allowed: `owner` →
`manager`, because «no role may deactivate the owner» (§5.4) does not say «and nobody
may stop being one», and degradation is the exit that ownership transfer will need. What
this trigger guarantees is deliberately smaller than «the business always has an owner»:
degrading the only owner leaves it without one, and a single-row trigger cannot
atomic «demote the old one, promote the new one». §5.4 records that transfer as out of
scope for v1 and **not forgotten**, and that is what this migration enforces.

**⚠ That paragraph is the state of `20261017033947`, and it was incomplete the next
day.** It enumerates two denied exits, and a third was unguarded: the hard `DELETE`. A
`before update` trigger does not see `delete`, so removing the owner row passed clean —
no error, no code. `20261017040808_owner_cannot_be_deleted` adds that arm, and it also
turns the `status` guard above from a check of the destination into a check of the
transition, for the same reason: on a row that arrived `disabled`, that guard fired on
writes that deactivated nothing.

**3. The two plan-limit `raise`s now carry `R0001`, and the owner ones carry `R0002`.**
`P0001` is Postgres' generic class. A UI that wanted to offer «upgrade to Pro» had to
regex a Spanish sentence, and the day the sentence changed the button would keep
compiling. Two codes and not one, because they are two rules and the UI reacts
differently to each: with a single `R0001` the UI would learn «this was a business
rule» and then have to read the prose again to learn which one — the exact defect this
code was meant to close, moved somewhere else. The prefix is the same either way, so
«was it a business rule?» stays one question. The `detail` carries what the prose does
not (`business=… plan=… limit=… current=…`, and `business=… member=…` for the owner
rules) and the `message` loses not one comma of the Plan 1 text.

**The brief's `format()` would not have worked, and it was caught by running it.**
It proposed

```sql
raise exception using
  errcode  = 'R0001',
  message  = format('el plan % admite hasta % miembros, no más', v_plan, v_limit),
```

`format()` has no bare `%`: the marker is `%` followed by a conversion specifier, so
`% ` is not a marker, it is an error. Measured against the local Postgres before
writing the migration, and it fails on the *first refusal*, in the one statement the
whole feature exists for:

```
ERROR:  unrecognized format() type specifier " "
HINT:  For a single "%" use "%%".
```

So the `USING` clause *accompanies* the format string instead of replacing it — `raise
exception 'el plan % admite hasta % %, no más', v_plan, v_limit, … using errcode =
'R0001', detail = …` — which is the only form where the old placeholders and the new
`detail` coexist. `R0001` and `R0002` are both accepted by Postgres as SQLSTATE values;
the class letter `R` is not reserved.

**4. The revoke closes against `authenticated`.** `20261015034230:306-308` revoked from
`public, anon` and not from `authenticated`. Measured before applying: it changes
nothing today, because `pg_default_acl` for `postgres` in `public` reads
`{postgres=X, service_role=X}` and all three functions are in exactly that ACL. What
changes is that the revoke is now self-defending. The `supabase_admin` default in this
same project grants `anon` and `authenticated` on new functions in `public`, so
«widen the default one day» is not a hypothetical; and the three functions keep the
ACL through `create or replace` alone, without anyone asking.

### What it does NOT do, measured and stated

- **It does not stop a business from ending up with no owner.** Degradation is allowed
  and degradation of the only owner empties the seat. The two-row operation that fixes
  it is out of v1 scope by §5.4, and the API must not pretend otherwise.
- **It does not see an owner that is born disabled.** Documented above; it is the price
  of `before update`, and the route that would produce it (`POST /staff` with
  `role: 'owner'`) is closed with a 422 in the Plan 2 API layer.
- ⚠ **It did not see the hard `DELETE` at all, and that omission is the one a reader
  would try.** The trigger was `before update` and nothing else, so
  `delete from public.business_members where role = 'owner'` passed clean: no error, no
  `R0002`, and the business lost its owner in the same statement the partial index
  protected. RLS stopped a client, because the only two policies on the table are
  `SELECT` — but `service_role` and `postgres` bypass it, and `service_role` is exactly
  what `POST /staff` and `PATCH /staff/:memberId` will write with. **Closed in
  `20261017040808_owner_cannot_be_deleted`**, the next section; this list stays here
  because the sealed file above still reads as if it covered it.
- **The other two `raise`s in the two plan-limit bodies keep `P0001`.** They are not the
  limit: «el plan % no incluye accesos de personal» is unreachable today because every
  plan grants `staff_access`, and «el plan % no tiene límites definidos» is a catalogue
  bug rather than a business rule. Reaching them would be the moment to revisit that.

### Measured against production, before and after

Before, because a unique index over data that already violates it fails at creation:

```sql
select count(*) from (
  select business_id from public.business_members
   where role = 'owner' and deleted_at is null
   group by business_id having count(*) > 1) d;
--  0
```

The real table, not the test replay: **16 rows, 16 businesses, 16 owners, 0 disabled,
0 soft-deleted** — every business has exactly one live owner, so the index landed on
clean data. After, `pg_indexes` holds the index with the predicate above, and
`pg_trigger` holds `trg_enforce_owner_is_untouchable` as `BEFORE UPDATE ... FOR EACH
ROW` with `search_path=""`, next to the untouched `trg_enforce_member_limit`
(`BEFORE INSERT OR UPDATE`). The ACL of all four functions —`business_plan_of`, the two
limit triggers and the new one— is `{postgres=X/postgres, service_role=X/postgres}` with
no `anon` and no `authenticated`.

### The fixtures of Plan 1 encoded a state this index makes impossible

`business-members.rls.db.spec.ts` seeded **three** owner rows on one business —the live
one, one with an expired session and one that was never stamped— and the helpers block
seeded two. Both were constructible only because Plan 1 had no owner index, and both
`beforeAll`s died with `23505 business_members_one_owner_per_business` as soon as this
migration was in the replay.

The fix was not to demote the extra rows: those fixtures exist to prove that the TTL
reaches **owners**, and an expired *manager* measures a different branch of the same
predicate. The expired and never-stamped owners were given their own businesses
(`POL_STALE_BIZ`, `POL_UNSTAMPED_BIZ`, and `BIZ_C` in the helpers block) **with their
own** rows —location, hours, coupon, payout— because an owner of someone else's
business is a stranger, and a stranger is denied by the same policy that denies the
expired session. Without those rows the `[]` of those tests would be true for the wrong
reason and no assertion would go red. That is the half of this migration with no SQL in
it, and it is the half that would have quietly weakened a Plan 1 security test.

Two fixture rows are inactive on purpose: the new coupons are `is_active = false` and
the new locations are closed, because the public catalogue shows every active row and
two unrelated assertions compare those lists whole.

**⚠ One claim in the section above stopped being true, and it is sealed.** It says
`BEFORE UPDATE` «and nothing else», which was true and stopped being true the next day:
the hard `DELETE` needed its own arm. Read it as the state of
`20261017033947`, not as the state of the table.

## Applied: `20261017040808_owner_cannot_be_deleted`

Applied via `apply_migration` on 2026-10-17. The file's `md5sum` is
`85c157cf201cce6c6ee258e0378a6944` and that is the ledger's `md5(statements[1])`: byte
for byte, ending on `;` with no trailing newline. It supersedes `20261017033947` for two
things and touches nothing else; the partial index is untouched.

**1. The hard `DELETE` of a live owner row is now refused with `R0002`.** A sibling
function, `enforce_owner_cannot_be_deleted`, on its own
`trg_enforce_owner_cannot_be_deleted before delete for each row`.

Sibling and not a branch in the same function, because the two rules do not resemble
each other: one compares `old` with `new` on a row that keeps existing, the other reads
a single row that is on its way out. Merging them would put a `tg_op` branch at the
top and half the body would be «if we are on the other path, leave».

Why it is an API bug and not a feature is in the §8 terms: a hard `DELETE` takes the
row and, by cascade, the `business_member_locations` rows that record which branch
someone worked. What is left is a staff list nobody can reconstruct from. And there is
a second path that is nobody's code — `business_members.user_id` references
`profiles(id) on delete cascade`, and `profiles` is `on delete cascade` from
`auth.users`, so deleting a user's account deletes their owner row. The guard is per
row, which covers both.

**It is deliberately scoped to the LIVE owner.** `old.role = 'owner' and old.deleted_at
is null`: an already-archived owner row can be hard-deleted. It is history, §8 wants
history kept, and a future «purge the history» has to be able to say so rather than
hit a trigger that cannot tell it apart from removing a live business' owner. The way
out of the guard is the same as the rest of the trigger: demote the row first. After
that it is not the owner, the `DELETE` goes through like any other, and the business
has no owner because somebody demoted it on purpose.

**2. The `status` guard now watches the transition, not the destination.**
`if old.status is distinct from new.status and new.status = 'disabled'` — the same shape
as the `deleted_at` guard eight lines below it, which already read both halves. The
sealed version compared the *state* of the destination, and because the trigger is
`before update` and does not see inserts, a row can arrive `disabled` and stay that way:
from then on every write that left it there raised «el dueño del negocio no se puede
desactivar» — including `set label = 'x'`, which deactivates nothing, and
`set deleted_at = now()`, which reported the wrong rule and never reached the soft-delete
one. `status` is `NOT NULL`, so this was never a NULL-predicate hole; it was
state-versus-transition and nothing else.

What did not change: `set status = 'active'` on a disabled owner still goes through, so
a row is not wedged, and the combined write that does remain is the one that changes the
row's owner-ness — demote, reactivate and soft-delete together. Both guards still close
both exits.

**Two combined writes now have a test each, and the reviewer was right that they did
not.** Demote-and-deactivate passing is not a bypass: its end state is the two-step path
the trigger already allows, and a trigger that denied it would deny revocation over a
difference of syntax. Demote-and-delete is denied, and the file's justification — «a low
with two steps, irreversible from the row» — was a comment and nothing more. The
dangerous part is that collapsing the demotion guard to `if new.role <> 'owner' … then
return new` makes **every other test in the block still pass** while opening the
demote-and-delete door, so both tests now name the guard they pin.

### Measured against production, after

```sql
select c.relname, t.tgname, pg_get_triggerdef(t.oid)
  from pg_trigger t join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'business_members' and not t.tgisinternal;
```

| trigger | events |
| --- | --- |
| `trg_enforce_member_limit` | `BEFORE INSERT OR UPDATE` |
| `trg_enforce_owner_is_untouchable` | `BEFORE UPDATE` |
| `trg_enforce_owner_cannot_be_deleted` | `BEFORE DELETE` |

`prosrc` carries `old.status is distinct from new.status` in the first owner function and
`old.deleted_at is null and new.deleted_at is not null` beside it; the delete function
carries the `no se puede borrar` raise. Both are `{postgres=X/postgres,
service_role=X/postgres}` — no `anon`, no `authenticated`. The data did not move: **16
rows, 16 owners, 16 businesses, 0 disabled, 0 soft-deleted, 0 businesses with two live
owners**, before and after.

### The counterfactual the relocated fixtures were missing, and what it found

`20261017033947` gave the stale and never-stamped owners their own businesses, and the
tests around them assert `[]` — a result a missing row, a missing business or a broken
policy all produce. The counterfactual was asserted in a comment and nothing measured it:
with a fresh session, does that same owner see his own payout?

Building it produced a fact that is not about the test. **A client cannot re-stamp a
session.** `business_members` has no write policy, so `update … set
last_authenticated_at = now()` as `authenticated` does not raise `42501` — it updates
**zero rows silently**, because an `UPDATE` under RLS with no policy matches nothing
and says nothing. The first version of the counterfactual was written that way and
measured a session that had never been renewed. It has to run the way the product will:
the seal with `service_role`, then the person asks again. That is the path
`POST /staff/session` takes, and it is now written down in the test.

## Applied: `20261020052915_owner_cannot_be_demoted`

Applied via `apply_migration` on 2026-10-20. The file's `md5sum` is
`3601d75e5d1c08645033bb55d894e989` and that is also the ledger's
`md5(statements[1])`: byte for byte, ending on `;` with no trailing newline.

It supersedes `20261017040808_owner_cannot_be_deleted` for the body of
`enforce_owner_is_untouchable`, and the sealed file above keeps saying that
«la degradación pasa». **It stopped passing on 2026-10-20**, and this is why.

**The demotion of an owner is now refused with `R0002`.** `20261017033947` let it
through on purpose —«ningún rol puede desactivar al dueño» (§5.4) does not say
«and nobody may stop being one»— because the ownership transfer was going to
need exactly that exit. The transfer does not exist in v1, and while it did not
exist the demotion was a door that one line of HTTP opens:
`PATCH /businesses/:id/staff/:memberId {"role":"manager"}` over the owner's own
row. What it leaves behind is a business that nobody can administer and that
disappears from the panel's listing, with no route able to put `role: 'owner'`
back — the promotion is a 422 from the §5.4.

The code is the one that already existed (`R0002`, the owner is untouchable),
because this is not a new rule: it is the same invariant with a third exit that
was covered.

**Two of its messages changed, and they had to.** «degradalo a manager primero»
and «degradalo primero» pointed at the exit that this migration closes. A
message that sends the operator to a door that bounces is worse than one that
gives no exit at all: the operator reads «desactivar», touches «desactivar» and
gets «no se puede degradar», with nothing in between. Both texts now name the
real reason —la transferencia de propiedad no existe en esta versión— and both
are still `R0002`, with the same `detail`.

**What it does not touch.** The `INSERT` is not seen (the trigger is
`BEFORE UPDATE`), so the Plan 1 backfill and any reload of the table are
intact. A write that leaves `role = 'owner'` alone still passes —the session
stamp, the TTL, the label, the alias— because the guard looks at the
TRANSITION of the role and not at the state of the row. And a row that is not
the owner's leaves through the first `return`: pausing and archiving an access
that is going away (§8) are still free, and a trigger that denied the row
would leave the business unable to fire anybody.

### Measured against production, after

```sql
update public.business_members set role = 'manager'
 where id = (select id from public.business_members where role = 'owner' order by id limit 1);
```

```
ERROR:  R0002: el dueño del negocio no se puede degradar; la transferencia de propiedad no existe en esta versión
DETAIL:  business=b239e579-76d0-4290-8e37-20b919064283 member=236ef603-2b83-4e52-baa7-e7c686f0b573
HINT:  la transferencia de propiedad no está en la v1: degradar al dueño dejaría el negocio sin dueño
```

The statement aborts, so the data does not move: **16 rows, 16 owners, 0
non-owners**, before and after.

## Applied: `20261020052952_plan_feature_refusal_on_growth`

Applied via `apply_migration` on 2026-10-20. The file's `md5sum` is
`d989274db916cef0957681a7104df457` and that is also the ledger's
`md5(statements[1])`: byte for byte, ending on `;` with no trailing newline.

It supersedes the two limit bodies of `20261017033947_owner_is_untouchable`
(the sealed chain is `…15034230` → `…16000829` → `…16000934` → `…17033947` →
this), and it changes two things.

**1. The feature is consulted only when the write GROWS.** The §5.3 says, with
all the letters: «Los triggers solo disparan en escritura. Nunca bloquean
lectura ni operación. Si a un negocio le baja el plan, los accesos que ya creó
siguen funcionando; lo que se bloquea es crecer.» The body did not say that:
the `business_has_feature` check sat before everything, and a trigger runs on
EVERY write, so renaming an access, pausing it, changing its alias or sealing
an employee's session all bounced with «el plan % no incluye accesos de
personal». The shape is now the one the limit already used: the comparison
happens «sólo cuando la escritura CRECIÓ», and the growth flag (`v_agrega`)
answers both questions — the limit and the feature.

**2. The feature's refusal is `R0001`, not `P0001`.** The raise carried no
`USING`, so it was Postgres's generic class, and the README above had left the
question open —«alcanzarlo sería el momento de revisarlo»—. It is reachable
now: the API consults the feature before each alta (§5.1). And the refusal IS a
plan refusal: the plan is the reason and the answer is «subí de plan», which is
exactly what `R0001` means and what the API already translates into a 422 with
the message and the numbers of the `detail`. A `P0001` nobody translates arrives
at the panel as a 500.

The `detail` of the feature carries `business=`, `plan=` and `feature=`, and
NOT `limit=`: the limit's `detail` describes a NUMBER and this one describes a
FEATURE, and the API uses the presence of `limit` to decide whether it has to
draw a limit.

## Applied: `20261020053935_plan_limits_counting_and_demotion`

Applied via `apply_migration` on 2026-10-20. The file's `md5sum` is
`c76431f903b4cfd911c8ab2ea890a6e8` and that is also the ledger's
`md5(statements[1])`: byte for byte, ending on `;` with no trailing newline.

It supersedes `20261020052952` for the two limit bodies, and it exists because
**the migration above had a defect and the specs caught it.** The body of
`enforce_business_location_limit` lost its `select count(*) into v_otros` —the
block that counts the business' active locations— and without it `v_otros` and
`v_despues` stayed `null`, the comparison of the limit was never true, and the
trigger DID NOT COUNT ANYTHING. Ten tests of limits went red on the first pass:
a limit trigger that does not limit is worse than one that limits wrong,
because nobody notices.

**The second thing it fixes is the ORDER of two guards.**
`trg_enforce_member_limit` runs BEFORE `trg_enforce_owner_is_untouchable` —the
order of Postgres' triggers is the order of their names— and a demotion in a
business that was at the limit died with the plan's `R0001`: «el plan free
admite hasta 2 miembros, no más». That message sends the operator to the wrong
door: the demotion has nothing to do with the plan, it is closed by another
invariant, and the answer the operator has to see is `R0002`. The demotion
therefore leaves BEFORE the counting: it does not grow, it does not take a seat
and it does not touch any limit, and it reaches the owner's guard.

The `old.role = 'owner'` condition inside `v_agrega` stays, because it is the
one a future ownership transfer will need —a row that stops being the owner
takes a seat— and today it cannot be reached.

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

1. Its content is unreviewed and superseded. It defined a `can_manage_location`
   with different semantics — it returned `true` for an owner or manager *before*
   checking that the branch belonged to the business, and applied the TTL only to
   `staff`, so an expired owner kept administering — and reconstructing it would
   put SQL that never passed review into this directory's history, where a later
   reader would reasonably assume it had.
2. A reconstructed file would be *approximately* right and would therefore be
   worse than an absent one: it would look like the mirror of the ledger and fail
   the md5 check this README tells you to run, and an unverifiable file in this
   directory is the failure mode the whole document exists to prevent.

### ⚠ An earlier version of this entry named a `text` overload that never existed

This paragraph used to say the orphan "defined `business_has_feature(uuid,
text)` where the shipped one takes the `business_feature` enum". **That is
false, and it was false in the only place a reader would go to check it.** Read
out of the ledger:

```sh
psql "$DATABASE_URL" -At -c "select regexp_replace(statements[1], '\s+', ' ', 'g')
  from supabase_migrations.schema_migrations where version = '20261014011033'"
```

`create or replace function public.business_has_feature(p_business_id uuid,
p_feature public.business_feature)` — the **enum**, identical signature to the
shipped one. There was never a `(uuid, text)` overload, before or after. A later
auditor sent to hunt for it would find nothing and would have to decide whether
the ledger had been edited, which is a worse afternoon than the one this entry
caused.

**What did survive is the arity, and it is the one that needed an explicit
`drop`.** The orphan declared `business_member_session_state()` — **zero
arguments**, `returns jsonb`. The shipped generation declares
`(p_business_id uuid default null)`, and those are two different identity-argument
lists, so `create or replace` did not replace the orphan's function: it sat a
second overload next to it. That is why `20261015003929:197` carries

```sql
drop function if exists public.business_member_session_state();
```

with the reason written out at `:192-196`, and why `session_state()` would have
been ambiguous between the two otherwise. That `drop` is the trace this orphan
left in the database, and it is a `drop` in a **different** file — which is
exactly why the connection is not obvious from the ledger row and is recorded
here instead.

**The conclusion this entry reached is unchanged, and it was verified
independently of the reason.** `pg_proc` holds no `(uuid, text)` overload and no
zero-argument `business_member_session_state`; the seven functions that answer for
this branch are exactly `business_has_feature(uuid, business_feature)`,
`business_member_role(uuid)`, `business_member_session_expires_at(integer,
timestamptz)`, `business_member_session_state(uuid)`, `business_member_session_valid(uuid)`,
`business_plan_of(uuid)` and `can_manage_location(uuid, uuid)`, every one carrying
`proconfig = {"search_path=\"\""}` — never `anon`, never PUBLIC.

**Six of the seven carry an ACL of `postgres`, `service_role`, `authenticated`.
The seventh, `business_plan_of(uuid)`, carries only `postgres` and `service_role`,
and `has_function_privilege('authenticated', …, 'execute')` is `false` for it.**
That is deliberate, not an omission, and this sentence used to contradict both the
database and `design.md:298` inside a claim whose whole purpose was "verified
against `pg_proc`". It is internal to the two `enforce_business_*_limit` triggers,
which run as the table owner, and `business_has_feature` is its client-facing
version. Measured:

```
select p.oid::regprocedure::text,
       has_function_privilege('authenticated', p.oid, 'execute') as auth_exec,
       has_function_privilege('anon', p.oid, 'execute') as anon_exec
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'business_plan_of';
-- business_plan_of(uuid) | f | f
```

So a from-scratch replay of this directory reaches the same schema as production,
and the gap is bookkeeping rather than state.

The asymmetry is deliberate: one orphan row is mirrored because it can be mirrored
exactly, the other is documented because it cannot.

## Applied: `20261016022631_owner_memberships_no_session_expiry`

Applied via `apply_migration` on 2026-10-16. The file's `md5sum` is
`6c53fa18e959078acdf2700d75e4a547` and that is also the ledger's
`md5(statements[1])`: byte for byte, ending on `;` with no trailing newline.

**It is a data migration and it is the correction of a production-critical
defect.** One `update`, and no DDL, no function, no grant.

`20261014005016_backfill_business_members.sql` inserts `(business_id, user_id,
role, label, alias)` and nothing else. It never writes `last_authenticated_at` —
it could not: the only writer is §8's `POST /staff/session`, and
`apps/api/src/modules/staff/` does not exist yet — so all 16 rows it produced
were born unstamped. And it never writes `session_ttl_hours` either, so each of
them inherited the `default 24` from `20261014002328:81`.

**A TTL with no stamp is an expired session by definition.** Both
`business_member_session_valid` and `can_manage_location` contain the
disjunction `(expires_at is not null and expires_at < now()) or (ttl > 0 and
last_authenticated_at is null)`, and the second term was true for all 16.
Measured against the real rows by evaluating the helper's own expression, before
this migration:

```
role    | ttl | filas | denegadas_por_ttl | sesion_valida
owner   | 24  |   16  |                 16 |             0
```

So the 25 policies of `20261015015012` and the three recreated RPCs denied
everything to every real business owner. **The product worked only because the
legacy `business_ownership` policies were still in place** — the generation Plan
3 retires — and permissive policies are OR'd together.

**Why `0` and not a stamp.** `last_authenticated_at = now()` would be a 24-hour
fuse: the owners are denied again tomorrow, and again every day, until someone
builds the endpoint that re-stamps them. A fix that restores access for 24 hours
and then takes it away silently is worse than no fix, because it looks green.
`0` is the truth about these rows: §5.2 calls the TTL «un control de
responsabilidad y UX, no una frontera de seguridad» and §9.2 offers owner and
manager the persistent session explicitly. The TTL exists to stop a shared tablet
on a bakery counter. An owner who never used the staff flow has no stamp because
the flow does not exist, not because their session lapsed — and 24 hours denies
them the business they own.

**The column default stays `24`.** It is correct for the staff access the API
will create later. This migration fixes the rows the backfill produced, not the
default, and `business-members.rls.db.spec.ts` asserts both halves: the default is
still 24, and a row created the API's way — no `ttl`, no stamp — inherits it and
is denied.

**Its scope is three predicates and each one is load bearing.** `role = 'owner'`
(what the backfill creates), `last_authenticated_at is null` (a stamped row's TTL
is real, and it makes the migration idempotent), and `exists (select 1 from
business_ownership …)` — that last one is what identifies "the row the backfill
produced". Without it this would be "turn the TTL off for every unstamped owner",
which would silently disable the shared-tablet control for every access the API
creates later.

**Measured after applying**, same query, same helper expression:

```
role    | ttl | filas | denegadas_por_ttl | sesion_valida | con_sello
owner   | 0   |   16  |                 0 |            16 |         0
```

`con_sello` stays 0 on purpose: the fix switches the TTL off, it does not
manufacture a session.

**There is no `raise exception` on a zero-row update**, deliberately: the
harness replay starts with no `business_ownership` rows — the seeds are the
documented irreproducible migrations — so a count assertion would turn every
`db push` against an empty database into an error.

## Measured: what the permission layer costs per row, and what it costs per statement

Everything above in this file measures SHAPE. This section measures the PLAN,
because the repository's own standard says both are needed — see the
`20261004022647_announcements` section below, which asserts an index's form and
says in the same sentence that no `EXPLAIN` was ever run against it.

**Read-only throughout.** Every query below is a `SELECT` or an `EXPLAIN
(ANALYZE)` over a `SELECT`. Nothing here inserts, updates or deletes, and no
data-modifying CTE appears — a CTE that writes is not a dry run, it runs.

### The command

This worktree carries no `DATABASE_URL` and no `psql`, so the runs went through
the project's Supabase MCP `execute_sql`, which opens one connection per call.
The SQL is the reproducible artifact and it is reproduced verbatim:

```sql
select set_config('request.jwt.claims',
  '{"sub":"<a real owner>","role":"authenticated"}', true);
set role authenticated;
explain (analyze, timing on, buffers)
select count(s.x) from (
  select ((public.business_member_role(b.business_id) = any
             (array['owner'::public.business_member_role,
                   'manager'::public.business_member_role])
         and public.business_member_session_valid(b.business_id)) as x
  from public.business_hours b, generate_series(1, <K>) g
) s;
```

`generate_series(1, K)` crossed with `business_hours` (42 rows) produces
`42 × K` rows carrying **real** `business_id` values, and the predicate sits in
the target list so it is evaluated once per output row. That shape is load
bearing and it is not the obvious one:

- In the `WHERE` clause with a constant argument, the planner emits
  `One-Time Filter: (business_member_role('073854b4-…'::uuid) IS NOT NULL)` and
  the whole 8,400-row scan costs **one** call. Verified again in this round; the
  plan still shows `rows=8400 loops=1` with the filter hoisted above the loop. The
  millisecond figure next to it in the previous version of this entry (3.59 ms vs
  109 ms) does not reproduce and is not restated here, because the two shapes
  cannot be timed back to back in one session: whichever runs first pays the
  helper's first-call SPI planning, and on this run that made the *one-call*
  shape the slower of the two (the `Result` node alone reported
  `actual time=9.119..11.468`). A measurement that quietly measures one call and
  reports it as 8,400 is worse than no measurement — and so is one that compares
  two shapes across a cold-start boundary.
- With the argument derived from `g`, the plan carries it as a per-row
  `SubPlan` — which is the thing being measured.

**This harness is right for the helpers and wrong for the legacy predicate, and
the reason is not the target list — it is `pull_up_sublinks`.** That function only
walks join quals, so an `exists` written in the target list is never rewritten to
`= ANY` and never hashed, which is exactly the non-production shape discussed in
the next section. The legacy arm has to be written as `= any (select …)` to get the
plan RLS produces.

For `EXPLAIN` numbers taken through the MCP, the per-row figure is
`(Aggregate total) − (Nested Loop total)` over the evaluation count, and the
repeat-to-repeat spread is reported rather than the best run.

### Per call, at 84,000 evaluations, as a real owner

| helper | evaluations | µs / row | shared buffers / row |
| --- | --- | --- | --- |
| `business_member_role` | 84,000 | **14.7 – 15.4** | 1.0 |
| `business_member_session_valid` | 84,000 | **18.9 – 19.2** | 1.0 |
| `can_manage_location` | 50,000 (on `offers` — the only other table carrying both columns) | **23.8 – 23.9** | 1.0 |
| the two together — what `Members can manage business hours` / `coupons` do per row | 84,000 | **33.8 – 35.7** | 2.0 |

Re-measured in this round, three runs each at 42,000 and 84,000 evaluations
(`business_hours` × `generate_series`, so `42 × K` rows). The pair gave
33.65 / 33.69 / 33.71 at 42,000 and 33.78 / 33.88 / 35.74 at 84,000 — a spread
of about 6%, reported because it is real. `business_member_session_valid` used
to be listed here at 25.0; it does not reproduce, and 15.4 + 19.0 ≈ the pair's
measured 33.7 is the arithmetic that says which of the two was wrong.

The legacy `exists (business_ownership …)` arm is deliberately **not** in this
table, because it is not a per-row cost: the planner hashes it once per
statement. It is measured, in the shape production actually produces, in the next
section.

### ⚠ The `can_manage_location` figure above is the cheap path, and it is 13.7× below the one an owner pays

The harness above crosses a table with `generate_series`, so almost every
evaluation lands on a business the caller does **not** manage — and
`can_manage_location` short-circuits for those. Read `pg_proc.prosrc`: the body is
`select case … from member m cross join role_of r`, and when the `member` CTE is
empty the `FROM` is empty, so neither the `business_locations` existence check nor
`role_of`'s `business_member_role` call ever runs and the result is
`coalesce(null, false)`. The 23.8 µs measured above is that path, and it is the
path a reader pays for rows **belonging to other businesses**. The path an owner
pays for rows of **their own** business evaluates both, plus the session
arithmetic, and it is not cheap.

Measured with four arms in one statement — helper against a matched baseline that
differs only in the target-list expression, 10,000 evaluations each, three runs.
The baseline arms still carry the RLS `Filter` (RLS is not something a `WHERE`
clause removes), so the difference is the target-list calls and nothing else:

| arm | `Nested Loop` total | shared hits |
| --- | --- | --- |
| A — member, target list calls the helper | 3279.6 / 3305.6 / 3359.8 ms | **40,143** |
| B — member, target list does not | 3.822 / 3.960 / 3.974 ms | **5** |
| C — non-member, target list calls the helper | 245.1 / 245.6 / 250.2 ms | **10,010** |
| D — non-member, target list does not | 4.476 / 4.505 / 4.574 ms | **8** |

| path | µs / call | shared buffers / call | what it is |
| --- | --- | --- | --- |
| **member** — the row belongs to a business the caller manages (`A − B`) | **327.6 – 335.6** | **4.014** | full body: location check, role, session |
| **non-member** — it belongs to somebody else's (`C − D`) | **24.1 – 24.6** | **1.000** | `member` is empty; `coalesce(null, false)` |

The buffer counts are **byte-identical across all three runs** (40,143 / 5 /
10,010 / 8), which is why the table above carries no spread at all. The non-member
arm reproduces the published 23.8 – 23.9 to within its noise, so nothing here
contradicts the earlier table — it **explains** it: the earlier table measured the
cheap path and called it the cost.

The same contrast on the two-helper pair is much smaller, and for a reason worth
recording: `business_member_role` does the same index lookup either way and
returns `NULL` instead of `'owner'`, so membership is not a shortcut out of it.

| path | pair µs / call | pair shared buffers / call | measured at |
| --- | --- | --- | --- |
| member | **65.1 – 70.6** | 2.024 | 14,000 evaluations, two runs |
| non-member | **33.9 – 36.2** | 2.000 | same |

**Which number a projection should use depends on which side of the `OR` the row
falls on.** On `orders` and `offers` the member arm sits *before* the legacy
`business_ownership` arm, so an owner reading their own business pays 328 µs on
every one of its rows. The projection below uses the member figure for that case
and says so.

### ⚠ The legacy baseline is a per-statement cost, and the shape decides the number

The review that prompted this section put the three helpers at ~12 / ~16 / ~21 µs
per call and the legacy `exists (business_ownership …)` predicate at **~0.06 µs
per row**. The three helper figures reproduce — same order of magnitude, same
ranking, mine 1.2× to 1.6× higher.

The fourth is the one that moves the conclusion, and the first thing to settle is
**which shape it was measured in**, because the planner produces two different
plans for this predicate and only one of them exists in production.

**The shape production actually produces.** The legacy arm of the real `orders`
filter is a **hashed `SubPlan` evaluated once per statement**, followed by a cheap
per-row array containment — verbatim from `select id from orders` as a real owner:

```
Filter: ((user_id = (InitPlan 1).col1)
      OR can_manage_location(business_id, business_location_id)
      OR (ANY (business_id = (hashed SubPlan 9).col1))
      OR ((InitPlan 10).col1 = 'admin'::app_role))
  ->  SubPlan 9
        ->  Bitmap Heap Scan on business_ownership o  (actual time=0.018..0.020 rows=1 loops=1)
```

`loops=1`. The subquery's own predicate is `o.owner_id = auth.uid()`, which does
not depend on the row being tested, so the planner hashes it once and the per-row
work left over is a `= ANY` against the resulting array. So the legacy path costs
**per statement**, not per row — and that is exactly how a figure like 0.06 µs/row
looks credible: a per-statement time divided by a row count.

**What the other shape measures, and why it is not a number this system has.**
Writing the predicate where the planner will not rewrite it produces a correlated
per-row index lookup instead:

```
  ->  SubPlan 3
        ->  Index Scan using business_ownership_pkey on business_ownership o
              Index Cond: (business_id = b.business_id)   (… rows=0 loops=84000)
```

That plan is reachable, and it is the one the harness in `### The command` above
produces: `pull_up_sublinks` only walks **join quals**, never a `TargetEntry`, so
an `exists` sitting in the target list is never simplified to `= ANY` and stays
correlated. It is a real plan — it is just not the one RLS emits. The production
shape is reproduced by writing the arm the way the planner rewrites it,
`b.business_id = any (select o.business_id from business_ownership o where
o.owner_id = auth.uid())`, which plans as `SubPlan 3 … loops=1`.

| shape | µs / row marginal | subplan `loops` | what produced it |
| --- | --- | --- | --- |
| `exists` forced correlated, 84,000 rows | **1.339 / 1.343 / 1.338** | 84,000 | no plan in this repo emits it |
| the figure the previous round published | **1.26** | — | derived from the row above |
| **production: hashed SubPlan, 84,000 rows** | **0.143 / 0.146 / 0.144** | **1** | the real `orders` plan |
| **production: hashed SubPlan, 42,000 rows** | **0.155 / 0.154 / 0.157** | **1** | same |
| the first review's figure | ~0.06 | — | ~2.4× *below* the production marginal |

Buffers are the cleanest confirmation: the production shape reports **134 shared
hits at both 42,000 and 84,000 rows** — its cost really is invariant to the row
count — while the correlated shape reports 84,133 and 168,133, i.e. 2.0 per row.

**So the correction replaced an overclaim with a larger one.** The first review
was closer to production than the round that declared it wrong: 1.26 overstates
the legacy cost by ~9× (1.26 / 0.144) and 1.75 by ~12×, while ~0.06 understates
it by ~2.4×. The claim this entry used to make — that the reviewer "got the
legacy baseline wrong by 21×" and that "only one of them is real" — was false in
the direction it claimed to correct, and it was checked with less rigour than the
thing it was correcting.

### The ratio is not a property of the system, and publishing one number is the error

Both arms now have a measured marginal, and the ratio between them is stable,
because both are per-row quantities:

| | 42,000 rows | 84,000 rows |
| --- | --- | --- |
| legacy, production shape | 0.154 – 0.157 µs/row | 0.143 – 0.146 µs/row |
| the two-helper pair | 33.65 – 33.71 µs/row | 33.78 – 35.74 µs/row |
| **marginal ratio** | **~215 – 220×** | **~235 – 250×** |

The **per-statement** ratio is a different number, and it moves with the volume,
because the legacy arm has a fixed component the marginal ratio ignores. Built
from the measured marginals plus the measured `SubPlan` node time — 21 µs on the
real 39-row read. **The row axis is the queried business's own rows, not rows of
the table**, for the reason measured in `### The axis is the queried business's
rows, not the table's` below: the `business_id` index is the access method and
the RLS qual is a `Filter` above it, so the helper runs on that business's rows
and on nothing else.

| rows in one statement, for one business | legacy arm, total | new pair, total | ratio |
| --- | --- | --- | --- |
| 23 — today's busiest business, **measured** | 21 µs + 23 × 0.144 ≈ **24 µs** | 23 × 33.7 µs ≈ **0.78 ms** | **~32×** |
| 1,000 — projected | 21 µs + 1,000 × 0.144 ≈ **0.17 ms** | 1,000 × 33.7 µs ≈ **34 ms** | **~200×** |
| 10,000 — projected | 21 µs + 10,000 × 0.144 ≈ **1.5 ms** | 10,000 × 33.7 µs ≈ **0.34 s** | **~230×** |
| 84,000 — the harness volume | 810 µs + 84,000 × 0.144 ≈ **12.8 ms** | 84,000 × 33.8 µs ≈ **2.84 s** | **~220×** |

The 33.7 µs in this table is the **non-member** path, which is the path these
arms were measured on. On the member path the pair is **~65 µs** and
`can_manage_location` is **328 µs** — see `### The can_manage_location figure
above is the cheap path` — and the same 23 rows cost ~7.5 ms rather than 0.78 ms.
The 84,000-row row stays because it is the volume the two arms were actually
measured at, not a volume any business has.

The 21 µs is measured, not assumed: it is the `SubPlan 9 → Bitmap Heap Scan`
node's own time on the real 39-row read of `orders`, 0.018 – 0.021 ms across four
runs. The 810 µs in the last row is that same node inside the 84,000-row harness
and it is **not** a clean isolation of the ownership lookup — 0.79 – 0.88 ms of it
is `auth_helpers.my_role()` behind `InitPlan 2`, which the real read attributes to
its own InitPlan instead; that row is there to show the fixed term, not to be the
headline. The first three rows use the 21 µs and are the ones to quote. Quote the
ratio **at the volume you measured**, and put the volume beside it. "~27×" was
neither end of this table and was not a property of anything.

### Why the helpers are per row by construction — and what was not measured

All seven helpers carry `proconfig = {"search_path=\"\""}`, and the three a policy
filter calls directly — `business_member_role`, `business_member_session_valid`
and `can_manage_location` — each appear in a real plan as a per-row `SubPlan`.
`business_member_role` is `language sql` with a body simple enough to inline and
is *still* not inlined, which is consistent with the `proconfig` alone being
enough to stop the inliner. **That last step is the one part of this section that
is not measured**: the plans show the helpers are per-row, and I did not isolate
which clause of the `functiondef` is responsible. It does not change any number
above.

**The `FOR ALL` policies on `business_hours` and `coupons` do need attention, and
the reason is structural rather than a number.** In the filter above, `auth.uid()`,
`auth_helpers.my_role()` and the legacy ownership subquery are all hoisted — they
appear as `InitPlan 1`, `InitPlan 10` and `hashed SubPlan 9`. The
`can_manage_location(business_id, business_location_id)` beside them is a
row-dependent expression with no `InitPlan`, and a `STABLE` function whose
argument is a `Var` cannot be hoisted past the scan. That one is per row by
construction.

### What this costs at today's volume, which is the assumption all of it rests on

Row counts in production, 2026-10-15: `business_hours` **42**, `coupons` **6**,
`orders` **39**, `profiles` **20**, `offers` 25, `businesses` 16,
`business_members` 16, `business_locations` 15.

Two measurements on the real tables, as a real owner:

| query | rows | plan | Execution | shared hits |
| --- | --- | --- | --- | --- |
| `select id from business_hours` | 42 | Seq Scan, **no `Filter` at all** | 0.047 – 0.049 ms | 1 |
| `select id from orders` | 39 | Seq Scan, `Rows Removed by Filter: 39` | 4.05 – 4.15 ms | **765** |
| `select id from orders` as `postgres` (`bypassrls`) | 39 | Seq Scan | 0.093 – 0.128 ms | 2 |
| `select id from orders where id = '…'` | 1 | Index Scan, `Rows Removed by Filter: 1` | 2.94 – 3.25 ms | **721** |
| `select id from coupons` | 6 | Seq Scan, `Rows Removed by Filter: 4` | 2.54 – 2.63 ms | 536 |

The first `EXPLAIN` of a shape in a fresh connection costs 2–3× the warm ones
(`coupons` came out at 5.35 ms with a 5.19 ms Planning Time, `orders` at 11.16 ms),
so the ranges above are warm runs and the buffer counts are identical either way —
which is itself the reason the buffers are the load-bearing column here.

**`business_hours` has no RLS qual on SELECT at all**, and that is not an
accident of the plan: `Anyone can view business hours` is `TO public` with
`qual = true`, so the OR of the quals reduces to `true`, RLS contributes nothing
for a read, and the `FOR ALL` members policy never reaches a `SELECT`. It is not
true that it is "only ever consulted as a `WITH CHECK`", though: an `ALL` policy's
`qual` is also its `USING` clause, so on `UPDATE` this table's members policy is
consulted **both** as the `USING` (which rows the statement may touch) and as the
`WITH CHECK` (what they must look like afterwards). The claim that survives is the
one that matters — **a read never reaches it** — and the `no Filter at all` cell
in the table above is what proves it, not the policy text.

**The ~3 ms on a ONE-row indexed read of `orders` is not per-row, and the
1-row / 39-row pair is what proves it.** One row costs 2.94 – 3.25 ms and **721**
shared buffer hits; all 39 cost 4.05 – 4.15 ms and **765**. Those are different
numbers: the 39-row read is 765, and the sentence that used to say "all 39 cost
4.10 ms and the same 721" spliced the two. What the pair does support is the
**slope**: the 38 extra rows cost **44** more buffer hits, ≈ 1.2 per row, and
taking the scan nodes' own totals (2.845 – 2.952 ms for one row, 3.900 – 3.988 ms
for 39) the 38 extra rows cost ≈ 1.04 ms ≈ **27 µs/row** — the `can_manage_location`
figure arriving by another road. So at this volume the fixed per-statement cost of
the policy layer is an order of magnitude larger than its total per-row cost, and
it lives in two measured places: `auth_helpers.my_role()` behind an InitPlan at
130 buffer hits and 0.67 – 0.71 ms, and the first-call SPI planning of each
helper's internal queries.

**The SPI fixed part has to be quoted per shape, because it is not a single
number and 84,310 is not the pair.** Re-measured at two volumes, two runs each:

| shape | evaluations | shared hits | fixed | marginal |
| --- | --- | --- | --- | --- |
| `business_member_role` alone | 42,000 | 42,441 | **441** | exactly 1.0 / row |
| `business_member_role` alone | 84,000 | 84,441 | **441** | exactly 1.0 / row |
| `business_member_session_valid` alone | 42,000 | 42,482 | **482** | exactly 1.0 / row |
| `business_member_session_valid` alone | 84,000 | 84,482 | **482** | exactly 1.0 / row |
| the pair together | 42,000 | 84,310 | **310** | ≈ 2.005 / row |
| the pair together | 84,000 | 168,310 | **310** | ≈ 2.005 / row |

All six rows are invariant across the two volumes, which is what makes the split
legitimate. Note what 84,310 actually is: the **pair at 42,000 evaluations**. It is
not "84,000 evaluations reporting 84,310", and 84,000 rows of the pair report
168,310. The previous entry used the single number for a ~440 fixed part *and* an
exactly-2.0 marginal at 84,000 rows, which is two different measurements spliced
into one sentence: ~440 is a single helper's fixed part (441 measured), and 2.005
is the pair's marginal. The pair's own fixed part is smaller than the sum of the
two singles' (310 against 441 + 482) because the statement shares what they
cached.

`coupons` at 6 rows is the same shape with the numbers smaller: Planning Time
1.33 – 1.50 ms and `auth_helpers.my_role()` 0.67 – 0.77 ms account for nearly
all of the 2.5 ms, and the four filtered rows cost ~8 helper calls ≈ 0.3 ms —
invisible next to them.

### The axis is the queried business's rows, not the table's — and here is what is measured about that

The previous version of this section stated the cliff in rows of the **table**
(`orders` at 39 → 1,000 → 10,000 → 100,000). That is the wrong axis, and the
reason it was wrong is visible in a plan rather than arguable.

**Measured.** As owner `e9a8af49-…` — who owns **no** order of their own, so
`user_id = me` never short-circuits and every row the scan touches pays the
helper — the same table (`orders`, 39 rows) filtered to one business, four
different businesses, identical session shape:

| rows belonging to the queried business | access method | shared hits | Execution |
| --- | --- | --- | --- |
| 1 (`d0000000-…0004`) | **Index Scan using `idx_orders_business`**, `Index Cond` | **9** | 0.749 ms |
| 2 (`d0000000-…0003`) | **Bitmap Index Scan on `idx_orders_business`** + Bitmap Heap Scan, `Recheck Cond` | **10** | 0.780 – 0.781 ms |
| 3 (`d0000000-…0011`) | **Index Scan using `idx_orders_business`**, `Index Cond` | **12** | 0.772 – 0.773 ms |
| 23 (`b239e579-…`, the busiest business in production) | **Index Scan using `idx_orders_business`**, `Index Cond` | **96** | 9.25 – 9.38 ms |
| 39 — no business filter at all | Seq Scan, no access method | 116 | 8.53 ms |

The index is the access method in all four business-filtered plans, and the RLS
qual is a `Filter` **above** it, so it is evaluated on the index's output rows and
on nothing else. The buffer counts are the proof that this is not a claim about
what the planner *would* do: **9, 10, 12, 96** on a constant 39-row table. A qual
evaluated once per table row would report the same helper work in all four. It
reports 1 row's worth, 2 rows', 3 rows', 23 rows'. The table is not in the
projection; the business's share of it is.

**Measured, separately.** Every index the projection leans on exists, from
`pg_indexes`:

| table | index |
| --- | --- |
| `orders` | `idx_orders_business (business_id)`, `idx_orders_user (user_id)`, `idx_orders_offer`, `idx_orders_status`, `idx_orders_created` |
| `business_hours` | `idx_business_hours_business (business_id)`, plus `business_hours_business_id_day_key (business_id, day)` |
| `coupons` | `idx_coupons_business (business_id)`, `coupons_business_id_code_key` |
| `offers` | `idx_offers_business (business_id)`, `idx_offers_location_business (business_location_id, business_id)` |
| `profiles` | `idx_profiles_role (role)`, `profiles_pkey` |

**Reasoned, not measured, and stated as such.** Whether the planner keeps choosing
that index once `orders` is large. It cannot be forced here without inserting
rows, and no rows were inserted. What can be said is that the choice is not
marginal at this size — at the busiest business's 23 of 39 rows (59% of the table
in one business, far more concentrated than any real marketplace) the index scan
cost 141.68 against the seq scan's 233.76, and the index still won. The 39-row
`Seq Scan` is the correct plan for a 39-row table; that it appears at all is a
statement about the table's size, not about a missing index.

### What it projects to on that axis

At **328 µs** per row for `can_manage_location` on the member path (the figure
that applies to a business reading its own rows), **~65 µs** for the
two-helper pair, and the index keeping other businesses' rows out of the
expression:

| table | rows for the busiest business, **measured 2026-10-16** | 1,000 rows | 10,000 rows |
| --- | --- | --- | --- |
| `orders` (`can_manage_location`, member) | **23 rows → ~7.5 ms** | ~0.33 s | ~3.3 s |
| `orders` (`can_manage_location`, non-member) | **excluded from a business-filtered read by the index** — it only appears in an unfiltered read, where it is the other businesses' rows: 16 → ~0.4 ms | ~24 ms | ~0.24 s |
| `coupons` (pair) | **1 row → ~0.07 ms** | ~65 ms | ~0.65 s |
| `business_hours` (pair) | **0 on reads, ever** | 0 on reads | 0 on reads |
| `profiles` | *its own axis — see below* | | |

**The busiest business you can actually measure is `b239e579-…`, and it is 23
orders.** From `orders` grouped by `business_id`: 23, 4, 3, 2, 2, 2, 1, 1, 1,
0, 0, 0, 0, 0. So today's worst case is ~7.5 ms of helper time, inside a
measured 9.25 ms statement — the two agree, which is the first check that the
328 µs figure belongs in a real plan rather than only in a harness. The statement
the owner actually issues (`select id from orders where business_id = 'b239e579…'`)
is already the filtered one; the 39-row Seq Scan in the table above is the
unfiltered read, and the panel does not do that.

**Where it becomes noticeable, on this axis:** a business's own orders cross
**1,000** at ~0.33 s — past any interactive budget — and **10,000** at ~3.3 s,
which is a timeout rather than a slow query. Both are *per business*. A table
with 10,000 orders spread over 200 businesses is 50 orders each and ~16 ms: fine.
The cliff is a business's order count, not the marketplace's.

The number this replaces published ~24 ms at 1,000 orders because it used the
non-member figure. On the member path the same 1,000 rows cost ~0.33 s, **13.7×
more** — and the member path is the one an owner is on.

### ⚠ `profiles` is a different axis, and the shape is not the one this file assumed

The previous table above put `profiles` on the same per-row `can_manage_location`
axis as `orders`, at 20 rows. **Measured, that is wrong**, and so is the premise
that `Members can view their order customers` is a correlated `exists` against
`orders` per profile row with a cheap indexed inner side. It is neither.

As `b0000000-…0001` and then `e9a8af49-…`, verbatim:

```
Seq Scan on profiles  (actual time=7.573..7.594 rows=4 loops=1)
  Filter: ((id = (InitPlan 1).col1)
        OR (ANY (id = (hashed SubPlan 23).col1))
        OR (ANY (id = (hashed SubPlan 51).col1))
        OR ((InitPlan 52).col1 = 'admin'::app_role))
  Rows Removed by Filter: 16
  Buffers: shared hit=102
  SubPlan 23
    ->  Seq Scan on orders o_1  (actual time=2.314..17.026 rows=23 loops=1)
          Filter: (((user_id = (InitPlan 13).col1) OR can_manage_location(business_id, business_location_id)
                 OR (ANY (business_id = (hashed SubPlan 21).col1)) OR ((InitPlan 22).col1 = 'admin'::app_role))
                 AND can_manage_location(business_id, business_location_id))
          Rows Removed by Filter: 16
          Buffers: shared hit=226
```

**`SubPlan 23` is `loops=1`.** Both `exists` arms — the legacy one and
`Members can view their order customers` — were rewritten to **hashed `SubPlan`s
evaluated once per statement**, exactly like the legacy arm on `orders`. The
per-profile-row cost that survives is a `= ANY` containment, not a helper call. So
the risk is **not** `profiles_rows × helper`, and the "correlated exists per
profile row" shape is not a plan this system emits at any volume measured here.

The cost that does survive is on a different axis, and it is a real one:

| | `b0000000-…0001` (owns a 4-order business) | `e9a8af49-…` (owns the 23-order business) |
| --- | --- | --- |
| rows scanned in `profiles` | 20 | 20 |
| `SubPlan 23` — `orders` rows, `loops=1` | 4 | **23** |
| `SubPlan 23` own time | 5.276 ms | **17.026 ms** |
| `SubPlan 23` shared hits | 77 | **226** |
| whole `select id from profiles` | 7.59 ms, 102 hits | **25.31 ms**, 327 hits |

| axis | what it is | today's cost |
| --- | --- | --- |
| rows scanned in `profiles` | cheap `= ANY` containment; `profiles` has no index that RLS can use to narrow the outer scan, so this is the full table — 20 rows | not measured separately, and it is not where the cost is |
| **rows of `orders` scanned inside `SubPlan 23`, once per statement** | **two `can_manage_location` calls per qualifying row — the policy ANDs a second copy onto the `orders` RLS qual** | **23 rows → ~15 ms** |

The other arm is the same shape: `SubPlan 51`, the members `exists`, is a
`Nested Loop … loops=1` at 8.272 ms / 98 shared hits for the same 23 rows — also
once per statement, also not per profile row.

The slope between the two members is (17.026 − 5.276) / 19 ≈ **0.62 ms per
`orders` row**, which is what two member-path calls at 328 µs each predict. That
is the number to watch, and it is a **`orders`-table** axis — the one axis the rest
of this section had just argued was safe. It is safe on `orders`' own policies,
where the index restricts the scan to one business. It is **not** safe here,
because the hashed subplan builds its whole answer set with a `Seq Scan on
orders` — `idx_orders_user` exists and was not used, at either volume.

**What is measured and what is reasoned here.** Measured: both `exists` arms are
hashed `SubPlan`s with `loops=1`; the inner access method is a `Seq Scan on
orders`, not `idx_orders_user`; the inner cost and its slope across two members.
Reasoned: that this remains a hashed, per-statement plan at marketplace scale
rather than turning into a per-row correlated exists. The rewrite is not a
cost-based choice — `pull_up_sublinks` pulls the sublink up and
`simplify_EXISTS`/`convert_ANY` converts the `EXISTS` to `= ANY` regardless of
size, and both arms were converted at 4 rows and at 23 rows, `loops=1` in both
cases — so the reasoning is
that the conversion is size-independent, **not** that it was observed to be. What
would change at scale is only the inner access method, which is the thing a
`Seq Scan` on a large `orders` makes expensive.

### The lever, named and not pulled

At 23 orders for the busiest business this costs ~7.5 ms and nothing needs to
change. If a business ever reaches the volume where it bites, **the lever is not
an index** — every index on the `business_id` axis already exists and was measured
in use above. The two real levers, neither implemented here:

1. **Cut the per-row cost of `can_manage_location` itself** — fewer statements
   inside it. The member path is 328 µs / 4.01 buffers against the non-member
   path's 24 µs / 1.000, and the difference is exactly the two sub-selects that
   only run on the member path: the `business_locations` existence check and
   `role_of`'s `business_member_role` call, which the body already has the inputs
   to answer without a second round trip. **What would have to be measured:** the
   member-path cost after collapsing those, in the same four-arm shape, to confirm
   which of the two round trips carries the 304 µs.
2. **Restructure the policy so the per-row expression does not call a
   `security definer` function at all** — the hoisting argument above shows the
   per-row shape is forced by the function being in the qual with a `Var`
   argument, so the only ways out are a non-`security definer` helper PostgreSQL
   will inline, or a membership set materialised once per statement the way the
   `business_ownership` arm already is. **What would have to be measured:** that
   PostgreSQL actually inlines the rewritten form — the plans here show it refuses
   to inline these, and *which* clause of the `functiondef` is responsible is
   still the one step in this section that is not measured.

Both are somebody else's decision, made with these numbers rather than at the
moment the panel starts timing out.

### Does the branch accept this? Yes, with the measurement rather than the argument

At today's volume the per-row cost is invisible, and for two separate reasons
that are both worth naming: the volume is tiny, **and** `business_hours` has no
RLS qual on a read at all. The `coupons` and `orders` halves of the sentence this
replaces were wrong in two ways, both measured: on `coupons` the pair **is** in
the read filter and does run (`Seq Scan on coupons`, `Rows Removed by Filter: 3`
of 6 rows, the pair evaluated on the rows that fail the two earlier arms); and on
`orders` the `can_manage_location` arm sits **before** the hoisted
`hashed SubPlan`, so an owner reading their own business pays it on every one of
that business's rows — measured at 23 rows and 96 shared hits. What *is*
measurable today is the ~3 ms and ~721 buffer hits that the policy layer adds to
a one-row indexed read of `orders` — larger than the entire per-row cost at this
size, and belonging to `auth_helpers.my_role()` and per-connection SPI planning
rather than to this branch's helpers.

**Whether the `FOR ALL` policies need the call hoisted out of the per-row path
is a decision this section does not make, and the reason it cannot be a
per-function one is measured above:** the helper is not hoistable, because its
argument is a `Var`. The sentence this replaces named the lever as "a plan that
visits a bounded set of rows, which is an index and a migration". **That was
wrong: the index already exists and was measured in use.** The levers that remain
are the per-row cost of the helper and the policy's structure, both written out
with what would have to be measured in `### The lever, named and not pulled`
above. The measurement is the deliverable; the optimisation is somebody else's
decision, made with these numbers in hand instead of at the moment the panel
starts timing out.

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

## Applied: `20261020152852_location_scope_in_policies`

Applied via `apply_migration` on 2026-10-20. The file's `md5sum` is
`2155e50fec45c830014899b128664403` and that is also the ledger's
`md5(statements[1])`: byte for byte, ending on `;` with no trailing newline.

**This is the migration that moves the branch scope into the policies, and the
diff is ONE predicate and TWO `alter policy`.** Three changes:

1. **`can_manage_location` stops handing the whole business to a `manager`.**
   The role branch goes from `when r.member_role in ('owner', 'manager') then
   true` to `when r.member_role = 'owner' then true`. A manager now arrives at
   a row through the scope branch —the live rows of `business_member_locations`
   of its membership— and a manager with no rows arrives at nothing. The owner
   keeps the whole business, with or without scope rows, because the owner's
   scope IS the business.
2. **The two roster policies become "the roster you reach".** `Owners and
   managers view business members` and `Owners and managers view member scope`
   are rewritten with `alter policy` (Postgres has no `create or replace
   policy`, and a `drop` + `create` opens a window in which the policy does
   not exist). Both carry the ROLE requirement INSIDE, because the scope rule
   does not distinguish by role: a staff member whose scope covers another
   member's would satisfy the helper, and would see the roster —whose aliases
   mirror `auth.users.email`.
3. **`business_member_reaches_member` gains the exception of the caller's OWN
   row.** Without it a manager with no scope rows did not reach itself, and
   the self-service path of ADR-0013 (decision 4) disappeared. The exception
   lives in the HELPER and not in the policy because the API asks the database
   (and the "pause me" write is the API's), and because a policy cannot say
   "my row" without recursing through `business_members`. It grants nothing
   else: `can_manage_location` does not know about it, so a scopeless manager
   still touches no offer, no order and no location.

**The thirteen policies that read `can_manage_location` are NOT touched.** They
read the function's answer, so what changes is what the function answers. That
is the whole difference between a plan with thirteen policy diffs and one with
a single predicate —and thirteen copies of a rule are thirteen chances to
write it differently.

**The nine business-wide policies stay business-wide**: the business row, the
hours, the coupons, the payouts, the notification preferences and the creation
of a location. The scope rule bounds THE THINGS THAT LIVE IN A BRANCH; what has
no branch dimension is still the whole business, and it is granted by ROLE.
`Members can delete business locations` also stays as it is: it requires
`role = 'owner'`, so it gives nobody a scope.

**Two consequences worth saying out loud.** The owner is no longer in a
manager's roster —which is what §8 already said and what the API already did
(`reaches()` is false for an owner target), and now the database says the same
thing— and a manager who CREATES a location does not manage it, because the
new row is in nobody's scope until the owner puts it there.

**Production did not move**: there are sixteen owners and zero managers and
zero staff (measured 2026-10-21), so nobody loses access with this migration.

The previous migration of this plan, `20261020134712_member_scope_predicates`,
has no section here yet: it created the two scope helpers and changed no
policy. The pair reads in order —the rule first, the policies after— and the
rollback of this one is a NEW migration (the ledger's `rollback` is `NULL` in
all 153 rows): restore the old role branch, drop the own-row exception, and
`alter` the two policies back to their `20261015024825` quals.

## Applied: `20261020163244_ownership_transfer`

Applied via `apply_migration` on 2026-10-20. The file's `md5sum` is
`14810a9cd47cac8b5b3c56534e4a6b63` and that is also the ledger's
`md5(statements[1])`: byte for byte, ending on `;` with no trailing newline.

**Three changes, and all three are the same rule**: an ACTIVE business always
has a live owner, and an INACTIVE one may have none.

1. **`public.transfer_business_ownership(business_id, member_id)`** — the
   operation. `volatile security definer set search_path = ''`, ACL
   `{postgres, service_role}`: `anon` and `authenticated` hold nothing, so the
   mobile —which writes straight to Supabase— cannot open it. The caller is
   NOT an argument: the function reads `auth.uid()` and refuses with `R0004`
   unless the caller IS the live owner of that business. The recipient must be
   a live member of the same business, and the transfer is one transaction:
   demote the old owner to `manager`, give it the scope of every branch, promote
   the recipient to `owner`, and point `business_ownership` at the new owner —
   an UPSERT, because a business with no ownership row is one the mobile could
   not read, and after the transfer it has to read like the others.
2. **`public.enforce_business_keeps_an_owner()`** plus
   `trg_business_keeps_an_owner`, a `CONSTRAINT TRIGGER … DEFERRABLE INITIALLY
   DEFERRED … FOR EACH ROW` on `business_members`. It is deferred because the
   demotion and the promotion have to be TWO statements —the partial unique
   index checks row by row, so a single statement could hit `23505` on the
   promotion— and a `BEFORE` trigger would see the intermediate state, the
   business with no owner, and refuse a legitimate transfer. At commit the
   state is final: the transfer passes, and a lone demotion of an active
   business is aborted with `R0002`.
3. **`public.enforce_owner_is_untouchable()`** is rewritten. The `status →
   'disabled'` guard STAYS in the `BEFORE` trigger —a revocation deserves an
   immediate error with its own message— and its message changed, because
   «la transferencia de propiedad no existe en esta versión» stopped being
   true. The demotion guard and the `deleted_at` guard are GONE: what decides
   whether a business has an owner is the FINAL state of the transaction, and
   that is the deferred trigger's business.

**Two consequences worth saying out loud.** A demotion of an owner no longer
fails in the STATEMENT: it fails at the COMMIT, and only for a business that
is still active. And an INACTIVE business may now end up with no owner at
all —which is what makes the release of D2 possible, and what the reactivation
guard of the next task has to answer.

**The plan said the transfer could fail because of the member limit. Measured,
it does not.** `enforce_business_member_limit` leaves BEFORE counting when the
row stops being the owner, and a promotion to `owner` leaves even earlier; and
the transfer does not grow the team anyway —the outgoing owner takes the seat
the incoming one gives up. A business at its limit can hand its business over.

**Production did not move**: fourteen active businesses, fourteen live owners,
zero active businesses without one (measured after applying). The ledger's
`rollback` is `NULL`, so the rollback of this one is a NEW migration: drop the
function and the constraint trigger, and restore the old
`enforce_owner_is_untouchable` body —whose text is in the sealed
`20261020052915_owner_cannot_be_demoted.sql`, copied, not edited.
