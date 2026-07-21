# Current status

> The transient snapshot — what's in flight, what's pending, what's next. Updated every session
> (by `/wrap-up`). Durable rules live in CLAUDE.md; dated history in docs/session-history.md.

## State
- **The full webapp redesign is DONE but LIVES ONLY ON THE LOCAL BRANCH `claude/webapp-redesign`
  — NOT pushed, NO PR, NOT on `staging`/`main`.** 21 commits (see session-history). Host is holding
  the push for a **QA session next** (log in + eyeball every screen, light + dark), then `/stw-review`
  → push → single PR to `staging` (host merges). **Do NOT push or open the PR without explicit go-ahead.**
- **Migrations at `079`.** 077 (`set_my_display_name` RPC), 078 (`risk_config` guardrail toggles +
  `per_stock_option_ladder`), 079 (`profiles.avatar_url` + `avatars` storage bucket/RLS +
  `set_my_avatar_url`) — **all applied to PROD (`usmqbohcjcyszjxxvnqu`) via MCP this session.** NOT applied
  to sandbox (sandbox has no `profiles`; risk_config columns not needed there for QA).
- **The `staging → main` promotion is STILL PENDING** (approval-gated) — `origin/main..origin/staging` is
  the pre-redesign batch (drawdown overhaul #145–#149 + earlier). Scheduled fns only run on `main`.
- The **regime one-source fix shipped separately as PR #151 (MERGED to `staging`)** — `trendStructure`
  in `@stw/shared`; the redesign branch is based on staging-with-#151.
- CI (typecheck/lint/test/fn-parity) green on #151. The redesign branch is verified locally
  (typecheck both apps + lint 0 errors + 358 tests + boot clean on every commit) but **CI hasn't run it**
  (unpushed) and **no screen was visually verified** (auth-gated — that's the QA session's job).

## Webapp redesign — DONE on `claude/webapp-redesign` (plans/20260720_webapp_redesign/)
All 11 design surfaces + foundation, recreated from the `.dc.html` refs. Full deviation/flag list +
per-screen notes: **plans/20260720_webapp_redesign/FLAGS.md** (READ before QA). Highlights:
- Foundation: `FONT_SIZE` expanded to the design's exact px ladder (`lg` 18→16, added 9/13/15/20/22/30);
  new `SegmentedControl` primitive; `DetailPane` eyebrow/stat-grid/`DetailPaneSection`; `showMoney` global
  privacy pref (`usePrivacyStore` + `profiles.preferences.showMoney`) drives $ across My Portfolio + Profile.
- Profile (editable name + avatar upload + masked IBKR account; theme moved off the hamburger menu),
  Settings (4-tab guardrails w/ toggles + draggable monotonic ladders + stocks/options + re-skinned IBKR
  connection editor), My Portfolio (Overview / Risk / Tailing), Stock Picks (unified Listing + Detail panes
  + Overview & Trades), Macro, GEX Signals, Admin edit modals (Log-a-transaction + Edit-position).
- Reuse-not-rebuild throughout: no re-derived numbers, frozen regime gate untouched, locked event-sourcing
  + P&L-split byte-identical, IBKR order flow preserved. Guardrail on/off flags + option ladder are HONORED
  on the Risk tab; **the drawdown-alert cron does NOT yet honor the `*_enabled` flags (follow-up).**

## Pending host actions
1. **QA the redesign** on the local branch (see "How to run" below), then greenlight `/stw-review` + push
   + one PR to `staging`. Fix QA findings first.
2. **Confirm the Delete-account support email** (interim `cc@claudiachez.com` in ProfilePage).
3. **`staging → main` promotion** (approval-gated) — still required for scheduled fns (incl. the drawdown
   alert cron) to run on prod. The redesign will ride the NEXT promotion after it reaches staging.

## Next work
1. **QA session** on `claude/webapp-redesign` — walk every screen logged-in, light + dark, ≤390px; check
   against `plans/20260720_webapp_redesign/refs/*.dc.html` + FLAGS.md; fix discrepancies; then push + PR.
2. **Deferred from the redesign:** wire the guardrail `*_enabled` flags into the drawdown-alert cron
   (Risk tab already honors them); add `SegmentedControl` to the DesignSystemGallery.
3. **Parked (pre-redesign):** RegimeLight ↔ Macro-trend was resolved (#151); Whop integration (locked
   direction, not built) remains the big next feature.

## How to run locally (for QA)
`git checkout claude/webapp-redesign` → `corepack pnpm --filter web dev` (→ localhost:5173) and
`corepack pnpm --filter admin dev` (→ :5174). Sign in; toggle theme in Profile → Preferences. Admin
edit modals: a Stock Pick detail → Edit position / the ledger's + Add event. `pnpm` not on PATH → use
`~/.local/bin/pnpm` or `corepack pnpm`.

## Notes
- `ibkr_nlv` refreshes on every sync (`ibkr_nlv_at` stamps it); only `cumulative_cashflow` is import-only.
- Design refs live at `plans/20260720_webapp_redesign/refs/` (gitignored — local only; re-fetch any via the
  Claude Design MCP, project `665f2470-f119-40cb-9e5c-de3d86ad62d8`).
