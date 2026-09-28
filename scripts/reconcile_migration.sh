#!/usr/bin/env bash
# Reconcile a migration file with what the server actually stored.
#
# WHY THIS EXISTS
#
# `apply_migration` does not reliably round-trip the comment block. In the first
# migration of this batch it silently dropped two middle comment lines, so the
# file I composed and the statement in the ledger differed — and the only proof
# that a migration ran is `md5sum <file> == md5(statements[1])`.
#
# So the file is written FROM the ledger, never from what was composed. The
# ledger is the ground truth of what ran; the composed text is a draft.
#
# Two byte-level traps, both hit for real:
#   - `psql -t -A` appends a trailing newline, so the dump is one byte longer
#     than `octet_length(statements[1])`. Truncate to the ledger's own length.
#   - Compare with `octet_length`, never `length`: Postgres counts characters
#     and the statement is UTF-8, so trimming to a character count truncates
#     every accented string in the file.
#
# Usage: reconcile_migration.sh <snake_case_name>
set -euo pipefail

NAME="${1:?usage: reconcile_migration.sh <snake_case_name>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

set -a; . apps/api/.env; set +a
Q() { psql "$DATABASE_URL" -t -A -c "$1" 2>/dev/null | head -1 | tr -d '[:space:]'; }

VERSION="$(Q "select version from supabase_migrations.schema_migrations where name = '$NAME'")"
[ -n "$VERSION" ] || { echo "FAIL: no ledger row named '$NAME'"; exit 1; }

LEDGER_LEN="$(Q "select octet_length(statements[1]) from supabase_migrations.schema_migrations where version = '$VERSION'")"
LEDGER_MD5="$(Q "select md5(statements[1]) from supabase_migrations.schema_migrations where version = '$VERSION'")"

TMP="$(mktemp)"
psql "$DATABASE_URL" -t -A -c "select statements[1] from supabase_migrations.schema_migrations where version = '$VERSION'" > "$TMP" 2>/dev/null
DUMP_LEN="$(stat -c%s "$TMP")"
if [ "$DUMP_LEN" -ne "$LEDGER_LEN" ]; then
  truncate -s "$LEDGER_LEN" "$TMP"
fi

TARGET="supabase/migrations/${VERSION}_${NAME}.sql"
mv "$TMP" "$TARGET"
rm -f "supabase/migrations/pending_${NAME}.sql" 2>/dev/null || true

FILE_MD5="$(md5sum "$TARGET" | cut -d' ' -f1)"
echo "  version: $VERSION"
echo "  bytes:   file $(stat -c%s "$TARGET") / ledger $LEDGER_LEN"
echo "  md5:     file $FILE_MD5"
echo "          ledg $LEDGER_MD5"
if [ "$FILE_MD5" = "$LEDGER_MD5" ]; then
  echo "  OK: the file is byte-for-byte what the server executed -> $TARGET"
else
  echo "  FAIL: file and ledger disagree. Do not commit."; exit 1
fi
