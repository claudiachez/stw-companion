# Current status

> The transient snapshot — what's in flight, what's pending, what's next. Updated every session
> (by `/wrap-up`). Durable rules live in CLAUDE.md; dated history in docs/session-history.md.

## State
- **Webapp redesign is COMPLETE, pixel-QA'd, and PUSHED — `claude/webapp-redesign` → [PR #152](https://github.com/claudiachez/stw-companion/pull/152) open to `staging`** (host merges). ~76 commits.
  typecheck + lint (0 errors) + 358 tests green locally; CI runs on the PR. Every changed surface was
  rendered + screenshot-verified this session (dev server + the host's authed browser session), light theme
  (dark not re-swept — the tokens are theme-aware but a dark pass is worth doing post-merge).
- **This session** (on top of the earlier redesign + element-level re-QA): built the remaining ref screens
  and applied the host's QA refinements — see the session-history entry for the full list. New screens:
  **Stock Picks · Trades** (flat per-lot blotter), **Stock Picks · Portfolio Overview** (ref card system),
  **GEX Signals** (setup sparklines from real TwelveData closes; live chart removed), **My Portfolio position
  detail** (flat tx table). Plus: tooltip-icon restyle (app-wide), a **Default view** preference, several
  filter/nav refinements, and a **dismissible Risk verdict banner**.
- **Migrations at `079`** — all applied to PROD (`usmqbohcjcyszjxxvnqu`). **No new migrations this session:**
  the Default-view pref rides the existing `profiles.preferences` (jsonb) + `set_my_preferences` RPC.
- **`staging → main` promotion STILL PENDING** (approval-gated). `origin/main..origin/staging` = the
  pre-redesign batch (drawdown overhaul #145–#149 + regime one-source #151); the redesign joins it once
  #152 merges. Scheduled fns run only on `main`.

## Redesign detail (plans/20260720_webapp_redesign/)
All 11 design surfaces + foundation, recreated from the `.dc.html` refs, reuse-not-rebuild (no re-derived
numbers, frozen regime gate untouched, event-sourcing + P&L-split byte-identical, IBKR order flow preserved).
Per-screen flags/deviations → **plans/20260720_webapp_redesign/FLAGS.md**; element-level re-QA handover →
**plans/20260720_webapp_redesign/REQA.md**. Design refs at `plans/20260720_webapp_redesign/refs/` are
gitignored — re-fetch via the Claude Design MCP (project `665f2470-f119-40cb-9e5c-de3d86ad62d8`).

## Pending host actions
1. **Review + merge [PR #152](https://github.com/claudiachez/stw-companion/pull/152)** to `staging`.
2. **`staging → main` promotion** (approval-gated) — required for scheduled fns (incl. the drawdown-alert
   cron) to run on prod. The redesign rides the next promotion after it reaches staging.
3. Confirm the Delete-account support email (interim `cc@claudiachez.com` in ProfilePage).

## Next work (after #152 merges)
1. **Deferred redesign follow-ups:**
   - Rebuild the Stock Picks `HoldingDetail` tx table to the flat DATE·ACTION·DETAILS·PRICE·**Weight**
     form (its mock variant has a Weight column + admin add/edit) — bring it to parity with the Portfolio
     twin's new flat table. **Flagged/known divergence** — the shared `DetailPane` skeleton matches; only
     the tx-table body differs.
   - Wire the `useDefaultView` landing into the **admin** shell (web is wired; admin index still hardcoded).
   - Wire the guardrail `*_enabled` flags into the **drawdown-alert cron** (the Risk tab already honors them).
   - Add `SegmentedControl` to the DesignSystemGallery.
   - Optional: a dark-theme visual sweep of the redesigned screens.
2. **Parked (pre-redesign):** Whop integration (locked direction, not built); multi-trader tailing (needs a
   proposal + host conflict rule before building); transcripts library tab; global activity feed; subscriber
   closed-position P&L history (postponed). Full context in session-history.md.

## Notes
- `ibkr_nlv` refreshes on every sync (`ibkr_nlv_at` stamps it); only `cumulative_cashflow` is import-only.
- The GEX setup sparklines + the old live chart both pull TwelveData intraday; local dev has no market-data
  key, so sparklines/quotes are empty there (graceful) and populate on staging/prod where the keys are set.
- **Sandbox gaps (dev-only, not blocking):** `prev_conviction_level` backfill + `recent_changes` view
  (migration 008) never applied to sandbox — those Overview blocks hide there; both render on PROD.
