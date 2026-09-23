# react-doctor-fixes

Goal: resolve all 24 React Doctor warnings (85/100 → 100) without suppressing rules or changing behavior.

Mode: ODD (organic). TDD: not configured for this repo/session → functional checks only.
Commands from repository root: `bun run doctor:react`, `bun run typecheck`, `bun run test`, `bun run build`.

Historical observations (must be rechecked before edits; not a verified current baseline):
- A prior mobile typecheck reported 18 errors outside the navigation change.
- A prior mobile test run reported 153 pass / 1 fail (`offer-skeleton.test.tsx`, React Native parse error under Bun).
- Preserve existing work; do not assume the cause of errors from changed filenames alone.

## Constraints
- No new dependencies. No `eslint-disable`/rule suppressions to game the score.
- Keep runtime behavior and visual output unchanged.
- One writer, single-threaded; no git commit/stash; existing user work preserved.

## Tasks
- [x] A11Y-1: accessible names for 18 icon-only controls (`shadcn-icon-button-requires-label`): `app/(auth)/login.tsx:136`, `app/(consumer)/profile/payment-methods.tsx:97`, `app/business/[id]/stats.tsx:236,265`, `src/core/ui/index.tsx:197,241,286,464`, `src/features/business/components/orders/OrderActionButtons.tsx:61`, `src/features/offers/components/OfferFiltersSheet.tsx:111`, `src/features/orders/components/HistoryDateFilter.tsx:72,88`, `src/features/orders/components/checkout/CouponSection.tsx:52`, `src/features/profile/components/MapPickerView.tsx:142,202`, `src/features/profile/components/MapPickerView.web.tsx:98,129,150`.
- [x] PERF-1: `app/(auth)/login.tsx:30` — handler-only state → `loginPending` is now `useRef(false)` guarding async re-entry; regression test added (`login.test.tsx`).
- [x] BUG-1: `src/core/ui/Navbar.tsx:114` — effect deps completed: `[currentIndex, barWidth, itemWidth, pillWidth, routes.length, initialized, left, stretch]`.
- [x] BUG-2/3: `src/features/home/components/PromoSlider.tsx:82,84` — hoisted `slideStyle`/`cardStyle` via `useMemo` (deps `screenWidth` / `CARD_WIDTH, CARD_HEIGHT, colors.shadow`); `renderItem` no longer creates inline objects.
- [x] BUG-4/5: `src/features/offers/components/detail/OfferBottomBar.tsx:33,36` — legacy Platform shadow block removed; single `boxShadow: Platform.select({ ios: 0px 8px 24px alpha(colors.shadow, alpha*0.18), default: 0px 8px 24px colors.shadow })`.
- [x] VERIFY: `bun run doctor:react` → **100/100, no issues, no suppressions** (confirmed twice). `bun run test` pass (mobile 171/0 fresh; api 1252/0; commons/admin/landing cached pass). `bun run build` pass 4/4 (mobile has no build script). `bun run typecheck` FAIL exit 2 with 15 pre-existing diagnostics (alert-dialog ×2, button.tsx hovered ×1, nested `my-expo-app/*` ×9, PromoSlider `autoPlay`→`autoplay` ×1, `Animated.SharedValue` ×2) — all from earlier uncommitted work, none from these fixes.

## Status
Done. Score target reached without rule changes. Known limits: native shadow rendering not visually verified on device (iOS alpha ≈0.014 in light mode, faint by design parity); 15 pre-existing typecheck diagnostics left untouched (out of scope, HEAD diff confirms they come from earlier uncommitted session work).
