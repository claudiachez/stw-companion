# Locked decisions & event-sourcing model

> Durable product/architecture decisions, moved out of CLAUDE.md (which keeps a one-line index). Rationale, dates, and completion records preserved verbatim.

**Event-sourcing migration plan is CLOSED (on `main` since 2026-06-23) — do not reopen.** The weight model,
locked decisions, and Phase-5 routine semantics below remain authoritative reference.

**Why:** the old editor was split-brain — it wrote BOTH `legs` (directly) and `leg_transactions`, which
fought on save, diverged, and stamped synthetic dates. Now committed to **true event-sourcing**:
`leg_transactions` (**the diary**) is the only hand-written source; `legs` (**the scoreboard**) is a pure
trigger-derived projection. The editor + ledger write ONLY events.

**Weight model (host-confirmed, corrected 2026-06-18):** a diary row's `weight` = that leg's **lot**
(BUY) or **remaining** (SELL, 0 on full close). **BUYs accumulate** → `legs.weight = Σ BUY lots − sells`.
So **Initial position weight = Σ open legs' lots** (computed from the diary = `positionWeight().current`;
tracks current lots, falls after a trim) and **Current position weight = `holdings.current_weight`** —
the live weight **the routines restate weekly** (NOT Σ legs). Both display read-only in the editor; the
hand-typed `initial_weight` field is gone and the editor no longer writes `initial_weight`/`current_weight`
(routines own current; legs own initial). The earlier "Current = Σ open legs; Initial = typed" wording was
wrong — host confirmed the swap. The 90:10 (equity:options) / 20:80
(short:long) split is only the **default** for computing lots when the host gives a total with no per-leg
detail — held in `app_config`, with a per-position override on `holdings.equity_pct`.

**Phase 1 DONE ✅ + verified on SANDBOX** (`040_sandbox_verify.sql`):
- **Migration `040_legs_event_sourcing.sql`** — `leg_transactions += action_label`; `holdings +=
  equity_pct`; new `app_config` table (split defaults 0.90 / 0.20); **trigger 030 rewritten** to fire on
  INSERT/UPDATE/DELETE, replay the diary, accumulate BUY lots, and **book realized on trims** (slice-weighted).
  Requires **037 + 039** first. (`host_quote` was added then removed — Notes is the single field.)
- `@stw/shared`: `deriveLegWeights` rewritten (90:10 / 20:80, expiry-aware, pins preserved) + new
  `positionWeight()` (Σ open legs). 45 tests green.

**Phase 2 DONE ✅ + verified on SANDBOX (browser):**
- **`PositionEditor`** = position fields + `equity_pct`; **Current weight computed** (read-only), **Initial
  weight editable**; open legs shown read-only (leg CRUD lives in the ledger — one edit surface).
  "Last Action Date" label; each open leg shows its open date.
- **`LegTimeline` = editable Transaction History ledger** (writes only `leg_transactions`): `+ Add event`
  (incl. new legs: Instrument {Shares/Call/Put} + Direction {Long/Short}), per-row ✎/✕ edit/delete,
  columns **Date · Action · Details · Price · Weight · Notes** (Details holds "Shares"/`$30C Sep '26`;
  one **Notes** column), newest-first, table on desktop / cards on mobile, **open/closed/all toggle**,
  **closed-leg rows dimmed** + "Closed"/"Expired" muted gray.
- **Resizable split** in `PicksView` — drag the divider between the list and the detail (15–80%) on
  desktop. **On mobile, the opened detail takes over the full screen** instead — the sub-tabs and filter
  bar hide entirely (`mobileDetail` in `PicksView.tsx`), and `onClose` returns to the list. This is the
  canonical list+detail pattern for any list+detail surface, not just Ticker Details: desktop shows both
  panes side-by-side; mobile never crams both into a narrow viewport — one pane takes over at a time.

**Phase 3 DONE ✅ + verified on SANDBOX (CXDO/IRDM):** detail-card P&L split per asset class, never
blended — **Open** shows Shares/Options return + lot; **Closed** shows per-asset return + portfolio
contribution. `closedPnlPct` + `closedPnlContribution` + `hasClosedPnl` in `@stw/shared`.

**Post-import holdings fix (Next Step #2) DONE ✅ on SANDBOX:**
- **`last_action`/`action_date` derived from each ticker's latest diary event** (`plans/20260618_post_import_holdings_fix.sql`).
  Same-day conversion ties (ADEA/CXDO/FIVN/GDYN/SHLS) resolve to the keep-open `New`; `Expired` →
  `Closed` at the holding level (last_action has no "Expired"). (At import time AMZN/HOOD/TSLA had no
  legs and were skipped — but that was a transient state, NOT a rule; **the host has since added real
  legs to the legacy names on PROD (2026-06-23)**. See the legacy-positions decision below.)
- **Baskets/categories** assigned from the 6/18 sector groupings; 3 new categories created
  (**AI Fraud / Verified Identity**, **Space & Satellite**, **Nuclear**); **IRDM moved Defense → Space & Satellite**.
- **Initial weight for fully-closed positions** now shows the closed legs' entry lots instead of blank —
  new shared helper **`displayInitialWeight`** wired into BOTH `HoldingDetail` (detail card) and
  `PositionEditor`. ARKK reads `1% → 0%`. 54 tests + typecheck green.
- **`revert_legacy_category.sql` applied** — removed the mistaken "Legacy Positions" category;
  AMZN/HOOD/TSLA are Uncategorized (Legacy is their **conviction tier**, not a sector).

**DB state — BOTH environments now on the event model (2026-06-19):**
- **PROD (`usmqbohcjcyszjxxvnqu`):** 038 + 039 + 040 + the import + `post_import_holdings_fix.sql`
  applied. **Verified: 42 legs / 60 diary rows**, last_action/action_date/baskets correct, reconciles to
  6/18. **STILL TODO on PROD: run `revert_legacy_category.sql`** — PROD has a *pre-existing* "Legacy
  Positions" category (old system) that AMZN/HOOD/TSLA still use; the env-agnostic revert clears it.
  Conviction on PROD is left to the routines (some cores not yet tier 5).
- **SANDBOX (`uolabcgbnrkhzpwuvzlk`):** same scripts + the revert all applied. Admin dev `.env.local` →
  sandbox, so **localhost reads/writes the sandbox directly**. 25 tickers / 42 legs.
- **PROD import gotchas (baked into `plans/20260619_prod_import/*` + the SQL files):** (1) PROD's STW
  `trader_id` = `64a779f9-13ba-4cb4-824b-d70dcab3a49b` (sandbox = `9ec36b89-…`); seeds now resolve the
  trader **by name**. (2) The Supabase SQL editor threw "Failed to fetch" on the one big import — it was
  split into 9 small files in **`plans/20260619_prod_import/`** (run `1_wipe` → `8_legs` → `9_weights` in order).
  (3) The wipe deletes **all** legs (PROD carried 28 stale ones from the old 029/030 system) with the
  `trg_leg_transactions_sync` trigger disabled during the delete.

**Decisions locked (see spec):** event-sourced; ledger-only leg editing (inline modal editing **deferred**);
one Notes column; trims book realized; >2 option legs split even; ledger newest-first; **a "convert to
shares" close is a real cash sale → book the option's actual exit price as realized P&L, never $0** (host
2026-06-18); **ledger Action verb = bold green for OPEN-leg events, plain gray for CLOSED-leg events**;
**P&L is split by asset class (Shares vs Options), never blended** — Open shows per-asset return + lot;
Closed shows per-asset return + **portfolio contribution** (return × sold weight), so a +600% option on a
thin slice reads as its true ~+3.6% portfolio impact (host 2026-06-18). P&L Breakdown is open-legs-only.
**"Legacy" is a conviction tier (Tier 6 / `c0`), NOT a sector/category** (host 2026-06-19). **Legacy /
low-conviction does NOT mean "no legs/data"** — every position the host actually holds carries leg +
transaction data regardless of tier, **especially while still open**; the host added real legs to the
legacy names (AMZN/HOOD/TSLA) on PROD (host 2026-06-23). So a tier-0 holding with open legs is normal —
never treat low conviction as a reason to leave a held position without legs. **Conviction is
owned by the routines** — set in the streaming run, never in a seed/migration (so the post-import fix does
NOT touch conviction; the 6/18 stars OSS/VPG/SYNA/VIAV/NBIS/ENS/AMKR/LEU/AMZN/TSLA are the routines' job).

**Decisions locked — admin IBKR trading (host 2026-07-03):** real order placement is **admin-only,
local-proxy-only, single-account** — extending it to arbitrary subscribers is explicitly out of scope
without a separate legal/compliance review and a different integration entirely (IBKR's Client Portal
Web API, or Alpaca's OAuth trading API per `plans/20260524_mobile-transition.md`); don't build toward it
incrementally. **Legs stay weight-only (%) forever** — real share/contract quantities are never derived
from weight and are always entered directly at order time (there is no plan to add share/contract
counts to the `legs`/`leg_transactions` schema). A confirmed broker fill is the only thing allowed to
patch a diary row's price after the fact — the requested/limit price never is, same rule as every other
close in this ledger.

**Decisions locked — risk limits engine (host 2026-07-08):** `risk_config.account_equity` defaults
to a **$100,000 placeholder** for every new row (migration 059's `DEFAULT`, not left `null`) —
same "seed a placeholder, flag it via `is_placeholder`, let the user override" pattern already used
for the threshold defaults (migration 055), not a special case. `equity_peak` is a
**trigger-maintained high-water mark** (`fn_risk_config_track_equity_peak`) that only ever
increases — this is a genuinely derived value (same "scoreboard is a pure trigger-derived
projection" pattern as `legs`/`leg_transactions`), **not** the "fail loud, never silently coalesce"
pattern migration 054 uses for the closed-weight invariant; don't conflate the two triggers'
philosophies. The drawdown ladder is validated but **never blocking** — inline warnings
(monotonicity; position ≤ sector ≤ gross) render but Save stays enabled, matching this engine's
standing "flags only, nothing here places or blocks a trade" framing everywhere else. **Any UI
that shows a `risk_config`-derived percentage (gross exposure, position/sector concentration) must
use `config.account_equity` as the denominator, never re-derive it from the same positions being
evaluated** — that was the exact tautology bug found and fixed (gross exposure read
~100% unconditionally because the numerator and denominator were the same sum).

**Decisions locked — risk limits engine v2 (host 2026-07-08, this session):**
- **Four severity tiers, not two.** `ViolationSeverity` = `ok | near | breach | unevaluated`
  (`packages/shared/src/utils/limits.ts`, `classifySeverity`): **near** fires at ≥80% of a limit
  (incl. AT the limit — a 100%/100% bar reads amber, never green, since breaches are already too
  late); **unevaluated** is missing data (an unmapped sector) and must **never be counted as a
  breach** (a permanent red flag trains the operator to ignore the engine). `StatusPill` already has
  matching `near`/`unevaluated` variants — reach for them, don't invent new colors.
- **Separate, tighter options cap.** `risk_config.max_option_position_pct` (migration 060, default
  **5%** vs the 10% general position default) caps any single underlying's OPTIONS exposure —
  options carry more risk per dollar. Pure scorer `optionPositionConcentration` rolls up only option
  legs (`PositionInput.isOption`). It's **display-only** on the Risk tab (there's no `option` value
  in `risk_violation_acks.violation_type`, so no acknowledge/glide-path workflow for it).
- **The Risk surface is its own destination, not a collapsible block.** On My Portfolio it's the
  "Risk" sub-nav tab and renders expanded directly (no ▶ toggle). Each concept (gross / position /
  option / sector) carries a one-line what-and-why explanation. Exceptions-first is the resting view
  (breach + near + unevaluated shown; "Show all" reveals the OK rows).

**Decisions locked — cash-flow-adjusted drawdown + ladder↔regime reconciliation (host 2026-07-12):**
- **Drawdown is measured net of external cash flows, off live NLV — never the `account_equity`
  placeholder.** `equity_peak` is the RAW `ibkr_nlv` at the flow-adjusted high-water mark, paired with
  `equity_peak_cashflow` (cumulative cash flow as of that high); only flow SINCE the peak counts:
  `peakAdjustedToNow = equity_peak + (cumulative_cashflow − equity_peak_cashflow)`,
  `drawdownPct = (ibkr_nlv − peakAdjustedToNow)/peakAdjustedToNow`. One source of truth:
  `cashflowAdjustedDrawdownPct` in `@stw/shared`. The DB trigger `fn_risk_config_track_equity_peak`
  (migration 071) owns the peak — **`persistFlexResult` must NOT set `equity_peak`**. A deposit RAISES
  the bar; a withdrawal lowers it; a historical flow that predates the first NLV observation never reads
  as a loss. First-order (additive) adjustment, not time-weighted return — sufficient for an advisory flag.
- **`cumulative_cashflow` is written by the IMPORT only** (`ibkr-import.ts`, `cashflow: true`), from the
  full-history `<ChangeInNAV>` `depositsWithdrawals`. The daily "Last 7 Days" sync must **never** write it
  — a rolling-window period aggregate can't be accumulated without double-counting. Consequence (accepted):
  a new deposit/withdrawal isn't flow-adjusted until the user re-imports; a manual-only user (no IBKR) gets
  no drawdown (the ladder needs a live equity feed — a static number can't produce one). **Render nothing
  (ladder silent) until real NLV + peak exist — never a phantom number.**
- **The drawdown ladder and the double-RED regime rule are INDEPENDENT triggers, reconciled by "tightest
  binds," never auto-linked.** Ladder = your account drawdown (idiosyncratic); regime = the market gate
  (systematic). Both cap gross exposure; when both fire the LOWER target binds. One source of truth:
  `bindingGrossTarget(ladderPct, regimePct)` in `@stw/shared` → `useBindingGrossTarget(config, instrument)`,
  computed **once per parent** (`PortfolioPage`/`LimitsPanel`) and passed to BOTH the gross-exposure card
  and the Regime light so they never show conflicting numbers. The gross card shows the full reconciliation;
  the Regime light adds a line ONLY when the ladder binds strictly tighter than the regime target (its own
  advice already states the number otherwise). A non-blocking Settings **coherence warning** fires when the
  double-RED target is set looser than the deepest ladder rung (a config that would never bind).
  `regimeExitAdvice`'s double-RED trim fallback is proportional to the gross target (`~doubleRedGrossPct%
  of size`), not the looser single-RED `trimToPct`. All advisory/display-only — nothing enforces.

**Decisions locked — drawdown-protection overhaul (host 2026-07-19, `plans/20260719_drawdown-protection-overhaul.md`):**
The ladder was correct (account at −8.85% under a −10% Rung 1) but useless in practice — silent until
a rung fired, run off the last sync not live prices, no alerts, no per-name protection. Four fixes,
all advisory/display-only (nothing blocks or places a trade):
- **Item 1 — the drawdown is ALWAYS shown** on the Risk tab (the "Portfolio drawdown" card), with an
  amber **NEAR** the moment it's within a band of the next rung — the de-risk warning now arrives before
  the rung, not after. One source: `drawdownLadderStatus(ladder, drawdownPct)` in `@stw/shared`
  (`ok|near|breach`, deepest breached = active, next rung surfaced). Still silent while drawdown is null.
- **The NEAR band is a per-user setting** (`drawdown_near_band_pp`, default **2**), not a fixed constant —
  the user decides how early amber fires. `DRAWDOWN_NEAR_BAND_PP` in `@stw/shared` is only the seed default.
- **Item 2 — the drawdown READ is driven off LIVE prices** (host: "Option A"). `liveNlv = ibkr_nlv +
  Σ(livePrice − syncedMark)·qty·mult` over stock legs with a Finnhub quote (option legs + unquoted names
  keep their synced mark; falls back to `ibkr_nlv` when no quotes). Live NLV drives the current-drawdown
  read for BOTH the card and the ladder→gross binding target (computed once in `PortfolioPage`, threaded
  to `ViolationsSummary` + `useBindingGrossTarget` — never two live-NLV computations). **The `equity_peak`
  stays a settled high-water off the SYNCED `ibkr_nlv`** (the migration-071 trigger is unchanged) — live
  drives "now," not the peak, so an intraday spike can't ratchet the bar (the phantom-drawdown risk 071
  was built to avoid). **One-source exception (host-signed-off):** a live-derived NLV for the *drawdown
  read* is a deliberate exception to "account equity = `risk_config.ibkr_nlv`" for responsiveness; the
  concentration-limit denominator stays `ibkr_nlv` (never re-derived from live). Source stamped
  `Finnhub · <quote time>` when live, `IBKR · <sync>` on fallback (the `HoldingDetail` price idiom).
- **Item 4 — a FULL per-stock drawdown ladder** (host, 2026-07-19 — a ladder, not a single stop), keyed
  to each position's drawdown from entry (`mark_price` vs `avg_cost` on `user_positions`). Distinct axis
  from the account ladder — it flags/targets a single NAME, it does NOT set a gross target, so it
  **structurally cannot contradict** the market-regime rule or the portfolio ladder (those two reconcile
  via `bindingGrossTarget`; the per-stock ladder is independent). *Open:* what each per-stock rung drives
  (an advisory trim-to-weight target is the working assumption — to confirm before building Item 4).
- **UI must clearly distinguish the three de-risking concepts:** market-regime de-risking (RegimeLight) /
  portfolio drawdown ladder (the "Portfolio drawdown" + Gross exposure cards) / individual-stock drawdown
  (My Portfolio position row/detail). Same reconciliation rule as before — the first two bind by "tightest."

**Direction — access + Discord linking flow through WHOP, not our own auth (host 2026-07-19):**
STW already sells subscriptions on **Whop**, which also manages Discord access (Whop's bot adds a
paid member to the STW server + assigns roles; removes them on lapse — the "Claim Discord Access"
flow). Target model: **a user's app access mirrors their Whop membership.** Buy on Whop → membership
active → grant our app access; lapse → revoke. Verify via `/me/has_access/:id` + `membership.activated`
/`membership.deactivated` webhooks (signature-verified), and/or Login-with-Whop OAuth. Not built yet —
this is the DIRECTION so nothing we build now contradicts it.
- **Do NOT build a separate Discord OAuth "connect" / linking flow** — Whop already links each member's
  Discord account and puts them in the server. `profiles.discord_user_id` should be **populated from
  Whop** (webhook/API), not our own OAuth. (This is why the standalone Discord identify flow was dropped.)
- **What we've built is Whop-compatible, no rework:** the `status = 'active'` gate + `subscription_tier`
  become **Whop-driven** (webhook-synced) instead of manually set; `profiles.discord_user_id` gets its
  value from Whop; the drawdown-alert cron already gates on `status = 'active'`, which aligns.
- **The alert bot + token is a SEPARATE layer from access.** Whop manages *membership + server access*;
  our own bot (token in `integration_secrets`) *sends the custom drawdown DMs* to members already in the
  Whop-managed server. Different concerns — the token store stays. The manual Discord-ID paste (admin +
  Settings) is an INTERIM for the test bot until Whop feeds the ID.

**Decisions locked — REGIME_EXIT is a per-user rule, not a signed document (host 2026-07-08):**
- The advisory de-risking policy (integrity-guardrails Item 4) is a **per-user setting**, not the
  single operator-owned `docs/regime_exit_v0.md` the original spec described. Values live on
  `risk_config` (migration 063): `regime_trim_to_pct` (default **70**), `regime_stop_pct` (**5**),
  `regime_doublered_gross_pct` (**30**) — same seed-a-placeholder-default pattern as the other
  `risk_config` fields. Edited in **Settings** (`RiskConfigForm`, Premium-gated to edit); **displayed to
  all portfolio users** (defaults until overridden). The operator-only governance the spec named
  ("version bump required, no change mid-drawdown") is **dropped** for the per-user model.
- **Advisory / display-only — never enforced** (the standing regime prohibition). One source of truth:
  `regimeExitAdvice(gate, rule)` in `@stw/shared` — single-RED → trim/stop text, double-RED →
  reduce-gross text, GREEN/UNKNOWN → nothing. Used by the RegimeLight, the My-Portfolio Overview regime
  line, and the position detail pane; don't re-derive the text per surface.
- **The RegimeLight is presentational** — the mount site gates visibility (My Portfolio → Risk for
  subscribers, admin Limits tab for the operator), NOT a hard `isAdmin` return inside the component.
  It belongs with the *live* risk data (the Risk tab), never in Settings (same split as the limits
  engine: Settings = config, the data page = live evaluation).

**Event-sourcing plan docs (`plans/`, now date-prefixed):** `20260618_legs_event_sourcing_redesign.md`
(spec) · `20260618_import_open_positions.sql` (clean open-position import) ·
`20260618_post_import_holdings_fix.sql` (post-import seed) · `20260618_revert_legacy_category.sql`
(drops the bad Legacy category) · `20260618_040_sandbox_verify.sql` (trigger test) ·
`20260618_legs_inspect.sql` (inspect legs/diary) · `20260618_zzadea_populate.sql` (seed test fixture).

**Tooling:** `pnpm` not on PATH — use `corepack pnpm …` or `~/.local/bin/pnpm`. No local Postgres (can't
run DDL locally — apply migrations via the Supabase SQL editor). Prod service key (read-only checks) at
`~/Documents/Claude/Scheduled/.supabase-service-key`. Sandbox anon key in `apps/admin/.env.local`.

**Phase 5 DONE ✅ (2026-06-19) — routines on the 040 event model** (out-of-repo
`~/Documents/Claude/Scheduled/*`; SKILL.md edits, not committed). All four updated:
- **morning + afternoon:** STEP 2.3 / STEP 3 rewritten — diary `leg_transactions` (`action_label` +
  `notes`=host's verbatim words) + **direct `holdings` PATCH** of `last_action`/`action_date`/
  `current_weight`; **`holding_transactions` path retired** (the still-live 033 trigger auto-logs a
  harmless audit row). **Lot semantics:** BUY weight = lot **added**, SELL = **remaining** (cost basis).
  **Split (90:10 / 20:80 from `app_config` + `holdings.equity_pct`) is initial-sizing fallback only —
  existing legs are NEVER re-split.** Upsize = keep existing legs, add the increment to the **named**
  leg (FIVN worked example baked in). Contract→shares = close option at real exit (never $0) + new
  shares leg **inherits the replaced leg's weight** (net-neutral); same-day close+open keeps the
  position open (`last_action` = the opening verb). Trim uses **cost-basis remaining**; an appreciated
  winner stated only in market % → **flag**, don't guess. `action_date` = the host's action date,
  written only by a real action.
- **friday-weighting:** direct `current_weight` PATCH (no `Hold` rows); **truth-up mismatch (snapshot ≠
  Σ lots, e.g. IRDM +600%) → flag, never rewrite lots**; legs reconcile adds missing only; **new STEP
  4d status-aging** — `action_date` older than the **previous** snapshot → `last_action='Hold'`
  (`action_date` preserved); Closed/Expired terminal.
- **transcripts:** conviction note — routine-owned, **mutable both ways on an explicit signal incl.
  promoting a Legacy (0)**; never inferred from sizing.
- **One-time SQL applied (PROD + sandbox):** `plans/20260619_conviction_618_stars.sql` (8 stars → tier 5;
  AMZN/TSLA stay 0) + `plans/20260619_fix_fivn_shares_weight.sql` (FIVN shares lot 3.5→2.5, net-neutral 6.0%).
- **PENDING (host) — NOT a repo task, doesn't affect the apps:** the stale **`gradoxx-daily-summary`**
  Cowork scheduled task (duplicates morning PART 1's Graddox) is an **orphaned backend object** — it
  still fires ~9am but has no working delete UI (absent from Cowork→Scheduled; its task page 404s; the
  delete API is desktop-client-gated). Task UUID `8377c152-0ffa-474d-9ec0-2281a92edb26`, org Claudia Chez
  `aea1699f-e0b8-4ed4-80b9-4abb5d0a7711`; the underlying skill is `skill_01UY6zPNf9Do8eR4voyUvtm6`. Being
  cleared via Anthropic support / desktop skill-delete. Also smoke-test the routines on their next live runs.


**Decisions locked — webapp redesign (host 2026-07-21, `plans/20260720_webapp_redesign/`):**
The full app was redesigned from a Claude Design project (11 `.dc.html` high-fidelity refs; project
`665f2470-f119-40cb-9e5c-de3d86ad62d8`). The `.dc.html` files are design references, NOT production code —
recreate in-codebase (React + `@stw/ui`/`@stw/shared` tokens + primitives), never ship the HTML/support.js.
Match pixel-perfectly (exact hex/spacing/font-size/radii/pills, tabular-nums, BOTH themes — dark stays the
codebase default; the mocks are light-default but per-theme values are byte-identical so a given theme renders
the same). Per-screen deviations are logged in `plans/20260720_webapp_redesign/FLAGS.md`. The design was
authored FROM the existing token set, so the light `[data-theme="light"]` palette already matched — this was a
per-screen re-layout, not a token rebuild. Standing consequences:
- **Type scale expanded to the design's exact px ladder** (`packages/shared/src/constants/tokens.ts`
  `FONT_SIZE`): added 9(`3xs`)/13(`sms`)/15(`md`)/20(`xl`)/22(`2xl`)/30(`hero`); **`lg` changed 18→16**
  (the redesign tops headings at 16; 18 is unused by it). Token values ARE the design px, so lint's
  no-literal-fontSize rule still holds and every specified size has a token. Not-yet-touched screens get a
  minor sub-heading shrink (transient). Rule: font sizes are pixel-exact via `FONT_SIZE` tokens — never a literal.
- **`showMoney` is a global privacy preference** (`usePrivacyStore` + `profiles.preferences.showMoney`,
  synced via `usePreferencesSync`). ONE toggle (Profile "Show dollar amounts" + the My-Portfolio header eye)
  hides $ everywhere. Default ON.
- **Per-guardrail on/off + a per-option ladder** (migration 078): `risk_config` gained
  `caps_enabled`/`ladder_enabled`/`per_stock_enabled`/`regime_enabled` (default true) + `per_stock_option_ladder`
  (jsonb — the per-OPTION drawdown stop ladder, sibling to `per_stock_ladder`). Chosen as discrete columns
  (host, matching the existing per-field style) over one jsonb blob. A disabled guardrail must show a muted
  "off" state and contribute nothing (no flag/breach). The Risk tab HONORS these; **the drawdown-alert cron
  does NOT yet honor them — a flagged follow-up.** `usePerStockLadders(…, assetClass)` picks the option
  ladder for OPT positions, the stock ladder for shares.
- **Profile self-edits go through SECURITY DEFINER RPCs** (no broad UPDATE policy on `profiles` — same
  pattern as `set_my_preferences`): `set_my_display_name` (077; name stored as `display_name = "First Last"`,
  no first/last columns) and `set_my_avatar_url` (079; avatar in a public `avatars` storage bucket, own-folder
  RLS keyed by `<uid>/…`). The masked IBKR account number comes from `user_executions.account` (`maskAccount`).
- **`RegimeLight` presentation is replaced by the Risk-tab "market health" card on the subscriber side**;
  `RegimeLight.tsx` itself is untouched and still used on the admin Limits tab.
- **Regime trend classification is LIVE (host 2026-07-23 — supersedes #151's close-only rule):**
  `trendStructure(closes, livePrice?)` in `@stw/shared` is the single read. The 9/21/200 MAs are the fixed,
  intraday-static reference lines (a moving average only gets a new point at the close); the price classified
  against them is the **LIVE quote** when supplied. Every bucket surface — Macro trend table, sector rows,
  Risk-tab RegimeLight, per-ticker badges — AND the regime gate's price leg (`useLatestRegimeLive`) pass the
  SAME live price (shared `stw-price-cache`), so they never disagree — which is the consistency #151 was
  actually after (its close-only fix was one of two valid resolutions; the host chose the live-consistent one,
  because the dashboard is an actionable tool and a breach must show the moment it happens, not at the next
  close). The gate's `sma200` + VIX stay the daily `regime_daily` row (VIX has no free intraday feed). The
  Macro composite therefore moves intraday on the trend + GEX sleeves; volatility/credit/rates settle at the
  close (FRED). The gate's own LOGIC/thresholds remain frozen at engine 1.1.0 — only its price INPUT changed
  from the daily close to the live quote.
