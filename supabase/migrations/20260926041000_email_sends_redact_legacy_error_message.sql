-- Redact legacy provider text in email_sends.error_message.
--
-- WHY: a7fac68 stopped persisting the raw Resend error message on the send
-- failure path; from that commit on, error_message holds the bounded
-- fingerprint written by safeErrorSummary (`Error`, `NotFoundException:E42`).
-- No backfill ever ran, so rows written BEFORE that commit still hold the raw
-- provider text, which the same commit identified as potentially containing
-- provider account identifiers and recipient addresses. The admin renders this
-- column, so the leak is one operator screen away.
--
-- WHAT IT DOES: rewrites only the values that are not already a fingerprint,
-- replacing them with a fixed marker. It does not guess a fingerprint from the
-- old text: the exception type is not recoverable from a Resend message, and
-- inventing one would be a lie about the diagnostic. Rows that already look
-- like a fingerprint are left untouched, so the migration is idempotent.
--
-- WHAT IT DOES NOT DO: it does not change the column, the schema, or the API.
-- The API keeps writing the fingerprint for new sends; only historical rows
-- are rewritten here.
--
-- ============================== APPLY ORDER WARNING ==============================
-- NOT APPLIED. A maintainer must apply it through apply_migration (never
-- execute_sql, never the dashboard) and then rename the file to the version
-- the server assigned, confirming
-- md5sum <file> == md5(statements[1]) in supabase_migrations.schema_migrations.
--
-- TRADEOFF THE MAINTAINER MUST DECIDE, BEFORE APPLYING:
-- This backfill is irreversible and it DESTROYS forensic evidence. The raw
-- text is the only record of why historical sends failed; once it is gone, an
-- investigation of past delivery failures has nothing left to read. The
-- server-side log may still hold the same text (the API logged the raw
-- message before a7fac68), so the loss is recoverable only if those logs
-- still cover the period. Choose deliberately:
--   a) apply now and accept the loss, or
--   b) export the affected rows (id, created_at, error_message) to an
--      access-controlled archive first, or
--   c) do not apply, and instead restrict who can read the column until the
--      archive exists.
-- Recommendation: (b). The compliance exposure and the forensic value point in
-- opposite directions, and only the maintainer knows the retention window of
-- the server logs.
--
-- ROLLBACK: not reversible. There is no down-migration that recovers the
-- original text; re-running this file is a no-op.
-- ===============================================================================

begin;

do $$
declare
  v_affected integer;
  v_total integer;
begin
  -- Un valor de la API post-a7fac68 siempre es un identificador corto sin
  -- espacios: `safeErrorSummary` solo emite `errorType` o `errorType:errorCode`,
  -- y `safeField` restringe ambos a [A-Za-z0-9][A-Za-z0-9_.:-]{0,63}. Cualquier
  -- valor con espacios es texto de proveedor heredado. La condición es
  -- deliberadamente conservadora: un valor que no encaje se reescribe, y eso es
  -- preferible a dejar una posible fuga.
  select count(*) into v_total
    from public.email_sends
   where error_message is not null;

  update public.email_sends
     set error_message = 'Error (redactado — fila histórica)'
   where error_message is not null
     and error_message !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$';

  get diagnostics v_affected = row_count;

  if v_affected > 0 then
    raise notice 'email_sends: % de % filas con error_message reescritas (backfill histórico, destructivo)',
      v_affected, v_total;
  else
    raise notice 'email_sends: sin filas heredadas que redactar (backfill ya aplicado o sin datos previos)';
  end if;
end $$;

commit;
