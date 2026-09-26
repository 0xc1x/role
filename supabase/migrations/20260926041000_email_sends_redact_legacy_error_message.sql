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
-- WHAT IT DOES: rewrites every non-null error_message that is not a
-- recognizable fingerprint, replacing it with a fixed marker. It does not try
-- to guess a fingerprint from the old text: the exception type is not
-- recoverable from a Resend message, and inventing one would be a lie about
-- the diagnostic.
--
-- WHAT COUNTS AS A FINGERPRINT, AND WHY IT IS ONLY THE TWO-PART SHAPE
-- safeErrorSummary emits either `errorType` (when the error carries no `code`)
-- or `errorType:errorCode`. A two-part value is recognized as a fingerprint and
-- left alone.
--
-- A BARE `errorType` is not recognized, and that is a deliberate choice, not an
-- oversight. Shape cannot separate it from single-word provider text:
--   - API fingerprint: `Error`, `NotFoundException`, `PostgrestError`
--   - provider text:    `Forbidden`, `Timeout`, `validation_error`
-- Both are one word inside the same character class, and the column carries no
-- provenance that would break the tie. A previous version of this file tried to
-- recognize both and its comment claimed the conservative preference "rewrite
-- anything that does not fit" — a claim its own regex did not honor, because
-- that regex left every single-word value untouched, including the exact class
-- it claimed to catch. This version honors the preference: when in doubt, the
-- leak is removed.
--
-- The cost of that choice, stated plainly: a row whose fingerprint is a bare
-- `errorType` is also rewritten to the marker. `Error` alone is not an
-- actionable diagnosis — the actionable part is the provider code, which the
-- two-part shape does carry — so nothing an operator could act on is lost. Rows
-- written AFTER this migration with a bare `errorType` are NOT touched by it;
-- see the idempotency note below.
--
-- WHAT IT DOES NOT DO: it does not change the column, the schema, or the API.
-- The API keeps writing the fingerprint for new sends; only historical rows
-- are rewritten here.
--
-- IDEMPOTENCY, PRECISELY: the marker below is itself a two-part fingerprint, so
-- re-running this file never rewrites a row this file already rewrote. That is
-- the whole of the guarantee. A re-run at a LATER time can still rewrite rows
-- the API wrote after the first run whose fingerprint is a bare `errorType`
-- (`Error`, `NotFoundException`, …) — that is the same "prefer the leak removal"
-- rule applied consistently, not a defect. Do not rely on a re-run being a
-- no-op for rows this file has never seen.
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
-- original text; re-running this file does not change rows it already rewrote.
-- ===============================================================================

begin;

do $$
declare
  v_marker constant text := 'Error:legacy_redacted';
  -- Mirror de `safeErrorSummary`: tipo acotado, ':' y código acotado. El valor
  -- de una columna NOT NULL nunca es NULL, así que no hace falta un predicado
  -- `is distinct from` para el marcador cuando el WHERE exige el `:`.
  v_fingerprint constant text := '^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}:[A-Za-z0-9_.:-]{1,63}$';
  v_affected integer;
  v_total integer;
begin
  select count(*) into v_total
    from public.email_sends
   where error_message is not null;

  update public.email_sends
     set error_message = v_marker
   where error_message is not null
     and error_message !~ v_fingerprint;

  get diagnostics v_affected = row_count;

  if v_affected > 0 then
    raise notice 'email_sends: % de % filas con error_message reescritas a % (backfill histórico, destructivo)',
      v_affected, v_total, v_marker;
  else
    raise notice 'email_sends: sin filas que redactar (todo lo que queda son huellas de dos partes o el marcador)';
  end if;
end $$;

commit;
