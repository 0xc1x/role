# SDD ledger — plan: docs/superpowers/plans/2026-10-01-e2e-agent-web.md

Branch: `feat/e2e-mobile` (worktree `.worktrees/e2e-mobile`, base `47c9ee8`)
Spec: `docs/superpowers/specs/2026-10-01-e2e-agent-web-design.md` (reachable — rulings are provisional-free)

## Pre-flight conflict scan

Pairs of tasks sharing a file or interface:

| Tasks | Shared | Produces → consumes | Found |
| --- | --- | --- | --- |
| 1 → 2, 3 | `package.json` root devDeps | Task 1 installs `e2e`+`@e2e-dev/web`; 2 and 3 only add a script | Clean. No task re-adds the deps. |
| 1 → 2, 3 | `turbo.json` `test:e2e:agent` | Task 1 creates the task; 2 and 3 reuse it via their own `package.json` script | Clean. Task 2/3 do NOT edit turbo.json. |
| 1 → 2, 3 | config shape (`output`/`tests`/`cache`) | Task 1's `e2e.config.ts` is the template | Clean, see ruling R2. |
| 1 → 2 | ports | 3101/3999 vs 3110/4110 | Clean, disjoint. |
| 2 → 3 | ports | 3110/4110 vs 8085 | Clean, disjoint. |
| all | `.gitignore` | Task 1 adds `apps/*/.e2e/` once | Clean — 2 and 3 do not touch it. |

Self-agreement per task:

| Task | Tests vs code | Verdict |
| --- | --- | --- |
| 1 | Step 2 test vs Step 4 config | **2 defects — R1, R3 below** |
| 2 | Step 1 test vs Step 3 config | Config internally consistent; test locator (`/correo|email/i`) not verified against rendered label — flagged to implementer, see R4. |
| 3 | Step 1 test vs Step 3 config | Heading regex `/ofertas|rescata/i` is a guess; plan already instructs the implementer to use the real accessible name. Acceptable. |
| 4 | No code, verification only | Clean. |

## Rulings

Ruling: Task 1 Step 2 asserts `role="alert"` is visible after submit, but the stub returns **201** and the route's success path calls `setDone(true)` (business-signup.tsx:171) — `role="alert"` renders **only when `error` is truthy** (line 284-292), which never happens on 201. The test as written would time out forever. Decided: assert the success heading `¡Recibimos tu solicitud!` (line 193) via `getByRole("heading")`, which is the real post-201 surface. — Cost if wrong: the test fails at the final assertion and one fix round is spent re-pointing the locator; the config and wiring are unaffected.

Ruling: Task 1 Step 2 clicks a button matching `/crear cuenta/i`; the real submit button text is **"Registrar negocio"** (business-signup.tsx:307, toggling to "Registrando..." while loading). Decided: use `{ name: "Registrar negocio" }`. — Cost if wrong: same as R1, one locator fix.

Ruling: Task 1 Step 4 ships **two targets sharing one `app.url`** (3101) because `app.command` is one process per target and readiness is polled at `app.url`; a stub on 3999 and a dev server on 3101 cannot both be owned by one target. I have NOT verified empirically that `app.open()` resolves against the intended target when two targets share a URL. Decided: ship the two-target form as written and let Step 5's run settle it; if the test hits the wrong target, the documented fallback (one target whose `command` is a script that boots both) applies. — Cost if wrong: Task 1 costs one fix round. Flagged to the implementer as the known-uncertain point of this task.

Ruling: Task 2's test uses `getByRole("textbox", { name: /correo|email/i })` against the admin login form without verifying the rendered accessible name. Decided: leave the regex broad and instruct the implementer to read the actual label from `apps/admin/src/routes/login.tsx` before finalizing. — Cost if wrong: one locator adjustment inside Task 2.

## Task log

Task 1: dispatched
## Task 1 — review round 1 (commit b52226e)

Spec compliance: ✅. Quality: Approved. Critical: none.
Important: (1) test never asserts the write went to loopback; (2) no `workers`, so Tasks 2/3 share one dev server + stub across parallel workers; (3) `serve.ts` kills only direct children, a stale `vite` survives on 3101 — the implementer hit APP_ALREADY_RUNNING by hand, so this is observed not theoretical.
Minor 4-12 deferred (hydration-gate oracle, port hardcoded x3, turbo cache:true, inert env, 30s gate vs 120s deadline, serve.ts inside tests glob dir, root .e2e unignored, port/reuse-policy collision between suites).

Ruling: finding 1 — accept. The repo names this exact hazard in `apps/landing/e2e/business-signup.spec.ts` header (a suite that proves "the form posts" without proving "it posted HERE" is one refactor from creating a real business owner in production). `apps/landing/.env` points at a live backend, so this is the repo's own top safety rule, not a nicety. Cost if wrong: one extra assertion, zero risk.
Ruling: finding 2 — accept, value fixed to `workers: 1` (not left open). The repo's own playwright.config.ts already runs `workers: CI ? 1 : undefined`, and with three total tests parallelism buys nothing while a shared dev server + shared stub is a flake class. Cost if wrong: suite is marginally slower to grow.
Ruling: finding 3 — accept. Observed failure mode, and it maps to the spec's Review Focus #1: a stale vite on 3101 is exactly "a suite passing against code that is not under test". Cost if wrong: none, process-group cleanup is strictly safer.

Task 1: fix round 1/5 (3 addressed, 0 open — loopback assertion w/ non-vacuity gate + decoy proof; workers:1; process-tree kill; commits b52226e..ead663e)
Task 1: re-review — all 3 ADDRESSED, no new Critical/Important.
Task 1: complete (commits 143c215..ead663e, review clean after 1 fix round)

### Task 1 — deferred minors (for final review triage)
- Port substring check would accept a `39990` port (business-signup.e2e.ts)
- Error message says "no POST" when it also fires on ≥2 requests
- `exit` hook comment overclaims: under win32+SIGKILL the vite grandchild still leaks; no in-process handler can fix that (real residual, needs a Windows run to confirm)
- `killTree` runs twice (harmless)
- Hydration gate satisfied by a failed app-config request; `__reactProps$` is the stronger in-repo oracle
- Port hardcoded in 3 places (serve.ts, e2e.config.ts x2)
- `test:e2e:agent` inherits turbo `cache:true` — a cached pass replays without booting
- `env:["VITE_API_URL"]` inert in turbo.json (runner allowlists env; value comes from serve.ts)
- 30s hydration gate inside a 120s deadline, observed 40-65s — tight
- Hydration signal is route-specific; on `/` a loader could satisfy it via dehydration
- `serve.ts` sits inside the tests-glob dir
- Root `.e2e/` still unignored
- Both suites claim 3101/3999 with opposite reuse policies, undocumented

### Task 1 — carried forward to Tasks 2 and 3
Ruling: the brief's TWO-target config shape is DEAD. The runner boots every target and gates the run on each `readyUrl`, so a stub target probed at the dev server's URL fails the whole run with APP_UNREACHABLE. The working shape is ONE target whose `app.command` is a `serve.ts` that boots stub + dev server together, plus a `readyUrl` on a cheap static path (NOT `/`, whose 2s probe budget aborts Vite's cold SSR and manufactures a `<vite-error-overlay>` that swallows clicks). Tasks 2 and 3 must copy the SINGLE-target + serve.ts + readyUrl shape, NOT the two-target form. Cost if wrong: Task 1's own fix round, already paid.
Ruling: `workers: 1` in every app config — shared dev server and shared stub are single processes.
Ruling: the loopback-destination assertion is mandatory in Tasks 2 and 3 too. `apps/admin/.env` also points at a live API (see apps/admin/playwright.config.ts:67), so the same hazard applies there.

## Task 2 — review round 1 (commit cb10a34)

Spec compliance: ✅. Quality: Approved with reservations. Critical: none.
Important: (1) the exit-0 bug was fixed ONLY on the build path — both long-lived children (stub, UI) still `child.exited -> shutdown() -> process.exit(0)`, so a crashed stub reports "exited with code 0 before becoming ready" and blames a healthy target; reproduced by squatting on 4110, real cause EADDRINUSE. 4110 gets no APP_ALREADY_RUNNING pre-check because the runner only probes readyUrl. (2) no trailing newline in all three new admin files + one >80col line; the implementer's format verification was a false negative because `--stdin-file-path` honours files.includes so biome passed the bytes through. (3) on win32 the SIGTERM/exit handlers may never run, making the taskkill branch unreachable from the runner's stop path (cannot verify on this Linux box; inherited from landing).
Minor 4-7: per-assertion budgets ~205s vs 120s default test timeout; point-in-time poll samples vs invariant prose; proof-of-life coupled to sidebar chrome; ports duplicated in 3 files with no shared source.

Verified by controller: the trailing-newline finding is real and scoped — all three landing files (Task 1) DO end with a newline; only the three admin files do not.

Ruling: finding 1 — accept, and it is load-bearing. A crashed stub exiting 0 is exactly the failure mode that makes a suite point at the wrong component; it also means port collisions on 4110 are silent. Cost if wrong: one extra code path, no behaviour change on the happy path.
Ruling: finding 2 — accept. Mechanical and cheap; the false-negative verification is itself the lesson (biome does not lint these paths, so the fix must be verified by a means that does not rely on `format:check`). Cost if wrong: none.
Ruling: finding 3 — accept as a real residual, but the fix cannot be validated on this Linux box. Scope the fix to what IS verifiable here (make the handlers/ordering correct and documented), and carry the win32-unreachable-handler question to the final review rather than pretending it is closed.

Task 2: fix round 1/5 (3 addressed, 0 open — exit-code propagation for both long-lived children + build (measured 1 / 143 / 0); trailing newlines + 80col with an independent format check; win32 reachability documented, explicitly NOT claimed fixed; commits cb10a34..6747787)
Task 2: re-review — all 3 ADDRESSED, no new Critical/Important.
Task 2: complete (commits ead663e..6747787, review clean after 1 fix round)

### Task 2 — deferred minors (final review triage)
- ~205s of per-assertion budgets vs the runner's default 120s test timeout (auth-gate.e2e.ts) — a slow app loses the authored failure messages
- Point-in-time `poll` samples where the prose describes an invariant
- Proof-of-life assertion coupled to sidebar chrome (`nav-user.tsx:62`, `hidden md:block`, `collapsible="icon"`)
- Ports duplicated across e2e.config.ts / serve.ts / test with no shared source
- 3 comment lines in landing serve.ts exceed 80 cols (cosmetic; biome never reflows comments)
- Repo's `format:check` does not cover `e2e.config.ts` / `e2e-agent/` in ANY app — the format gate silently ignores all agent-suite files
- win32 cleanup: `taskkill /T /F` unreachable from the runner's stop path (TerminateProcess skips in-process handlers); reached via child-crash and build-failure. Needs one real Windows run. Open by construction, not by neglect.

### Cross-task rulings
Ruling: an INCIDENT occurred — the Task 2 implementer's format-checker script contained `rmSync("src")` and deleted `apps/admin/src`. Restored via `git checkout`. Controller verified independently: 371 files present, `git diff --numstat HEAD -- apps/admin/src` = 0 lines, `git status --untracked-files=all` empty (byte-exact vs HEAD), `tsc --noEmit` clean. No data loss. Cost of this ruling: none — but it is the reason every future verification script in this plan gets read before it runs.
Ruling: the environment has a SECOND worktree (`/mnt/c/Users/leonardo/role-bugreports`, branch feat/bug-reports-b) whose Playwright runs contend for the SAME ports 3110/4110. A `EADDRINUSE`/`APP_ALREADY_RUNNING` is therefore ambiguous between "my bug" and "their run". Cost if wrong: a future task chases a phantom. Distinguishing test is `/proc/<pid>/cwd`.

## Task 3 — review round 1 (commit 9a77ec6)

Spec compliance: ✅ (all 8 requirements). Quality: PASS with findings.
Critical: (1) `startupTimeout: 300_000` under-sized — reviewer MEASURED cold expo export at 282s / 270s / 320s(ENOMEM) vs the 300s budget; the implementer's own 205-211s measurement was optimistic. ~18s headroom at best, and an overrun surfaces as APP_UNREACHABLE = "the server never started", the exact misleading failure the serve.ts trio exists to prevent.
Important: (2) no pre-flight port check before a 4.5-min export — `reuseExisting:false` only guards readyUrl; (3) assertion ordering — (b) filters static-origin entries so it snapshots too early, and (c) running after (b) would report a misleading "never queried Supabase" for a real leak; (4) the Playwright red has TWO causes and the report named one — `playwright.config.ts:76-91` omits the Firebase dummies, so `preexport:web` exits 1 BEFORE the 180s budget is even spent (reviewer reproduced); (5) `e2e.config.ts` misstates the sibling config re `workers`.
Minors 6-10: "zero role=heading" generalised wrongly (text.tsx:57-61 and card.tsx:54 DO emit it, just uncalled); line-width misclassification; dead `shutdown(code ?? 1)`; comment claims env repeated for static server but `{}` passed; hermeticity is the runner's doing and unrecorded.

Reviewer disproved as false positives: invented locator (it is a real one-node role="button"); strings-as-contract inconsistency (landing/admin e2e-agent hardcode every string too); fragile `strings.home.ultimasHoras` (catalog-anchored, measured unique 1 vs 2); onboarding state persistence (fresh context per attempt, 3/3 runs landed on /onboarding). Both brief premises independently confirmed false.

Ruling: finding 1 — accept, Critical. The measurement disagreement is the finding: 205s was measured once, 282s is the reviewer's floor. Size the budget off the worst measured value, not the typical one. Cost if wrong: one constant.
Ruling: findings 2, 3 — accept. Both are about the suite lying about what it proved: a 4.5-min export that dies on a busy port, and assertions ordered so a real leak reports the wrong message. Cost if wrong: two reorderings.
Ruling: finding 4 — accept AND ESCALATE as a repo finding, not just a task finding. A committed config (`apps/mobile/playwright.config.ts:76-91`) that omits env the pre-export step requires means `bun run test:e2e` fails on mobile for a reason unrelated to hardware. This is a latent defect in the Playwright suite, which this plan does not touch — it goes to the final review and to the human partner.
Ruling: finding 5 — accept. A comment that misstates a sibling config is a trap for the next reader. Cost if wrong: one comment.

Task 3: fix round 1/5 (5 addressed + 5 minors, 0 open — startupTimeout 300s->600s sized off worst measured 320s; pre-flight assertPortFree (exit 2, 0s, kills nothing); three polls -> one verdict-returning poll (ok/pending/leak/leaked-elsewhere); Firebase defect documented not fixed; workers comment corrected; commits 9a77ec6..5f7e5db)
Task 3: re-review — all 5 ADDRESSED, 0 open, no new Critical/Important.

### Task 3 — deferred minors (final review triage)
- Exit-path table `serve.ts:219-223` still says "three routes", omits the new exit code 2
- Pre-flight comment claims trio parity but the check exists only in mobile (`serve.ts:406-411`)
- ENOMEM path cited as `src/export/assets/saveAssets.js`, shipped path is `build/src/export/saveAssets.js`
- `pending` exhaustion prints a leak headline that did not happen (boot.e2e.ts:293; the payload saves it)
- The `leak` verdict has no dedicated mutation proof (needs a bundle with two backend destinations); `leaked-elsewhere` IS proven
- Per-assertion budgets vs the runner's 120s default test timeout (same shape as admin)
- Ports duplicated across config/serve/test with no shared source
- win32 `taskkill` unreachable from the runner's stop path (same honest scope statement; open by construction)
- Repo's `format:check` covers none of the agent-suite files in any app

### Repo defect found (NOT this plan's to fix — escalate to human)
Ruling: `apps/mobile/playwright.config.ts:76-91` omits all four `EXPO_PUBLIC_FIREBASE_*` keys. `apps/mobile`'s pre-export script (`generate-firebase-config.mjs:41-47`) exits 1 when any is missing, so `bun run test:e2e` fails on mobile in SECONDS — before the 180s `webServer` budget is even spent. This is a latent defect in the committed Playwright config, unrelated to hardware and unrelated to this plan. The e2e-agent suite supplies the keys in its own config and is unaffected. NOT fixed here because the plan's global constraint forbids touching `playwright.config.ts`. Needs its own PR.

## Task 4 — no-regression verification (no code, no commit)

REGRESSIONS: 0. Verified against baseline `74275d9` (NOT merge-base — `main` is 1416 files behind; `cc8556e` makes pre-existing files look added).
- test:e2e:agent per-app: landing 1/1 PASS (150.7s), admin 1/1 PASS (207.4s), mobile 1/1 PASS (272.9s)
- Playwright: api 44/0 PASS, admin 71 PASS, landing 36/4 fail (30s-timeout flakes at e2e/fixtures.ts:122, files untouched), mobile FAIL (pre-existing)
- typecheck 6/6 PASS. Units: commons/admin/landing PASS, mobile 538/0, supabase 42/0, api 2199 pass/11 fail (all public-read-grants.spec.ts, spec byte-identical)
- .gitignore covers all three apps/*/.e2e; git status clean
- Playwright paths untouched: diff over apps/*/e2e/*, all playwright.config.ts = EMPTY

Ruling: CORRECTION to my own earlier escalation. I recorded the missing `EXPO_PUBLIC_FIREBASE_*` keys in `apps/mobile/playwright.config.ts:76-91` as a latent repo defect needing its own PR. That was WRONG about CI: `.github/workflows/ci.yml:120-123` supplies all four keys, so the mobile pre-export step does NOT fail in CI. The only mobile Playwright failure is the 180s `webServer` budget versus a 249-320s cold `expo export` on this box. The missing keys are a LOCAL-run friction only. Cost if I had not corrected it: a spurious PR request against a file that is fine in CI.

Ruling: C1 (root `test:e2e:agent` aggregate script missing) — ACCEPT as a real spec gap in MY plan, not an implementer error: Task 1's brief listed turbo.json + the app package.json but never the root script, so `bun run test:e2e:agent` does not exist. Fix.
Ruling: Item 6 (landing's serve.ts + business-signup.e2e.ts deviate from biome format) — ACCEPT. Real, and CI's format gate cannot catch it because biome's files.includes skips these paths. Fix.
Ruling: C2/C3 (the agent suite and the Playwright suite both hard-claim 3101/3999 per app, so they can never run concurrently; landing's serve.ts has no port env override) — PARK as a documented limitation, do NOT refactor. Making the agent suite's ports env-overridable buys nothing while Playwright's ports are fixed in its own config; both would have to change for concurrency to work, and that is a larger change than this plan's scope. Cost if wrong: a future contributor tries to run both and hits a port clash — the config comments must say so.

### Task 4 — environmental noise worth recording
Sibling worktrees (`landing-dbg`, `role-bugreports`) repeatedly seized 3101/3999, producing APP_ALREADY_RUNNING/EADDRINUSE and one run where all 17 tests failed on connection-refused. No foreign process was killed. Host swap at 3.8/4.0 GiB SIGKILLed admin's stub-api once. `turbo run` cancels sibling tasks on first failure, so per-app runs are required to see the full picture.

## Task 4 — fix round 1 (commit 7f25074)

Root `test:e2e:agent` aggregate added; landing's two e2e-agent files reformatted (verified with a scratch-dir harness that needed two corrections before it could be trusted — `bunx biome` from a scratch dir resolves the unrelated npm package `biome@0.3.3` and silently formats nothing, and the first control was written outside the cwd biome ran in. Without those controls this would have been a FOURTH false negative on format verification).

Ruling: the aggregate was RED as committed — landing hit its 120s test budget when turbo ran the three packages in parallel (swap 3.9/4.0GiB; VITE ready in 46s). Standalone it passes in 86s; `--concurrency=1` gives 4/4. Root cause identified by the controller: each config's `workers: 1` governs parallelism WITHIN a suite, not BETWEEN packages — `turbo run` still boots three dev servers (two vite, one expo export) concurrently. Ruling: serialize the aggregate with `--concurrency=1`. Cost if wrong: the aggregate takes ~10 min serially instead of ~5, but it is green instead of red. A script that is red on a clean checkout is not a deliverable.
Ruling: the 120s default test budget leaves landing only ~1.8x headroom (66s of 120s) under contention. Parked as debt for the final review rather than papered over with a timeout bump, since contention is nondeterministic and a bump would mask it.
Note: `bun run format:check` was already failing on 3 files in `apps/mobile/src` at HEAD, untouched by this branch. A green `format:check` here means "what the gate covers and this branch did not touch is unchanged", NOT "the repo is formatted".

Task 4: fix round 1/5 (2 addressed — root aggregate script; landing formatting; commits 7f25074)
Task 4: fix round 2/5 (1 addressed — aggregate serialized with --concurrency=1; commit e24a989)
Task 4: complete (commits 5f7e5db..e24a989, verification clean: 0 regressions, 3/3 agent suites PASS)

Ruling: the aggregate's turbo cache key does NOT include the root script's `--concurrency=1` flag, so a plain `bun run test:e2e:agent` returned FULL TURBO / "4 cached" — a FALSE GREEN with zero tasks executed. The implementer caught this by noticing timings differed from the replayed ones and execution order changed, then re-ran with `--force` for real execution (deliberately not deleting `.turbo/cache`, which lives in the shared main repo and is used by sibling worktrees). Real result: mobile PASS 194.13s, admin PASS 97.41s, landing PASS 96.31s (test 62.01s against the 120s budget). Cost if unnoticed: the branch's headline command would have looked green forever without ever running.

### Final state of the branch
Agent suite (new): landing 1/1, admin 1/1, mobile 1/1 — all PASS.
Playwright suite (untouched): api 44/0, admin 71, landing 36/4 flaky 30s timeouts in untouched fixtures, mobile FAIL pre-existing (180s webServer budget vs 249-320s cold export).
typecheck 6/6. Units green except 11 pre-existing api failures in public-read-grants.spec.ts.
Commits: 74275d9 (spec) .. e24a989, on feat/e2e-mobile.

## Final whole-branch review + fix wave

Verdict: merge-with-fixes (4 must-fix + 1 cheap adjacent), all config/comment-level.
Fix wave commit bec421a closed all 5. Scoped re-review: all 5 ADDRESSED, no new Critical/Important.

Ruling: the most capable review models (claude-opus-5-5, claude-sonnet-5-5, gpt-6.1-sol) all failed with "Insufficient account funds"; the final review and re-review ran on the session default. Cost: the final gate is weaker than the skill intends. Worth re-running when the account has funds.
Ruling: the fix report's format-violation table was wrong on two of four rows (claimed admin 0→0 and repo-wide 3→3; actual admin 3 and repo-wide 6→6, all pre-existing). The re-reviewer caught it by verifying independently. Conclusion unchanged, evidence corrected. Cost: none to the code; recorded because the number will be quoted later.
Ruling: machine paths remain in the TRACKED `docs/superpowers/plans/2026-10-01-e2e-agent-web.md` (18 `cd` lines). Accepted for now: they are a record of commands actually run, and they leak a username for no benefit but no harm either. `.superpowers/**` is untracked so it is not in question. Follow-up, not a blocker.

### Not done (deliberately, with reasons)
- README discoverability for `test:e2e:agent` (C6) — spec did not require it; would touch files outside the plan's Files list
- ~205s of authored per-assertion budgets inside the runner's 120s default test timeout — the highest-risk number in the branch, unowned and undated. Refused to bump it: a bump masks contention rather than removing it. This is the most likely CI failure.
- win32 `taskkill` residuals in all three serve.ts — unverifiable from Linux, documented honestly
- The two suites hard-claim the same ports per app — documented in all three configs, not refactored
