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

### The divergence is semantic, and the next fidelity gap

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
