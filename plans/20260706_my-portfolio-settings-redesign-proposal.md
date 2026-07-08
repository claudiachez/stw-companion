# My Portfolio / Settings Redesign — Proposal

**Status: PROPOSAL — awaiting host sign-off. No implementation code written against this yet.**

Branch: `claude/portfolio-limits-redesign`, cut from the still-open
[PR #67](https://github.com/claudiachez/stw-companion/pull/67) (`claude/week1-integrity-guardrails`),
since the Limits/Settings code this proposal reworks lives there, unmerged.

Source of the ask: after reviewing the Week-1 Limits panel, the host asked for these three changes
before any more code ships — see CLAUDE.md "Next Steps #1". This doc addresses all three.

---

## 1. Settings — 2-column layout + one Sync button

**Current state** (`apps/web/src/features/settings/SettingsPage.tsx`): single column, max-width 560px.
IBKR Connection card, then (stacked below) the Limits engine card — which itself contains
`RiskConfigForm` and its own "Sync & Evaluate" button, duplicating the Connection card's own
"Sync Portfolio" button. Both call the same `useSyncPortfolio()`.

**Proposal:**
- Widen the page container (max-width ~1040px on desktop) and lay out **IBKR Connection** (left) and
  **Limits engine thresholds** (right) as two columns, `flexWrap` so they stack to one column under
  the existing mobile breakpoint (`useIsMobile()`) — consistent with the "multi-column layouts stack
  on mobile" rule already in CLAUDE.md.
- Settings keeps **only account setup**: IBKR Connection card (unchanged) + a new, narrower
  **"Your thresholds"** card containing just `RiskConfigForm` (position %, sector %, gross %, ladder).
  This card drops the sync button, the staleness stamp, and the violation lists entirely — see #2 below
  for where those go.
- **One Sync button, on the IBKR Connection card** (already there today as "Sync Portfolio") — it's the
  natural home since IBKR Connection is literally the thing being synced. Remove `LimitsPanel`'s own
  "Sync & Evaluate" button. The Limits threshold form on Settings becomes purely configuration; it reads
  the last-synced snapshot for display context (e.g. "last synced: …") but doesn't trigger sync itself.
- Net result: Settings page = **2 cards side by side, each with a clear single job** (connect vs.
  configure thresholds), one Sync action total.

**Decided (host, 2026-07-06): pure form, no live violations preview.** Settings = setup only, full
stop. `RiskConfigForm` on Settings shows no sync stamp, no violation feedback — just the four threshold
fields and one Save. All feedback about *how you're actually doing against those thresholds* lives on
My Portfolio (#2).

---

## 2. Move violation displays to My Portfolio — concrete layout

**Current state:** `LimitsPanel.tsx` (shared by admin + web) renders, top to bottom: sync bar →
`RiskConfigForm` → Gross Exposure card → Position Concentration card → Sector Concentration card. All
of this lives under Settings today. Split plan (unchanged from before): `RiskConfigForm` stays on
Settings; everything else — call it `ViolationsSummary` — moves to `PortfolioPage.tsx`. Admin's
`LimitsPage.tsx` tab imports both pieces together, no change needed there.

**Where exactly, and what it looks like:**

`PortfolioPage.tsx` today renders, top to bottom inside its scroll body: `PortfolioSummary` (the
Legs/Market Value/Return/Equity:Options/Options-at-risk stat-card row) → the Positions table. I'm
proposing `ViolationsSummary` slots in **between those two**, as its own bordered card, matching the
existing `SectionHeader`-outside-the-card pattern used elsewhere:

```
[ Legs · Market Value · Return · Equity:Options · Options at risk ]   ← existing PortfolioSummary
[ ⚠ Risk limits  (collapsed by default, chevron to expand) ]          ← NEW
    ▸ collapsed:  "Gross 62% of 100% · 1 position breach · 1 sector breach"  (one-line status strip)
    ▾ expanded:
        Gross Exposure —────────────────●───────  62% / 100%           (horizontal bar, not a list)
        Position Concentration:
          NVDA  18.4% / 10%  [Breach]  [Acknowledge] [Glide path: ___]
          (only breaching positions shown; "3 more within limit" collapsed count below)
        Sector Concentration:
          Semiconductors  34% / 25%  [Breach]  [Acknowledge] [Glide path: ___]
          Unmapped  41%   (no badge/severity — see caveat below)
[ 📊 Positions  (existing table) ]                                     ← existing, unchanged
```

- **Gross Exposure** renders as a single horizontal progress bar (current % vs. the 100%-scaled limit,
  color shifts to red past the threshold) rather than the current bare number — one value, so a bar
  reads faster than a `ViolationRow`. If a drawdown-ladder target is active, a second thin marker line
  shows the ladder's reduced target next to the plain limit line.
- **Position Concentration** and **Sector Concentration** reuse the existing `ViolationRow` list
  exactly as built (acknowledge / glide-path note, same styling) — just re-homed. To avoid a wall of
  "OK" rows for a 20-position book, only **breaching** rows show by default, with a "N more within
  limit" disclosure to expand the full list (new, small addition — `evaluateRiskConfig()` already
  returns the full list with `severity`, this is just a client-side filter+toggle).
- **Collapsed-by-default summary strip** (the one-liner above) means a subscriber with a clean book
  sees "Gross 62% of 100% · no breaches" and never needs to expand it — the section earns its space
  only when there's something to look at.
- Gating: unchanged, still Premium via `useTierAccess('limits')`; non-Premium sees a one-line locked
  notice in the same slot instead of the section.

**Caveat worth flagging directly: Sector Concentration will show mostly "Unmapped" today.**
`ticker_sector_map` is empty on both PROD and sandbox right now (Next Steps #2 in CLAUDE.md) — every
subscriber's sector rollup currently buckets under "Unmapped" until that table gets populated with real
ticker→sector rows (it's a small admin-editable table, not blocked by any code). This isn't something
this UI change can paper over; the honest thing is to show "Unmapped 41% (no sector data yet)" rather
than hide the row or fake a breakdown. Worth prioritizing filling in `ticker_sector_map` around the same
time this ships, or the sector card will look broken/empty on day one.

---

## 3. Ticker click on My Portfolio → own-position detail pane (not STW's page)

**Current state:** `onSelectTicker` in `PortfolioPage.tsx:469` does
`navigate('/picks?ticker=${ticker}')` — takes the user away from My Portfolio entirely, to STW's
tracked position for that ticker (admin/STW data, not the subscriber's own book).

**Proposal — follow the established list+detail pattern** (`PicksView.tsx`'s `mobileDetail`): desktop
shows the positions table and a detail pane side-by-side (resizable split, same as Ticker Details);
mobile swaps to a full-screen detail view with a back arrow, hiding the filter bar — exact same
mechanism, new instance.

**Detail pane contents, top to bottom:**
1. **Header:** ticker, instrument breakdown (shares/options legs, mirroring the existing `LegRow`
   sub-rows), current market value + unrealized P&L (respecting the page's `showPnl` eye-toggle).
2. **Tailing status:** if `isTailed` (already computed in `PortfolioPage` via `pickMap`), show which
   trader(s) the user is tailing (today: STW only — `FOLLOWED_TRADERS`), STW's own conviction badge for
   that ticker, and a link to view STW's tracked position (this is where the *old* navigate-to-`/picks`
   behavior goes — no longer the default click, but preserved as an explicit affordance). If not tailed,
   say so plainly ("Not currently tailing any tracked pick for TICKER").
3. **Risk/regime indicators (this session's build):** per-ticker rollup from the Limits engine — is this
   position currently a position-concentration or sector-concentration breach (reuse
   `positionConcentration`/`sectorConcentration` from `@stw/shared`, filtered to this ticker's scope)?
   Plus the advisory regime light if the position's sector/proxy has `regime_daily` data — same
   "Advisory — under forward validation. Not a trade signal." label as `RegimeLight.tsx`, never phrased
   as a signal to act on.
4. **P&L:** **Open** shows unrealized return/P&L per leg (data already flows via `user_positions`, no
   new pipeline). **Closed** shows a **"Coming soon"** placeholder state, not a blocking gate on
   shipping this pane — see the constraint below.

**Constraint — closed P&L has no data pipeline yet (per Next Steps #7):** the subscriber Flex sync is
delete-all-then-insert against *open positions only*; a real closed-history feature needs a second Flex
Query template + an append-only, dedup-on-execution-id `user_closed_trades` table — genuinely separate
work, not a quick add. Proposal: ship the detail pane now with an explicit, honestly-labeled "Closed
position history — coming soon" state in the Closed tab/section, rather than hiding the Closed tab
entirely or blocking this whole feature on building the pipeline first. This matches the existing
"a calculated value that legitimately computes to zero must say so" instinct in CLAUDE.md — degrade
by explaining, not by disappearing.

**What does NOT change:** `TickerLink`s elsewhere in the app (Picks, Trades, etc.) keep navigating to
STW's tracked position as today — this new behavior is scoped to My Portfolio's own ticker rows only,
since those specifically represent the *subscriber's own* holding, not STW's.

---

## 4. Additional value-add ideas for My Portfolio (host asked — not yet scoped/prioritized)

None of these require new data pipelines beyond what already exists (`user_positions`, `pickMap`,
`risk_config`, `regime_daily`) — they're presentation/composition ideas on top of data already flowing
into the page today.

- **Sizing delta vs. the tailed pick.** `PortfolioPage` already knows both the subscriber's own
  `current_weight`-equivalent (their market-value % of book) and STW's tracked `holdings.current_weight`
  for the same ticker (via `pickMap`/`useHoldings`). Surface the gap directly on the tailed badge or in
  the detail pane: "You: 8.2% · STW: 5.0%" — tells a subscriber at a glance whether they're over- or
  under-sized versus the pick they're following, without any new table.
- **Conviction-drift alert row.** If a tailed position's STW conviction has dropped (e.g. tier 5→2) since
  the subscriber opened it, flag it in the same collapsed-by-default style as the risk-limits strip —
  "2 tailed positions have declining STW conviction" — linking into the detail pane. Reuses the existing
  `conviction_comments.prev_conviction_level` data (migration 043) already built for the Overview's
  Conviction Changes block; no new schema.
- **Regime-aware equity:options framing.** The page already shows the book's Equity:Options split (by
  market value) as a stat card. If `regime_daily`/`regimeGate()` has data for the subscriber's proxy
  instrument, a one-line advisory note under that stat card — e.g. "Regime: RED · STW's playbook favors
  reducing options exposure in this regime" — ties two things the subscriber already sees together,
  still framed as advisory only (same disclaimer as `RegimeLight.tsx`), never as an instruction.
- **Un-synced / stale-data banner.** If `last_synced_at` is more than ~24h old, a small banner above the
  table ("Last synced 3 days ago — numbers may be stale, click Sync") rather than silently showing old
  data as if current. Cheap, and consistent with the "show the result and why" instinct already in
  CLAUDE.md.

**Recommendation:** ship #1–#3 (the requested redesign) first; treat this section as a follow-up backlog
to prioritize separately rather than bundling into the same PR — none of these were explicitly asked
for, and bundling risks scope creep on what's already a 3-part change.

## Explicitly out of scope / unaffected

- No enforcement anywhere — Limits stays flags-only, `regimeGate()` stays un-imported by `macro.ts` and
  vice versa. This proposal only moves/reshapes existing display surfaces.
- Admin IBKR live order flow untouched.
- No new migrations expected — this is a UI reorganization of components/data that already exist,
  except optionally a small per-ticker filter of the existing `evaluateRiskConfig()` output (pure
  function, no schema change).

## Sequencing if approved

1. Settings 2-column layout + single Sync button (#1) — smallest, mechanical.
2. Extract `ViolationsSummary` out of `LimitsPanel`, move to My Portfolio (#2) — medium, mostly a move.
3. My Portfolio ticker detail pane (#3) — largest, new UI surface following the `PicksView` pattern.

Each would ship as its own commit (possibly its own PR) on top of `claude/portfolio-limits-redesign`,
targeting PR #67 or `staging` depending on whether #67 has merged by the time this is built — to be
confirmed with the host at implementation time.
