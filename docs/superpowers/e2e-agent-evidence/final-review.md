# Final whole-branch review — `feat/e2e-mobile` (74275d9..e24a989, 9 commits)

Reviewer: final-gate subagent. Inputs: full branch diff, spec, plan, ledger, task-4 report.
No suites were re-run; per-task reviews and the verification report carry that evidence.
Everything below was checked against files on disk or `git`, not against the reports' claims.

---

## A. Does the branch deliver the spec?

Walked section by section.

| Spec § | Requirement | Status |
|---|---|---|
| §1 | Two suites, `e2e` does not replace Playwright | **Met.** `apps/*/e2e/` and every `playwright.config.ts` are byte-identical (`git diff 74275d9..e24a989 -- 'apps/*/e2e/*' 'apps/*/playwright.config.ts'` → empty). |
| §2 | Disjoint dirs, never `e2e/` | **Met.** 9 new files, all under `e2e-agent/` + `e2e.config.ts`. |
| §2 | One `e2e.config.ts` per app, root config removed | **Met.** Three configs; no root `e2e.config.ts` exists. |
| §2 | `app.url` one per target, three apps on distinct ports | **Met, with a documented departure.** The two-target shape the spec implied is dead (runner gates every target on one `readyUrl` → `APP_UNREACHABLE`); one target + `serve.ts` per app. Deviation is argued in-file and in the ledger, and it is correct. |
| §3.1 | Landing: reuse `e2e/stub-api.ts`, replicate Playwright's dev command, TLS comment | **Met.** `serve.ts:199-206` spawns the existing `e2e/stub-api.ts` and `vite dev`; `reuseExisting:false` matches `playwright.config.ts:56-62`. |
| §3.2 | Admin: reuse `e2e/support/admin.ts`, keep the anti-vacuity guard | **Met in substance.** `support/admin.ts` is not imported (it is Playwright-bound), but its standard is *exceeded*: `auth-gate.e2e.ts` carries the loopback-destination assertion plus a recorded mutation proof (stub moved to 4111 → the suite falls exactly on line 199). |
| §3.3 | Mobile-web: same `export:web` + `static-server.mjs` artifact | **Met.** `serve.ts:435-447`. |
| §3 | `output` per app so `.e2e/` never lands at the root | **Met.** `git check-ignore` confirms all three; no root `.e2e` possible without a root config. |
| §4 | `E2E_TELEMETRY_DISABLED=1` in every script | **Met.** All four `package.json` scripts. |
| §4 | No `.env`, no secrets | **Met.** No new `.env`. The only literals are stub-only pairs (`admin@role.test` / `correct-horse-battery`) that are already committed in `apps/admin/e2e/fixtures/api-fixtures.ts:121-122`. |
| §4 | Anti-vacuity: exact values, never "the screen loaded" | **Met, and this is the strongest part of the branch.** See B3. |
| §4 | `cache: 'off'` | **Met** in the runner config. **Not met at the turbo layer** — see C1. |
| §5 | `test:e2e` stays Playwright | **Met.** All three app scripts unchanged. |
| §5 | `test:e2e:agent` green per app, measured on the real server | **Met.** 1/1 in each; no `dist` reuse (`reuseExisting:false` everywhere). |
| §5 | No change to `ci.yml` / `quality` | **Met.** Not in the diff. |
| §6 | No `agent.act`/`assert`/`explore` | **Met.** Grep clean. |
| §6 | No testIDs, no `apps/mobile/src` edits | **Met.** `boot.e2e.ts:4` *imports* `../src/core/i18n/strings`; no file under `src/` is modified. |

**Went beyond the spec, deliberately and for the better:** per-app `workers: 1`, `readyUrl` on
`/favicon.ico` instead of `app.url` (the spec never mentions `readyUrl`), process-tree cleanup,
exit-code propagation, a pre-flight port check, and mobile's single verdict-returning `poll`.
None of this is speculative: each one is a measured failure the implementer hit.

**Spec item no task delivered:** the plan's Task 4 Step 1 required a root `bun run test:e2e:agent`.
Task 1's brief listed only `turbo.json` + the app `package.json`, so the command did not exist
until the task-4 fix round. Closed now (`package.json:14`). Not a spec gap — a plan gap — but it
is the one deliverable that was late.

---

## B. Is it mergeable?

### B1. Coexistence with Playwright: it holds, and the trap is *partly* pre-announced

The mechanical hazards are real but contained:

- **Directory names.** `e2e/` vs `e2e-agent/` is exactly the confusion the spec warned about, and
  it is the lesser of the two evils — `e2e/agent/` would have been indistinguishable from
  `apps/admin/e2e/support`. `e2e.config.ts` sits *next to* `playwright.config.ts` at each app
  root, so the pairing is legible on `ls`.
- **Discovery.** The runner's glob is `e2e-agent/**/*.e2e.ts` and Playwright's specs are
  `*.spec.ts`. The two runners cannot pick up each other's files. Verified by construction, not
  by hope.
- **Ports.** This is the real trap. Per app, the agent suite hard-claims the *same* ports as
  Playwright (3101/3999, 3110/4110, 8085) with the *same* `reuseExisting:false`. The two suites
  therefore can never run concurrently, and — worse — a Playwright run from a sibling worktree
  looks identical to a stale process (`APP_ALREADY_RUNNING`, `EADDRINUSE`). The ledger parked
  this (C2/C3) **on the condition that "the config comments must say so."** That condition is
  only half-met: `apps/mobile/e2e-agent/serve.ts:408-426` names the collision in a runtime
  message, and `apps/landing`/`apps/admin` `e2e.config.ts` say nothing about it. Ledger ruling
  unmet for 2 of 3 apps.
- **Discoverability.** Nothing outside `docs/superpowers/` mentions `test:e2e:agent`. No
  `README.md`, no `AGENTS.md`, no `ci.yml` line. A developer who reads `apps/admin/README.md:73`
  (`bun run test:e2e`) learns about one suite; the second is only findable by `grep`ing for
  `e2e-agent`. Given that the branch's whole premise is "two suites, two ways to run e2e", that
  is the gap most likely to cause the trap the design set out to avoid.

### B2. The three `serve.ts` files: duplication is right, but the trio has already drifted

Verbatim duplication across three apps is the correct call here, and I would argue *against*
extracting. The shared core is ~130 lines (`spawn`/`killTree`/`shutdown` + the three handlers);
the app-specific halves are the majority and genuinely diverge — `admin` adds an awaited
`vite build` (69 lines), `mobile` adds `exportWeb()` + `assertPortFree()` (140 lines), `landing`
adds neither. A `packages/` module for the core would need cross-app TS project wiring and a new
consumer relationship the repo's own rule discourages, to save 130 lines of process bookkeeping.
Leave it.

**But the divergence that matters is real, and it produced two comments that are simply false:**

- `apps/landing/e2e-agent/serve.ts:74-77` and `apps/admin/e2e-agent/serve.ts:106-109` both argue
  the exit-code fix matters *because* "el puerto del stub NO tiene la pre-verificación que sí
  tiene el de la UI". **Neither file has any pre-verification.** `assertPortFree` exists in
  `apps/mobile/e2e-agent/serve.ts` and nowhere else (verified by `grep -ln`). The argument is
  still sound — 4110 gets no runner-side probe, so a collision there *is* silently misreported —
  but it rests on a mechanism those two files do not contain. A future reader will look for it.
- `apps/mobile/e2e-agent/serve.ts:364-365` says the pre-flight "se aplica igual por simetría del
  trío". It does not apply to the trío; it exists once.
- Structural drift confirms the pattern: `killAll()` exists only in `admin/serve.ts:176-178`;
  `landing` and `mobile` inline the same loop. Cosmetic, but it means the "mirrored trio" the
  comments insist on is not actually mirrored.

### B3. Do the tests assert anything real, or could any pass vacuously?

Against the `apps/admin/e2e/support/admin.ts` standard (every assertion must be able to fail):
**all three are non-vacuous, and each has a non-vacuity floor plus a recorded mutation proof.**

- `business-signup.e2e.ts:139-145` — `toHaveLength(1)` is the floor that makes :149-159 mean
  something. Without it, "no URL off loopback" would pass green on zero requests.
- `auth-gate.e2e.ts:181-187` — `apiUrls` `.not.toEqual([])` is the floor for :197-206, and the
  non-vacuity is *measured*: the suite was run with the stub on 4111 and fell precisely on :199.
- `boot.e2e.ts:207-213` — `staticEntries.length > 0` is the floor; :262-303 folds the other two
  checks into one verdict-returning `poll` whose resolution condition ("I saw backend traffic
  *and* nothing off-allowlist, in the same instant") cannot be satisfied by an empty buffer.

One asymmetry: mobile got the strong instant-invariant form; **admin did not.** `auth-gate.e2e.ts`
:197-225 is still three independent `poll`s that resolve on the first satisfying read, so :213-225
("nothing left loopback") is a statement about one instant and would miss a leak that starts
afterwards. Same shape the mobile reviewer rejected, left standing in admin. Low practical risk
(the panel has already loaded and rendered), but the two suites now disagree on the property
they claim.

### B4. Dead code, no-ops, misdescribing comments

Found, all Minor: mobile's exit table (`serve.ts:219-223`) lists three routes and omits the exit
code `2` that `assertPortFree` raises at `:429`; the two false pre-verification claims in B2;
`apps/mobile/e2e.config.ts:101` cites `@expo/cli/src/export/assets/saveAssets.js:245`, a path that
does not exist in `node_modules` (the shipped layout is `build/src/export/...`); and
`landing/serve.ts:103-105` claims the win32 branch is where "the bug se sintió primero" while its
two siblings say the opposite epistemic thing (not verifiable on a Linux box). Nothing is a no-op
or dead code — the ledger's "dead `shutdown(code ?? 1)`" item was correctly closed in the fix round
(`mobile/serve.ts:340-344` now explains why *that* file has no `?? 1`).

### B5. Committed material that should not be

- **Absolute machine path, in a runtime error message.** `apps/mobile/e2e-agent/serve.ts:418`
  ships `/mnt/c/Users/leonardo/role-bugreports` to whoever hits a busy 8085; `:367` repeats it in
  a comment. Meaningless on any other machine, and it names a colleague's local layout.
- No secrets, no `.env`, no scratch files, no test artifacts. `.superpowers/` self-ignores via
  `.superpowers/sdd/.gitignore`; `git status -uall` is clean.
- Typecheck coverage is fine and worth stating: all three `tsconfig.json` use `"include":
  ["**/*.ts", ...]`, so all 1,985 new lines are inside the `bun run typecheck` gate (6/6 PASS).
- Format coverage is **not** fine. `apps/{landing,admin}/biome.json` `files.includes` omit
  `e2e-agent/` and `e2e.config.ts`; `apps/mobile/biome.json` covers `**/e2e/**/*` but not
  `**/e2e-agent/**/*`. Net: **9 new files, 0 of them inside any format gate** — which is exactly
  how two unformatted landing files shipped and had to be caught by a scratch-dir harness.

---

## C. Ledger triage

### Must fix before merge

1. **`turbo.json:33-36` — `test:e2e:agent` inherits `cache: true`.** Not theoretical: the ledger
   records `4 cached, 4 total … FULL TURBO` for the branch's own headline command, a green that
   executed zero tasks. Turbo's `cache: "off"` in the *e2e runner's* config is a different cache
   and does not help. Add `"cache": false`. One line; it is the difference between a gate and a
   decoration.
2. **`apps/landing/e2e-agent/serve.ts:74-77` + `apps/admin/e2e-agent/serve.ts:106-109`** — remove
   or correct the claim that the UI port has a pre-verification these files do not contain.
3. **`apps/mobile/e2e-agent/serve.ts:367,418`** — drop the absolute machine path.
4. **Document the port collision** in `apps/landing/e2e.config.ts` and `apps/admin/e2e.config.ts`
   (mobile already says it), satisfying the ledger's own condition for parking C2/C3.

### Should fix, not blocking

5. `apps/*/biome.json` `files.includes`: add `**/e2e-agent/**/*` + `**/e2e.config.ts`. Three lines
   each; stops 2,000 lines from living permanently outside the gate.
6. One line of discoverability: `test:e2e:agent` in the root `README.md` command table (or the
   three app READMEs).
7. `apps/mobile/e2e-agent/serve.ts:219-223` — add the `exit 2` row; `:364-365` — drop the false
   "simetría del trío".

### Fine to leave (explicitly not rubber-stamped, just judged low-value)

- Port substring check accepting `39990` (`business-signup.e2e.ts:22`) — a hypothetical, and the
  `toHaveLength(1)` above it bounds the damage.
- `toHaveLength(1)` message says "ningún POST" when it fires on ≥2 — cosmetic message drift.
- `killTree` running twice; `exit`-hook win32 residual; win32 `taskkill` unreachable from the
  runner's stop path — all three are *documented honestly* in the files, which is the most the
  branch can do from Linux. Not a defect to fix, a limitation to keep written down.
- Hydration gate satisfied by a failed app-config request / route-specific signal — the gate's job
  is "React owns the DOM", and a failed fetch still proves the effect ran.
- Root `.e2e/` unignored — **false positive**: no root `e2e.config.ts` exists, so the root output
  cannot be produced. No action.
- `env: ["VITE_API_URL"]` inert in `turbo.json` — dead but harmless; worth deleting since it also
  pulls the dev's shell value into the turbo hash.
- `serve.ts` living inside the tests glob dir — `serve.ts` does not match `*.e2e.ts`; harmless.
- ~205s of authored per-assertion budgets inside the runner's 120s default test timeout (admin,
  mobile, and landing's 30s gate). **This is the branch's most fragile number** and the reason the
  aggregate needed `--concurrency=1` (landing: 62s of 120s serialized, red 2/2 in parallel). I
  uphold the fix round's refusal to bump the timeout — a bump would mask contention. But it is
  the first thing that will break under CI, and it should carry an owner and a date, not just a
  note.
- `package.json:14` `--concurrency=1` not in the turbo hash — subsumed by must-fix #1.
- Admin's three point-in-time polls (B3) — low practical risk; mobile's stronger form is the
  pattern to converge on later.
- `format:check` already red in `apps/mobile/src` at HEAD, and the 11 pre-existing
  `public-read-grants.spec.ts` failures — pre-existing, correctly not touched.

---

## D. What the four per-task reviews missed

Each task review saw one commit and none saw the branch.

1. **The turbo cache false-green is a branch-level defect that four reviews and the verification
   report all read past.** The task-4 report *observed* the false green (Anexo 2) and diagnosed it
   correctly as "turbo no mete el flag del script raíz en el hash", then fixed the flag. The
   underlying `cache: true` on an e2e task survived into HEAD. Nobody asked whether the task
   should be cacheable at all. It should not.
2. **The two false "pre-verificación" comments are a cross-file contradiction only visible with
   the whole branch.** Each task review read its own `serve.ts` in isolation and found the
   reasoning locally coherent.
3. **Typecheck coverage of the new files is a branch-level question nobody asked.** It happens to
   be fine (three `tsconfig.json` with `**/*.ts`), but it was assumed rather than checked, and it
   is the difference between "1,985 new lines are gated" and "1,985 new lines are not".
4. **The `apps/mobile/.gitignore`-adjacent question nobody asked: is the new output actually
   ignored, or just never produced?** It is genuinely ignored (verified), which is stronger than
   the ledger's "git status clean" evidence.
5. **`--concurrency=1` is a workaround for a per-test budget, recorded as a script fix.** Nobody
   wrote down that the underlying cause — landing at 62s of a 120s default — is still there and is
   the branch's most likely CI failure. It appears only as "parked as debt for the final review"
   in the ledger.

---

## Verdict

**merge-with-fixes.** The four must-fixes are one line of `turbo.json`, two comment corrections,
one absolute path, and one missing sentence per config. None of them touches a test, a config
shape, or the design. The engineering quality of the suite itself — non-vacuity floors, mutation
proofs, honest scope statements about what could not be verified from Linux — is above what this
repo's other e2e work reaches, and the duplication judgement (do not extract) is correct.
---

# Fix round — must-fix C1..C4 + should-fix C5

Subagent: fix-round. Scope: config/comment-level only. No test assertion, no config
shape, no design, no `apps/*/e2e/`, no `playwright.config.ts`, no `apps/mobile/src`.

Diff: 9 files, comments + 4 config files only (`git diff` at HEAD~1).

---

## Fix 1 (C1) — `turbo.json`: `test:e2e:agent` is no longer cacheable

`turbo.json:33-37`, added `"cache": false` to the task. One line, plus the trailing
comma on the `env` line.

The false green is not argued, it is **reproduced and then closed on the same
cache entry**. Cheapest app first (`role-landing`, ~1m50s per real run), so the
cache slot can be filled and replayed inside the round.

**BEFORE — `turbo.json` at HEAD, no `cache: false`:**

```sh
git stash push -- turbo.json
bunx turbo run test:e2e:agent --filter=role-landing   # run A
bunx turbo run test:e2e:agent --filter=role-landing   # run B, immediately after
```

```
=== BEFORE run A ===
role-landing: ... 1 passed (1)          (executed)
 Tasks:    2 successful, 2 total
Cached:    1 cached, 2 total
  Time:    1m47.254s

=== BEFORE run B ===
role-landing:test:e2e:agent: cache hit, replaying logs 4c079a16765c303b
 Tasks:    2 successful, 2 total
Cached:    2 cached, 2 total
  Time:    2.983s >>> FULL TURBO
```

Run B is the defect: `4c079a16765c303b` replayed in 2.98 s, `FULL TURBO`, zero
suites executed. Note that the cache entry **stays on disk** after the fix — that
is the point: the fix has to defeat an entry that really exists, not one that a
cache flush happened to remove.

**AFTER — same working tree, same turbo cache, `cache: false` restored:**

```sh
git stash pop
bunx turbo run test:e2e:agent --filter=role-landing
bunx turbo run test:e2e:agent --filter=role-landing
```

```
role-landing:test:e2e:agent: cache bypass, force executing 4c079a16765c303b
role-landing:test:e2e:agent:  ✓ target "landing" command ready 28.14s
role-landing:test:e2e:agent:  Test Files  1 passed (1)
 Tasks:    2 successful, 2 total
Cached:    1 cached, 2 total
  Time:    1m53.916s          (03:34:10 → 03:36:04)

# and once more
role-landing:test:e2e:agent: cache bypass, force executing 4c079a16765c303b
 Tasks:    2 successful, 2 total
Cached:    1 cached, 2 total
  Time:    1m51.542s          (03:36:04 → 03:37:56)
```

**Identical hash `4c079a16765c303b`: `cache hit … replaying` before, `cache
bypass, force executing` after.** The one remaining cached task in every run is
`@0xc1x/role-commons#build`, which is a real build and should stay cached.

Full headline command, all three apps, twice (`bun run test:e2e:agent` from the
worktree root, `--concurrency=1` from `package.json:14`):

```
===== RUN 1 =====  03:15:39
role-mobile:test:e2e:agent:      cache bypass, force executing 44c16215d4afa2ed
  ✓ target "mobile" command ready   198.13s total (startup 179.04s)  1 passed (1)
role-front-admin:test:e2e:agent: cache bypass, force executing 5ec55443dfa9b710
  ✓ target "admin" command ready     88.01s                        1 passed (1)
role-landing:test:e2e:agent:      cache bypass, force executing 4c079a16765c303b
  ✓ target "landing" command ready   27.15s                        1 passed (1)
 Tasks:    4 successful, 4 total
Cached:    1 cached, 4 total       Time: 7m26.257s                 03:23:06

===== RUN 2 =====  03:24:01
role-mobile:test:e2e:agent:      cache bypass, force executing 44c16215d4afa2ed
  ✓ target "mobile" command ready   199.06s                        1 passed (1)
role-front-admin:test:e2e:agent: cache bypass, force executing 5ec55443dfa9b710
  ✓ target "admin" command ready     87.00s                        1 passed (1)
role-landing:test:e2e:agent:      cache bypass, force executing 4c079a16765c303b
  ✓ target "landing" command ready   27.61s                        1 passed (1)
 Tasks:    4 successful, 4 total
Cached:    1 cached, 4 total       Time: 7m43.485s                 03:31:45
```

Both runs execute: no `FULL TURBO`, no `test:e2e:agent` cache hit, three real
starts of three real servers, 3/3 suites green each time. 1/1 per app is the same
count the branch already reported, so nothing was masked by the earlier green.

## Fix 2 (C3) — no absolute machine path left in shipped code

`apps/mobile/e2e-agent/serve.ts`:

- **`:362-372`** (doc comment of `assertPortFree`) — the `role-bugreports`
  worktree sentence is replaced by the mechanism that actually generalises: 8085
  is the default of `MOBILE_E2E_PORT`, so any Playwright run of this app, **or of
  another worktree of this repo on another branch**, takes the same port. The
  same paragraph now also says the plain thing the trio symmetry was standing in
  for: `assertPortFree` belongs to THIS file only (see Fix 3).
- **`:417-419`** (the runtime `console.error` message) — `"la worktree
  /mnt/c/Users/leonardo/role-bugreports, que también levanta un server en 8085,"`
  becomes `"la suite de Playwright de otra worktree de este repo (mismo default de
  MOBILE_E2E_PORT, mismo puerto),"`. Same diagnostic value, no path, no branch
  name, no colleague's directory layout. Not made configurable: the message needs
  to enumerate causes, and a knob for a list of guesses would be worse than the
  list.

Repo-wide sweep — `grep -rn "/mnt/c/\|/home/" apps/ packages/ turbo.json package.json docs/ .superpowers/`:

- Shipped code / config: **0 hits.** The only pre-existing matches are
  `/home/` inside a regex in `apps/admin/.e2e/report.json` (a generated artifact)
  and absolute paths inside `apps/admin/.output/**` (build output).
- `docs/superpowers/plans/2026-10-01-e2e-agent-web.md` (18 lines) and
  `.superpowers/sdd/**` (self-ignored working notes) still contain
  `cd /mnt/c/Users/leonardo/Repositories/role/.worktrees/e2e-mobile`. **Decision:
  left as-is, on purpose.** Those are the historical records of the commands that
  were actually run and of the rulings that were actually taken, including
  `progress.md:102`'s `/proc/<pid>/cwd` distinguishing test for the port
  collision — that one is the evidence behind Fix 4. Rewriting a plan retroactively
  would destroy the record; neither file is read by code or shown in a failure.
  Consistency rule adopted: **shipped code and config carry zero machine paths;
  process records keep theirs.**

## Fix 3 (C2) — comments that described a check those files do not contain

Confirmed the reviewer's grep first:

```sh
grep -rn "assertPortFree" apps/ --include=*.ts
apps/mobile/e2e-agent/serve.ts:365   (the doc comment)
apps/mobile/e2e-agent/serve.ts:380   async function assertPortFree(
apps/mobile/e2e-agent/serve.ts:437   await assertPortFree();
```

One implementation, one call site, mobile only. The three comments now describe
their own file:

- `apps/landing/e2e-agent/serve.ts:74-80` — was "el puerto del stub NO tiene la
  pre-verificación que sí tiene el de la UI". Now: this file has **no**
  pre-verification for 3999 *or* 3101; the runner only probes `readyUrl` once the
  command started, so a collision on either port is visible **only** through this
  exit code — which is why the propagation is this app's only reporting mechanism,
  and mobile's pre-flight belongs to that file, not to the trio.
- `apps/admin/e2e-agent/serve.ts:106-112` — same rewrite for 4110/3110, citing the
  measured `Failed to start server. Is port 4110 in use?` that used to be buried
  under the misleading headline.
- `apps/mobile/e2e-agent/serve.ts:364-367` — "el patrón se aplica igual por
  simetría del trío" is gone; it now states that neither of the other two brings
  it and points at how those two report instead.

The argument itself was never wrong (a collision on the runner-silent port *is*
misreported without this) — only the mechanism it rested on was in a different
file. **No port check was added to landing/admin**: that would be scope creep, and
the honest statement of the limitation is now in the place a reader actually is.

## Fix 4 (C4) — the port collision is now documented in the two configs that lacked it

- `apps/landing/e2e.config.ts:59-71` — new block after `readyUrl`: 3101/3999 are
  the same ports `apps/landing/playwright.config.ts:26-27` uses, same defaults, no
  env var separating them, so the two suites can never run concurrently in this
  app and another worktree's run looks like a stale process
  (`APP_ALREADY_RUNNING`, `EADDRINUSE`). Marked as a parked, deliberate
  limitation, with the operational consequence: one suite per app.
- `apps/admin/e2e.config.ts:57-70` — same, for 3110/4110 against
  `apps/admin/playwright.config.ts:13-14` (`ADMIN_E2E_PORT` / `ADMIN_E2E_STUB_PORT`).

Ports not refactored, as instructed. mobile already said it
(`e2e.config.ts:115-122` on `reuseExisting`, plus the runtime message at
`serve.ts:418`), so the ledger's condition for parking C2/C3 — "the config
comments must say so" — is now met for 3 of 3 apps.

## Fix 5 (C5) — the 9 new files are inside the format gate

`files.includes` extended in all three `biome.json` with `"**/e2e-agent/**/*"`
and `"**/e2e.config.ts"`:

- `apps/mobile/biome.json:15-17` (which already had `**/e2e/**/*` for Playwright)
- `apps/landing/biome.json:13-15`
- `apps/admin/biome.json:14-16`

### Files now inside the gate: 0 → 9, and none of them is unformatted

```sh
for a in landing admin mobile; do (cd apps/$a && bun run format:check); done
```

| app | files checked before | after | delta | violations before | violations after |
|---|---|---|---|---|---|
| landing | 73 | **76** | +3 | 0 | **0** |
| admin | 372 | **375** | +3 | 0 | **0** |
| mobile | 380 | **383** | +3 | **3** | **3** |
| commons | 195 | 195 | 0 | 0 | 0 |

+3 per app = 1 `e2e.config.ts` + 2 `e2e-agent/*.ts`, i.e. all 9 new files. Each
one verified individually as well, and the total is the same 3 files before and
after, all inside `apps/mobile/src` (untouched by this round):

```
src/core/i18n/operator-identity.ts
src/core/theme/author-palette.contrast.test.ts
src/features/auth/data/social-auth.test.ts
```

**Repo-wide `format:check` violation count: 3 before, 3 after — unchanged.** The
known pre-existing red is not made worse, and the 2 landing files that shipped
unformatted could not ship that way again.

```sh
bun run format:check      # from the worktree root
@0xc1x/role-commons:format:check: Checked 195 files … No fixes applied.
role-landing:format:check:       Checked  76 files … No fixes applied.
role-mobile:format:check:        Checked 383 files … Found 3 errors.
role-front-admin:format:check:   Checked 375 files … No fixes applied.   (run in apps/admin)
```

### On the `bunx biome` trap called out in the brief

Every biome invocation above ran **from inside the app directory** (`cd
apps/$a && bun run format:check`, i.e. the repo's own `biome format .` script
resolving the root `@biomejs/biome` devDependency, `^2.5.14`) — never
`bunx biome` from a scratch dir, which would resolve the unrelated `biome@0.3.3`
and format nothing. Two independent confirmations that the extended config is
really in force: the per-app file count moved 73→76 / 372→375 / 380→383, which is
only possible if the 9 new files entered the traversal; and each new file passed
an explicit `biome format <file>` check (`Checked 1 file … No fixes applied`,
x9).

## Verification

```sh
bun run typecheck
# role-landing / role-front-admin / role-mobile / role-api: tsc --noEmit
#  Tasks:    6 successful, 6 total      Time: 1m14.959s

bun run test:e2e:agent                 # 3/3 suites green, twice, no cache
bun run format:check                   # 3 violations, all pre-existing in mobile/src
```

Not run: `bun run test` (untouched areas), `bun run build` (turbo ran
`^build` for commons on every e2e run above and it was a cache hit). Playwright
`test:e2e` not run: no `playwright.config.ts`, `apps/*/e2e/` or `src/` file is
in this diff.

## Not done (deliberate, out of this round's scope)

C6 (discoverability of `test:e2e:agent` in a README), C7 (the `exit 2` row in
mobile's exit table, `serve.ts:219-223`, and the false win32 "se sintió primero"
claim in landing `serve.ts:103-105`), admin's three point-in-time polls (B3), and
the ~205 s of authored per-assertion budgets against the runner's 120 s default.
The last one is still the branch's most fragile number and still has no owner or
date.
