# Redesign — flags for the host (accumulated per page; surface in the final PR)

## Profile page (committed)
**Resolved:**
- **IBKR masked account number** ("U842•••93") — RESOLVED. It IS available: `user_executions.account`
  (per-fill). Now shown (masked via `maskAccount`) on both the Profile connected-accounts card and the
  Settings connection header. Null until the first fill syncs.
- **Avatar upload/edit** (host request) — real image upload. Migration `079_profile_avatar.sql`
  (APPLIED to PROD via MCP): `profiles.avatar_url` + a public `avatars` storage bucket with own-folder
  RLS + a `set_my_avatar_url` RPC. Profile shows the image (initials fallback); Edit adds upload / change /
  remove (≤3 MB, image/* only). Path `<uid>/<ts>.<ext>` in the avatars bucket.

**Host-requested additions (2nd round):**
- **Pending pill is amber** (host request) — added a generic `warning` variant to StatusPill (distinct
  from `near` = "≥80% of a limit"); `pending → warning`.
- **Name edit** — "Edit" on the identity card opens First + Last name inputs, stored as
  `display_name = "First Last"` (no first/last columns; split on first space to prefill). **Needs
  migration `077_set_my_display_name.sql`** (SECURITY DEFINER RPC — users have no direct UPDATE on
  profiles; same pattern as `set_my_preferences`). **HOST MUST APPLY 077.** Want true separate
  first/last columns instead? That's a further schema change.

**Deviations from the mock (deliberate, per our conventions):**
- **Theme control is 2-way (Light/Dark), not 3-way** — you chose to skip "System" (our theme store
  is binary; System would be a new device-follow behavior). The mock's System segment is dropped.
- **Exact px snap to the type scale**: the mock's 13/16/22px map to our `FONT_SIZE` tokens
  (14/18/26) — lint forbids literal font-sizes, so the app's type scale is canonical. Sub-pixel
  differences from the mock on the name (16→18) and avatar initial (22→26).
- **Pending/rejected notices use the `AlertStrip` primitive** (left-accent bar) rather than the
  mock's full bordered box — primitive reuse over a bespoke box.
- **Buttons use the `Button` secondary/destructive primitives** (secondary has a faint `--s2` fill
  vs the mock's transparent bg) — primitive reuse; tiny fill delta.

**New wiring added:**
- `Show dollar amounts` → new `showMoney` global preference (`usePrivacyStore` +
  `profiles.preferences.showMoney`, synced). No consuming surface yet — honored as Overview/other
  privacy surfaces are redesigned.
- `Change password` → Supabase password-reset email. `Sign out` → real signOut → /login.
  `Delete account…` → mailto to **`cc@claudiachez.com`** (interim — no dedicated support inbox /
  self-delete endpoint exists). **Confirm the support address.**
- `Manage` (IBKR) → routes to `/settings` (web only; the card is hidden in admin, which has no
  Settings route).
- Theme toggle **removed from the hamburger menu** (Profile owns it now), per your instruction.

**Verification:** compiles/boots clean, no console/build errors. Live authed page not
screenshotted (auth-gated; can't sign in) — needs a logged-in eyeball on the dev server/staging.

## Settings page (committed)
Guardrails form (`RiskConfigForm`) rebuilt to the 4-tab redesign (Position size caps / Account
safety net / Per-position stops / Red-market playbook), each with an on/off toggle, draggable
monotonic ladder columns, and a stocks/options scope switch. Dollar equivalents honor `showMoney`.

**New data (migration `078_guardrail_toggles_and_option_ladder.sql` — APPLIED to PROD via MCP):**
- `caps_enabled` / `ladder_enabled` / `per_stock_enabled` / `regime_enabled` (bool, default true).
- `per_stock_option_ladder` (jsonb) — the per-OPTION stop ladder, sibling to `per_stock_ladder`.

**Deferred (host-approved boundary):** the toggles + options ladder are STORED + EDITABLE now, but
the **Risk-tab evaluators + drawdown-alert cron do NOT yet honor them** — a disabled guardrail still
evaluates, and the per-option ladder isn't yet used for option positions. Wire this when the **Risk
tab** is redesigned (skip disabled guardrails; use the option ladder for option positions).

**Connection editor (re-skinned, host request):** `SettingsPage` IBKR panel now matches the mock —
CONNECTED/Not-connected pill + masked account in the header, Flex-token/query rows with ⓘ tips +
Reveal/Hide, Test connection (→ our verify/sync), Save, Disconnect… (new: clears the token/query),
styled Trade-history + collapsible "First time?" guide.
- **Import stays a Flex-XML file upload**, not the mock's implied one-click server fetch — the Flex API
  can't override the saved query period, so a one-click 365-day pull isn't possible. The "Import past
  year of trades" button opens the file picker (download YTD XML in IBKR → upload). Behavior unchanged.

## Risk tab (committed)
`ViolationsSummary` rebuilt to the redesign (verdict banner + market health check + the four
account-vs-plan cards + glossary), a pure re-layout over the existing engine (`evaluateRiskConfig`,
`cashflowAdjustedDrawdownPct`/`drawdownLadderStatus`, `useBindingGrossTarget`, `regimeExitAdvice`, the
`risk_violation_acks` ack/glide-path workflow) — no re-derived NLV/drawdown/target.

**Guardrail-honoring wired here** (the deferred Settings work): a `*_enabled=false` guardrail shows a
muted "off" card and contributes no banner items; per-stock stops route OPTION positions to
`per_stock_option_ladder` and shares to `per_stock_ladder` (via a new `assetClass` arg on
`usePerStockLadders`; the shared status util was already ladder-agnostic — no util/test change).

**Notes / follow-ups:**
- **Drawdown-alert cron does NOT yet honor the `*_enabled` flags** — still out of scope; wire it when
  the alert layer is next touched (it currently evaluates all guardrails regardless of the toggles).
- RegimeLight's presentation is **replaced by the new market card on the subscriber Risk tab**;
  RegimeLight.tsx is untouched and still used on the admin Limits tab.
- Per-stock rows render `TickerLink`-styled but **non-navigating on the Risk tab** (no detail pane there).
- Multiple option legs on one underlying **roll up together** in the per-option ladder (mirrors the
  stock-lot rollup) — a minor advisory simplification.
- Not visually verified (auth + IBKR data required) — needs a logged-in pass (toggle a guardrail off in
  Settings → confirm it drops from the Risk banner + shows the muted card).

## Overview + Tailing tabs (committed)
Both rebuilt in `PortfolioPage.tsx`, reusing existing data/sub-components.
- **Overview:** account-value hero (live NLV + P&L), a new `AttentionStrip` (worst-severity, one-line
  rows reading the SAME risk warnings the Risk verdict uses — not recomputed, links to Risk/Tailing),
  at-a-glance stats grid, `MoversCard` (top-3 gainers/losers), `ConcentrationCard` (stacked sector bar +
  legend + the reused `PortfolioHeatmap` treemap + over-cap callout), tailing footer link.
- **Tailing:** summary + count chips, alerts (declining conviction / big oversize), the diverging
  sizing-vs-STW bars (reused `SizingBar`/`sizingTone`), own-calls chips, glossary.
- **Privacy unified:** the local `showPnl` toggle is gone — the global `showMoney` pref
  (`usePrivacyStore`) now drives Overview/Positions/Tailing, and the header eye toggle wires to it. So
  the Profile "Show dollar amounts" switch controls the portfolio dollars too.
- **One-source:** the concentration card + attention-strip cap count use `classifySeverity` + the
  **live NLV** denominator — same source as the Risk verdict.

**Deviations/notes:**
- `--blue` ("you hold less") maps to our existing **info token** (`--status-info-*` via `sizingTone`) —
  no sky-blue token added (host directive).
- Hero big numbers use `FONT_SIZE.display` (26px) vs the mock's 30px — lint bans raw font-sizes, no 30
  token; the app's type scale is canonical.
- The old Overview declining-conviction banner is dropped from Overview and now surfaced in Tailing §2
  alerts (per the redesign).
- Not visually verified (auth + IBKR data) — needs a logged-in pass.

## Detail panes (committed)
`PortfolioPositionDetail` (your position) + `HoldingDetail` (STW pick) rebuilt to the unified design
over a shared `DetailPane` skeleton (added: eyebrow strip, 22px header title, N-col stat grid,
exported `DetailPaneSection` card). Position pane: stat block (incl. new severity "Vs your cap") +
Tailing / Against-your-risk-plan (size-cap + per-stock ladder + market lights, kept visually
distinct) / Open-P&L-by-holding / Transaction history (All/Open/Closed). Pick pane: stat block
(incl. new "Your side") + conviction bar / Why STW holds it / Key points / Commentary / Transaction
history. All existing wiring preserved: `PositionEditor` (canEdit Edit), `LegTimeline` (admin add/
✎/✕ + IBKR order flow, canEdit-gated), `ConvictionTimeline` (personal note), tx filters.
- **19px stat → `FONT_SIZE.xl` (20)** — no 19 token; 1px overshoot, xl's role is "stat numbers".
- **Personal note stays unified with Commentary** (notes ARE `conviction_comments` — one source; no
  separate "Your personal note" store as the mock's separate section implied).
- Header title weight 700 (mock 800, no token); section radius 8 (mock 10, no token); pick ticker
  keeps its conviction-tier color (existing signal) vs the mock's plain text.

**Deviations from the mock:**
- **Omitted the mock's "STW playbook / Reset to preset" banner** — there's no client-side PRESET in
  our data model; defaults live server-side (`DEFAULT_RISK_CONFIG`). Add a reset-to-defaults if wanted.
- Mock's `--pos-*/--warn/--neg` map to our real `--status-positive/warning/negative-*` tokens; the
  knob shadow uses `SHADOW.card` (the mock's literal rgba is lint-banned).
