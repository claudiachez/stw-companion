# Webapp redesign — implementation plan (2026-07-20)

Source of truth: the 11 `*.dc.html` design references (Claude Design project
`665f2470-f119-40cb-9e5c-de3d86ad62d8`, mirrored under `refs/`, gitignored). Handoff README +
PROMPT are in the same project. Rules: recreate in our React/Vite + `@stw/ui`/`@stw/shared`
conventions; **do not ship the HTML or support.js**; match pixel-perfectly (hex, spacing,
font-size/weight, radii, pills, tabular-nums, both themes); implement documented interactions.

## Key finding — the foundation is already ~90% in place
The `.dc.html` files were authored **from the existing token set**. Every design CSS var maps
onto `packages/ui/src/styles/tokens.css`, byte-identical in BOTH themes:

| design var | value (light / dark) | codebase token |
|--|--|--|
| `--bg --surface --s2 --border --bsub --text --t2 --t3 --acc` | identical | same names |
| `--pos-bg --pos-b --pos-t` | `#dcfce7 #86efac #16a34a` / `#052e16 #166534 #22c55e` | `--c5bg --c5b --c5` |
| `--warn --warn-bg --warn-b` | `#d97706 #fef3c7 #fcd34d` / `#f59e0b #2d1a00 #78350f` | `--c3 --c3bg --c3b` |
| `--neg --neg-bg --neg-b` | `#dc2626 #fee2e2 #fca5a5` / `#ef4444 #2d0c0c #7f1d1d` | `--c1 --c1bg --c1b` |
| `--blue --blue-bg --blue-b` | `#0284c7 #e0f2fe #7dd3fc` / `#38bdf8 #082f49 #075985` | **DIFFERS** — `--c4` is `#2563eb…` |

- **App shell** (`components/Layout.tsx`): already matches — 46px bar, same logo SVG, wordmark
  14px/700/0.06em uppercase, separator, nav tabs w/ `--s2` active bg + 600. One nit: design's
  active-link text is `--text`; ours is `--acc`. (Cosmetic; align when convenient.)
- **Primitives** all exist: StatusPill, Badge, KpiCard, DataTable, DetailPane, ListDetailSplit,
  Modal, SectionHeader, AlertStrip, FormRow, TextInput, SubNav, HelpToggle (the ⓘ explainer),
  EmptyState, Button, Icon, TickerLink, AccordionList.
- **Data hooks** mostly exist (esp. Macro: useSectorRotation, useSentimentGauge, useGexExposure,
  useMacroTrendHistory, useMacroEvents, useMacroIndicators, useDailyRecap, useVolatilityStress,
  useCreditLiquidity, useRatesDollar, …). Portfolio: useUserPositions, useLiveNlv, usePerStockLadders.

**Consequence:** this is a re-layout project, not a design-system build. Per screen: fetch its
`.dc.html`, diff against the existing feature component, and reshape the composition to match —
reusing tokens + primitives, adding fixtures only where no hook/endpoint exists.

## Open decision — the info/blue token
Design `--blue` = sky (`#0284c7` / `#38bdf8`). Codebase `--c4` (indigo `#2563eb` / `#3b82f6`)
is BOTH conviction-tier-4 AND `--status-info-*`. Choices:
- (a) Retint `--c4` family to sky — one-source, but recolors tier-4 conviction badges.
- (b) Decouple: point `--status-info-*` (and any info/blue use) at new sky values; leave tier-4.
- (c) Keep indigo (not pixel-perfect on info surfaces).
**Recommendation:** (b) — surgical, keeps conviction-tier semantics. Confirm when the first
blue-using screen is built (Macro uses no blue, so this isn't blocking Macro).

## Execution order (per PROMPT.md / handoff)
0. **Foundation** — reconcile blue token (deferred to first blue screen); align active-nav color. ✅ mostly done
1. **Macro** — `features/macro/MacroView.tsx` → 7 sections (regime verdict, "what's driving it"
   sleeves, AI recap w/ expand, coming-up events, trend structure, 3-card row {internals / GEX
   bar / fear-greed gauge}, sector rotation). ⓘ explainers one-open-at-a-time.
2. **My Portfolio** — Overview (privacy `showMoney` toggle), Risk (4 guardrail cards), Tailing
   (diverging bars). `features/portfolio/PortfolioPage.tsx`.
3. **GEX Signals** — `features/signals/*`. Verdict banner, price maps, setups, day log.
4. **Stock Picks** — Listing (unified row + filter chips), Overview & Trades, Detail panes
   (unified MITK/OSS). `features/picks/*`.
5. **Settings** — `SettingsPage`: IBKR collapsible + 4 guardrail tabs w/ 40×22 switches.
6. **Profile** — `components/ProfilePage.tsx`: identity + tier (Free/Premium), connected, prefs.
7. **Admin modals** — EventForm + PositionEditor (520px). `apps/admin`.

After each screen: open its `refs/*.dc.html` in the browser pane and diff pixel-by-pixel.

## Standing constraints (do not violate)
- Risk/regime surfaces stay advisory/display-only; regime gate frozen at 1.1.0; `ibkr_nlv` is the
  % denominator (live-NLV drawdown read is the one signed-off exception); keep `cashflowAdjustedDrawdownPct`.
- The three de-risking surfaces stay visually distinct (docs/ui-conventions.md).
- Shared styling/logic lives once in `packages/*`; timestamps via `fmtDateTime`; every value carries
  a named source + as-of stamp + prior-period comparison; new row field ships with its filter+sort.
- Branch off `staging`; `/stw-review` + green CI before each PR; never commit to staging/main.

## Also this session (host: "2 and 1")
- **RegimeLight ↔ Macro-trend one-source fix** (contained, pre-existing): SPY reads Momentum on the
  Risk tab vs Healthy Pullback on Macro because `useTickerRegime` and `useMacroTrendHistory` fetch
  different-vintage closes. Unify behind one cached index-close source. (Independent of the redesign;
  can land as its own PR.)
