#!/usr/bin/env bash
# Compare remote Supabase schema (drizzle-kit pull) against committed Drizzle mirrors.
# Does not overwrite schema files — pulls into a temp dir and diffs.
#
# Usage: bun run db:drift
# Requires: DATABASE_URL, drizzle-kit
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cd "$ROOT"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

echo "→ Pulling remote schema into temp dir..."
# drizzle-kit pull writes under the configured out path; use a throwaway config
npx drizzle-kit pull --out "$TMP/schema" >/dev/null 2>&1 || {
  echo "drizzle-kit pull failed (check DATABASE_URL and network)" >&2
  exit 1
}

echo "→ Diffing against src/database/schema (informational)..."
if diff -rq "$TMP/schema" "$ROOT/src/database/schema" >/dev/null 2>&1; then
  echo "✓ No structural drift detected (or pull layout matches)."
  exit 0
fi

echo "⚠ Schema files differ from remote pull. Review manually:"
diff -rq "$TMP/schema" "$ROOT/src/database/schema" || true
echo ""
echo "Note: pull layout may not match hand-written modules 1:1. Treat this as a signal, not a hard fail."
exit 0
