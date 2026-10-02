# Re-review — `e24a989..bec421a` (fix wave)

Scope: verify the five findings from `final-review.md` were addressed. No new lines of
inquiry beyond breakage introduced by this diff.

Verification commands actually run (all from the worktree root, tree clean at `bec421a`):

```sh
bunx turbo run test:e2e:agent --dry=json      # cache state of all 5 tasks
git grep -nI -E "leonardo|/mnt/[a-z]/|role-bugreports"
./node_modules/.bin/biome format --config-path=<old-cfg> .   # per app, before vs after
for a in mobile landing admin; do (cd apps/$a && ../../node_modules/.bin/biome format e2e.config.ts e2e-agent/); done
bun run typecheck                             # 6 successful, 6 total (cache restore of bec421a)
```

## Per-finding verdict

### 1 (Critical) — turbo task inheriting `cache: true` → **ADDRESSED**

`turbo.json:33-37` — `"cache": false` sits inside the `test:e2e:agent` task object,
alongside `dependsOn` and `env`, correctly formed (boolean, trailing-comma correct,
valid JSON). It is on the right task and nowhere else.

Does it actually kill the false green? Verified rather than assumed, via turbo's own
resolved plan:

```
@0xc1x/role-commons#test:e2e:agent  cache={"local":false,"remote":false,"status":"MISS"}
role-api#test:e2e:agent             cache={"local":false,"remote":false,"status":"MISS"}
role-front-admin#test:e2e:agent     cache={"local":false,"remote":false,"status":"MISS"}
role-landing#test:e2e:agent         cache={"local":false,"remote":false,"status":"MISS"}
role-mobile#test:e2e:agent          cache={"local":false,"remote":false,"status":"MISS"}
```

All 5 tasks — including the three with no `test:e2e:agent` script — resolve to
`local:false, remote:false`, so turbo cannot print `FULL TURBO` or restore a log for
this task again. The finding's distinction is preserved correctly: `^build` still
caches (desirable), only the e2e fan-out is uncached.

### 2 (Important) — hardcoded `/mnt/c/Users/leonardo/role-bugreports` → **ADDRESSED**

Zero occurrences remain in tracked shipped code. `git grep -I` across the whole repo
returns exactly two tracked files, neither of them code: the plan doc (see the
disclosure below) and a pre-existing `supabase/migrations/*.sql` comment containing
an email address (untouched by this diff, out of scope).

`apps/mobile/e2e-agent/serve.ts:370-373` replaces the worktree paragraph with a claim
that is actually true and actually useful: 8085 is `MOBILE_E2E_PORT`'s default
(`apps/mobile/playwright.config.ts:46`), so any other worktree of this repo on another
branch collides identically. Not a scrub — a generalization.

The runtime message at `serve.ts:414-427` is now generic *and* still diagnostic: it
names three plausible causes (this app's own Playwright suite, another worktree of
this repo, a stale `e2e/static-server.mjs`), gives the exact
`lsof -i :${port}` command, keeps the "don't kill it, it isn't ours" warning, and
still exits with its own distinct code `2` so the runner's log blames the port and
not the bundle. A reader hitting a busy 8085 loses nothing actionable.

### 3 (Important) — comments arguing from a check the files don't contain → **ADDRESSED**

Checked the claims against the code they describe, not against the diff's own prose.

- `apps/landing/e2e-agent/serve.ts:74-80` and `apps/admin/e2e-agent/serve.ts:106-112`
  now say there is **no** pre-flight for *either* port, and point at
  `apps/mobile/e2e-agent/serve.ts` as the file that owns one. Verified true:
  `grep -n "assertPortFree\|Bun.connect"` finds the function only at
  `mobile/e2e-agent/serve.ts:380` (called at `:437`); landing and admin match only
  the word `EADDRINUSE` inside their own comments, never a probe.
- The "trio symmetry" claim in `mobile/e2e-agent/serve.ts:365-368` is gone and
  replaced by "es de ESTE archivo únicamente, no del trío", with the two other files
  named as the ones that report collisions through the child's exit code instead.
  Also true: their `spawn` handlers propagate `shutdown(code ?? 1)` rather than
  flattening to 0.
- Both corrected comments retain the runner citation `managed-process.js:141-147`
  for "the runner only probes `readyUrl` once the command started". Verified against
  the installed runner (`node_modules/.bun/e2e@0.15.1+759ce506b1ed1a42/.../run/managed-process.js`):
  lines 136-147 are the `readyUrl` probe, the `reuseExisting` branch and the
  `APP_ALREADY_RUNNING` throw. The line range is right.
- No port check was added to landing or admin, as instructed.

So: not "less wrong" — each comment now describes what its own file does.

### 4 (Important) — port sharing with `playwright.config.ts` undocumented → **ADDRESSED**

`apps/landing/e2e.config.ts:59-71` and `apps/admin/e2e.config.ts:57-70` both gained the
note immediately after `readyUrl`, and every factual claim checks out:

| claim in the note | verified |
| --- | --- |
| landing cites `playwright.config.ts:26-27` for 3101/3999 | `apps/landing/playwright.config.ts:26,27` are exactly `const PORT = 3101` / `const STUB_API_PORT = 3999` |
| admin cites `playwright.config.ts:13-14` for 3110/4110 | `apps/admin/playwright.config.ts:13,14` are exactly the `ADMIN_E2E_PORT ?? 3110` / `ADMIN_E2E_STUB_PORT ?? 4110` pair |
| no env var separates the suites | landing hardcodes both constants in both files; admin's env vars are shared with the agent config |

Both mark it a known, deliberately parked limitation with the operational consequence
(one suite per app, never both in parallel), and both name the misleading-symptom
collision (`APP_ALREADY_RUNNING`, `EADDRINUSE`). Ports were not refactored, as
instructed.

One nit, not a defect: landing's "con los mismos defaults" is loose — that file has
hardcoded constants, not defaults behind an env var (admin's wording is exact). The
substantive claim is right; only the word "defaults" is imprecise.

### 5 (Important) — `e2e-agent/` and `e2e.config.ts` outside the format gate → **ADDRESSED**

`files.includes` extended in all three: `apps/mobile/biome.json:16-17`,
`apps/landing/biome.json:14-15`, `apps/admin/biome.json:15-16`. Exactly 9 tracked files
now enter the traversal (`git ls-files "apps/*/e2e-agent/**" "apps/*/e2e.config.ts"` → 9),
and all 9 pass: `Checked 3 files … No fixes applied.` in each of the three apps.

**Did it increase the pre-existing violation count? No — verified independently**, by
running the same `biome format .` per app against the *old* `biome.json` from
`e24a989` (with `vcs.enabled`/`useIgnoreFile` off so the config resolves outside its
dir) and against the new one:

| app | files checked before → after | violations before | violations after |
| --- | --- | --- | --- |
| landing | 72 → 76 (+4: 2 agent + 1 config + 1 ignore-file delta) | 0 | 0 |
| admin | 371 → 375 | 3 | 3 |
| mobile | 379 → 383 | 3 | 3 |
| **total** | | **6** | **6** |

Delta is zero. The 3 mobile ones are in `src/core/i18n/operator-identity.ts`,
`src/core/theme/author-palette.contrast.test.ts`,
`src/features/auth/data/social-auth.test.ts`.

**Correction to the implementer's report, which does not change the verdict:** the claim
"Repo-wide `format:check` violation count: 3 before, 3 after" and the table row
"admin: violations before 0, after 0" are both wrong. `apps/admin` has **3**
pre-existing violations, in `src/features/__tests__/tables-columns.test.ts`,
`src/features/orders/lib/__tests__/order-status-actions.test.ts` and
`src/features/orders/tables/__tests__/orders.columns.test.tsx`. The repo-wide number
is **6 before and 6 after**, not 3. Those admin files were already inside the gate via
the pre-existing `**/src/**/*` include, so the conclusion (the change newly surfaced
nothing) still holds — but the evidence offered for it was wrong on two of four rows,
and `bun run format:check` at the root does report 6 errors, not 3.

## New breakage introduced by this diff

None at Critical or Important.

- Typecheck green (`bun run typecheck`, 6/6 successful).
- No behavioral code changed anywhere in the diff: the mobile/landing/admin `serve.ts`
  hunks are comments and one comment-block edit inside the `console.error` array; both
  `e2e.config.ts` hunks are comment additions; `biome.json` gains two include patterns;
  `turbo.json` gains one key. No executable statement was added, removed, or reordered.
- Out-of-scope areas confirmed untouched by `git diff --stat e24a989..bec421a`: nothing
  under `apps/*/e2e/`, no `playwright.config.ts`, nothing in `apps/mobile/src`, nothing
  in `.github/`.

## Disclosure: machine paths left in `docs/superpowers/plans/**` and `.superpowers/**`

**Acceptable, with one correction of fact and one cheap improvement.**

- `.superpowers/sdd/**` is **not tracked** — `git ls-files .superpowers` returns 0 files.
  Half of the stated policy ("process records keep theirs") applies to files that never
  enter the repo at all, so that half of the disclosure is moot, not a judgement call.
- `docs/superpowers/plans/2026-10-01-e2e-agent-web.md` is tracked and carries 18 lines
  of `cd /mnt/c/Users/leonardo/Repositories/role/.worktrees/e2e-mobile/...`. These are
  not secrets, and the diff's judgement — shipped code carries zero machine paths — is
  the right line to draw. The residue is low severity: no credentials, nothing that
  changes behaviour, and a plan document is legitimately a record of *this* machine's
  session.
- Still, the paths are strictly worse than the repo-relative equivalent
  (`cd apps/landing`). A `cd /mnt/c/Users/leonardo/...` line is not runnable by any other
  developer and leaks a local username into a shared repo for zero benefit. Since the
  plan is already committed, the mechanical fix is `sed`-cheap. Not a blocker for this
  wave; worth a follow-up before more plan docs accumulate the habit.

## Out-of-scope observations on untouched code

- `apps/*/.output/` build artifacts embed absolute machine paths
  (`filePath: "/mnt/c/Users/leonardo/..."`). Untracked/gitignored, so not a finding —
  but it means a shipped `.output/` tarball would leak them.
- `supabase/migrations/20260507195823_insert_seed_auth_users_and_profiles.sql:61`
  contains a real-looking email in a comment. Pre-existing, unrelated to this diff.
- Still parked from the prior round and still open: landing `serve.ts` win32 "se sintió
  primero" claim, mobile's exit-code table missing the `exit 2` row
  (`serve.ts:219-223`), admin's three point-in-time readiness polls, C6 discoverability,
  and the ~205 s of authored per-assertion budgets against the runner's 120 s default —
  still the branch's most fragile number, still unowned.

## Verdict

Five of five findings addressed. No new Critical or Important breakage in this diff.
Two follow-ups, neither blocking: the `format:check` baseline in the written report
says 3 when it is 6, and the plan doc's absolute paths could be repo-relative.