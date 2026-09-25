# security-unique-fixes

Goal: close the audit findings that are not assigned to the parallel business/order/mobile work: fail-closed Supabase JWT configuration, real admin session revocation, and public-only availability for categories/slides/tips.

## Constraints

- Preserve all existing user changes; do not reset, stash, or revert.
- No commits in this session unless explicitly requested.
- Do not touch the parallel agent's business/order/mobile/Supabase/deploy surfaces.
- Keep public and admin authorization separate at the controller boundary.
- No new dependencies.

## Allowed edit surfaces

- `apps/api/src/config/env.schema.ts`
- `apps/api/src/config/env.schema.spec.ts`
- `apps/api/src/modules/auth/auth.controller.ts`
- `apps/api/src/modules/auth/auth.controller.spec.ts`
- `apps/api/src/modules/auth/auth.service.ts`
- `apps/api/src/modules/auth/auth.service.spec.ts`
- `apps/admin/src/features/auth/server.ts`
- `apps/admin/src/features/auth/api/auth.api.ts`
- `apps/admin/src/features/auth/queries/auth.queries.ts`
- `apps/admin/src/features/auth/__tests__/auth.api.test.ts`
- `apps/admin/src/features/auth/__tests__/auth.server.test.ts`
- `apps/admin/src/lib/api/resource.ts`
- `apps/admin/src/features/categories/api/categories.api.ts`
- `apps/admin/src/features/slides/api/slides.api.ts`
- `apps/admin/src/features/tips/api/tips.api.ts`
- `apps/api/src/modules/categories/categories.controller.ts`
- `apps/api/src/modules/categories/categories.controller.spec.ts`
- `apps/api/src/modules/categories/categories.service.ts`
- `apps/api/src/modules/categories/categories.service.spec.ts`
- `apps/api/src/modules/slides/slides.controller.ts`
- `apps/api/src/modules/slides/slides.controller.spec.ts`
- `apps/api/src/modules/slides/slides.service.ts`
- `apps/api/src/modules/slides/slides.service.spec.ts`
- `apps/api/src/modules/tips/tips.controller.ts`
- `apps/api/src/modules/tips/tips.controller.spec.ts`
- `apps/api/src/modules/tips/tips.service.ts`
- `apps/api/src/modules/tips/tips.service.spec.ts`

## Tasks

- [x] SEC-UNIQUE-1: Reject placeholder, short, and low-variety `SUPABASE_JWT_SECRET` values in production while keeping development fixtures usable. Evidence: API tests 1268/1268, focused env tests 9/9.
- [x] SEC-UNIQUE-2: Make admin logout reach the API, propagate revocation failures, and document/test current-session semantics rather than claiming global revocation. Evidence: API tests 1268/1268, admin tests 149/149, admin auth tests 2/2 + 3/3.
- [ ] SEC-UNIQUE-3: Force public category/slide/tip reads to active content; add protected admin list routes and keep admin list queries functional. Public slide detail rejects out-of-window rows; public slide list temporal filtering remains explicitly pending because repository edits are outside this task contract. Evidence: slide controller/service 22/22, focused API controller/service 67/67 before contract alignment, admin 149/149.
- [ ] SEC-UNIQUE-4: Add focused regression tests and run API/admin typechecks, tests, and builds. Focused API tests (67/67 before contract alignment), slide tests (22/22), admin tests (149/149), and fresh API/admin typechecks passed. Full API typecheck/build is blocked by unrelated parallel changes in `apps/api/src/common/rate-limit/redis-throttler.storage.ts` and `apps/api/src/modules/payouts/payouts-generation.job.ts`; full API tests have 3 unrelated failures in `apps/api/src/common/filters/http-exception.filter.spec.ts`.

## Blockers outside this task

- `apps/api/src/common/rate-limit/redis-throttler.storage.ts`: TS2724, missing `ThrottlerStorageRecord` export.
- `apps/api/src/modules/payouts/payouts-generation.job.ts`: TS6133, unused `safeErrorFields` import.
- `apps/api/src/common/filters/http-exception.filter.spec.ts`: 3 failures outside the allowed surfaces.

## Verification

- `bun run typecheck --filter=role-api...`
- `bun run typecheck --filter=role-front-admin...`
- Focused API/admin tests for changed modules.
- `bun run test --filter=role-api --force`
- `bun run test --filter=role-front-admin --force`
- `bun run build --filter=role-api --filter=role-front-admin --force`

## Status

In progress. The allowed-surface list now includes the two admin auth regression test files that were implemented for the BFF logout contract. The working tree contains parallel uncommitted changes; only the allowed surfaces above are in scope.
