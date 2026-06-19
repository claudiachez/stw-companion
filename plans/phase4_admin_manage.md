# Phase 4 — Admin Config + Manage area (plan / map)

**Status:** PLAN for review (2026-06-19). No code written. Follows Phase 5 (routines on the 040 event
model). Migration 040 already shipped `app_config` (+ admin-write RLS) and `holdings.equity_pct`; this
phase is the **UI to edit them** plus the broader **Manage area** (categories CRUD, traders).

## Goal
1. **Config page** — edit `app_config` (`equity_options_default` 0.90, `options_short_long_default`
   0.20) from the admin app.
2. **Wire the default-split path** to read `app_config` + `holdings.equity_pct` (app side).
3. **Manage area** — categories CRUD; traders (read-only recommended).

## What already exists (so we don't rebuild)
- `app_config` table + admin-write RLS (JWT email = `cc@claudiachez.com`), seeded 0.90 / 0.20 (migration 040).
- `holdings.equity_pct` (per-position override; null → Config default). Edited today only in
  [`PositionEditor.tsx`](packages/ui/src/features/picks/components/PositionEditor.tsx).
- `deriveLegWeights(positionWeight, legs, {equityPct, shortShare})` in
  [`packages/shared/src/utils/legs.ts`](packages/shared/src/utils/legs.ts) — already takes a `SplitConfig`,
  falls back to `DEFAULT_EQUITY_PCT` (0.9) / `DEFAULT_SHORT_SHARE` (0.2). **Has ZERO call sites** in the
  app today (the app reads trigger-derived `legs.weight` directly; the editor is ledger-only).
- Categories: read-only `fetchCategories()` + `useCategories()` (picks feature). api comment already
  says "Full CRUD lives in the admin Manage area (separate work)." No insert/update/delete anywhere
  in-app (the routines create categories via REST `on_conflict=trader_id,name`).
- Traders: `traders/api.ts` resolves IDs by name only (`getTraderId`). Seeded in 022 (STW, Graddox). No CRUD.
- Admin shell: `apps/admin/src/App.tsx` — `ADMIN_NAV` array + `<Routes>`. Admin-only pages live
  app-local (precedent: `apps/admin/src/features/users/UsersPage.tsx` — supabase + TanStack Query +
  shared `LoadingSpinner`/`EmptyState`).

## Layer split (keep the monorepo rule)
- **Reads that the web app may also need → `@stw/ui` shared.** `useAppConfig` lives in `@stw/ui` because
  if `deriveLegWeights` is ever called in a render path, **both** apps need the config.
- **Admin-only editor UI → app-local** (`apps/admin/src/features/manage/`), like `UsersPage`.

---

## Part A — Config (the core; smallest, highest value)

**A1. Shared read (`@stw/ui`)** — new `packages/ui/src/features/config/`:
- `api.ts`: `fetchAppConfig(): Promise<Record<string, number>>` (select key,value from `app_config`);
  `updateAppConfig(key, value)` (upsert; admin-write RLS enforces the editor).
- `useAppConfig()` hook (TanStack Query, ~5 min staleTime, like `useCategories`).
- Export from `@stw/ui` index.

**A2. Admin Config UI** — `apps/admin/src/features/manage/ConfigPage.tsx`:
- Two editable ratios, shown as human pairs so they can't be misread:
  - **Equity : Options** — input the equity share; display `90 : 10`. Stored as `equity_options_default` (0–1).
  - **Short : Long** (2-leg options bucket) — input the short share; display `20 : 80`. Stored as
    `options_short_long_default` (0–1).
- Validation 0–1 (or 0–100 in the input, ÷100 on save); show `updated_at`; Save → `updateAppConfig` +
  invalidate `['app-config']`.
- Copy: **"Defaults apply forward** — past diary lots keep their weights; a position can override Equity:Options
  via its `equity_pct` in the editor."

**A3. Wire the default-split path:**
- Thread config into `deriveLegWeights` wherever it's called: `{ equityPct: holding.equity_pct ?? cfg.equity_options_default, shortShare: cfg.options_short_long_default }`.
- **Today there are no call sites**, so this is forward-looking: ship `useAppConfig` + a one-line helper
  `splitConfigFor(holding, cfg)` so the wiring is ready the moment a UI weight-preview needs it. The
  routines (out-of-repo) already read `app_config` directly. *(No behavior change in the app today —
  call out in the PR so it's not mistaken for dead code.)*

---

## Part B — Manage: Categories CRUD

**B1. Shared api (`@stw/ui` config/manage feature):** `createCategory(name)`, `renameCategory(id, name)`,
`deleteCategory(id)` — all stamped with STW `trader_id` (resolve by name via `getTraderId`).
- **Name-stable:** the routines upsert categories `on_conflict=(trader_id,name)`, so renaming is fine
  (new name → routine may re-create the old). Document that renaming a live theme can fork it.
- **Delete guard:** block (or reassign-to-Uncategorized) when any `holdings.category_id` references it —
  don't orphan holdings. Show the using-count.

**B2. Admin UI** — `CategoriesPage.tsx`: table of `name` + `# holdings using`, inline add / rename /
delete (guarded). Mirrors `UsersPage` patterns.

**B3. RLS check:** confirm `categories` has the admin-write policy (same JWT-email shape as `holdings`);
add a tiny migration only if missing.

---

## Part C — Manage: Traders (recommend READ-ONLY for now)

Only two seeded traders (STW, Graddox); `trader_id` is FK'd across holdings/legs/run_log/etc. Full CRUD
is high-risk, low-value. **Recommendation:** a read-only list (name + role) in the Manage area; **defer**
create/rename/delete until there's a real need. (If wanted: add `createTrader`/`renameTrader` only, never delete.)

---

## Navigation / structure
One new top-nav **"Manage"** entry → a `ManagePage` with internal sections/tabs:
**Config · Categories · Traders**. Add `{ to: '/manage', label: 'Manage' }` to `ADMIN_NAV` + a `/manage`
route in `App.tsx`. Web app: unchanged (admin-only).

## Migrations
**None expected** — `app_config`, its RLS, `equity_pct`, and `categories` all exist. Only add a migration
if Part B3 finds `categories` lacks admin-write RLS.

## Testing / done-criteria
- `corepack pnpm typecheck` + `pnpm build` (both apps) + `pnpm test` (shared math unchanged) green.
- Manual: edit a ratio → persists + `updated_at` moves; add/rename/delete a category (delete guarded);
  Config + Manage are admin-only (web never shows them).

## Sequencing / effort
1. **Part A (Config)** — ~½ day; highest value, unblocks the split defaults being editable. Do first.
2. **Part B (Categories CRUD)** — ~½ day.
3. **Part C (Traders read-only)** — ~1 hr.
Single PR (`claude/phase4-admin-manage` → `staging`) or split A vs B/C if you want Config landed sooner.

## Open decisions (for sign-off before building)
1. **One "Manage" page with tabs** (recommended) vs separate "Config" + "Manage" nav entries.
2. **Category delete:** block-if-in-use (recommended) vs reassign-to-Uncategorized.
3. **Traders:** read-only now (recommended) vs add minimal create/rename.
