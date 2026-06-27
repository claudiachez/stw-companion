# Macro Dashboard Module — Implementation Handoff

## Context

The host wants a dedicated **Macro** nav tab (between Signals and Portfolio) that gives subscribers a live read on the current market regime — without clicking individual tickers. Separately, the existing `PortfolioDashboard` gets a new **Portfolio Heatmap** block.

This document is a full handoff spec. A new session should be able to implement without re-researching.

**Key design principles agreed with host:**
- Environment = market *structure* (indices, rates, credit, breadth) — no dollar
- Sentiment = *risk appetite* signals (vol, IV proxy, GEX, credit, breadth, dollar)
- No indicator duplication across modules
- User-configurable indicator visibility (toggle per indicator, stored in `profiles` or localStorage)
- Default view is minimal (SPY, QQQ, VIX, US10Y) — expert indicators opt-in

---

## Build Order

1. **Macro tab — Environment block + Sentiment Gauge** ← start here
2. **PortfolioDashboard — Portfolio Heatmap block**
3. **Macro tab — Sector Rotation** (separate session, spec at bottom)

---

## Module 1: Macro Tab — Environment Block

### Layout

Full-width page, two stacked sections:
1. Environment banner + indicator table
2. AI weekly recap card (below the table)

### Environment Banner

One line, full-width, above the table (uses `SectionHeader` pattern — title outside the card):
```
● CAUTIOUS / NEUTRAL — weakening from risk-on        Updated: Jun 27 · 9:04 AM ET
```
- Dot color + regime label auto-generated from signal distribution (see Signal Logic below)
- Timestamp right-aligned via `fmtDateTime`

### Indicator Table

**Columns:** Symbol · Name · Close · Chg · Chg% · vs 9d MA · vs 21d MA · vs 200d MA · Signal

**Rows are grouped into three tiers** (header row per group, styled like the host's own view):
- `ABOVE 9 · 21 · 200 = MOMENTUM` — green header
- `BELOW 9+21 · ABOVE 200 = MID-TERM CAUTION` — amber header
- `BELOW ALL THREE = RISK-OFF` — red header

Rows auto-sort into the correct tier each render based on computed MA positions.

**Default indicator set** (visible to all users by default):

| Symbol | Name | Display note |
|---|---|---|
| SPY | S&P 500 | Price vs MAs |
| QQQ | Nasdaq 100 | Price vs MAs |
| VIX | Volatility Index | Level + direction; `^VIX` on Finnhub |
| US10Y | 10-Yr Treasury Yield | Yield %, direction, key level 4.5%; `^TNX` on Finnhub |

**Expert indicators** (hidden by default, user can enable):

| Symbol | Name |
|---|---|
| IWM | Russell 2000 (small caps) |
| RSP | Equal-weight S&P 500 (breadth proxy) |
| TLT | Long-duration bonds |
| HYG | High-yield credit |
| VEA | Intl developed markets |

UUP (dollar) lives in Sentiment only — excluded from environment.

**US10Y special handling:** displayed as yield % (not price). MA columns show yield level of each MA, not price MA. Signal: yield rising + above 4.5% = 🔴 headwind; yield falling or below 4.3% = 🟢 tailwind for growth.

**User preference storage:** `profiles` table — add a `macro_prefs` JSONB column (new migration `044`) storing `{ visibleIndicators: string[] }`. Falls back to localStorage if user not logged in.

### Signal Logic (auto-computed)

Per indicator (price-based):
- **🟢 Bullish:** price > 9d MA AND > 21d MA AND > 200d MA
- **🟡 Caution:** price > 200d MA but below 9d or 21d (mid-term losing momentum)
- **🔴 Bearish:** price below all three MAs
- **⬛ N/A:** insufficient data

Overall environment regime label:
- Count green/yellow/red across the active visible indicators
- Majority green → `RISK-ON`
- Mix green+yellow → `CAUTIOUS / NEUTRAL`  
- Majority red → `RISK-OFF`
- Append a short descriptor phrase (hardcoded map from distribution to phrase, e.g. "weakening from risk-on", "deteriorating", "recovering")

### Data Fetching

**Finnhub** (`VITE_FINNHUB_KEY`) — live quotes for all symbols. Reuse the existing staggered fetch + 15-min localStorage cache from `PicksView.tsx` lines 122–164. Same `usePriceCacheStore` Zustand store.

**TwelveData** (`VITE_TWELVEDATA_KEY`) — daily OHLC for MA computation. Fetch `interval=1day&outputsize=210` (need 200 bars for 200d MA). Reuse fetch pattern from `GexChart.tsx` lines 74–113. Cache in localStorage keyed by `macro-ma-{symbol}-{date}` (refresh once per day).

**Computed MAs:** simple arithmetic mean of last N closes. 9d = last 9 closes, 21d = last 21, 200d = last 200. No external MA endpoint needed.

### AI Recap Card

Sits below the indicator table. Card with title "Market Recap" (via `SectionHeader`).

**Generation:** POST to new Netlify function `macro-recap` with:
```json
{
  "indicators": [ { "symbol": "SPY", "close": 744, "tier": "caution", ... } ],
  "graddoxBias": "bearish",        // from signals table, latest row
  "graddoxBiasNote": "SPX failed at GEX1 two sessions in a row"
}
```

Function calls `claude-haiku-4-5-20251001` with a structured prompt → returns:
```json
{
  "summary": "2–3 sentence environment read",
  "keyLevel": 735,
  "keyLevelNote": "SPY 50d MA — break below shifts to risk-off",
  "bottomLine": "One sentence bottom line"
}
```

**Auth:** requires valid Supabase JWT (same pattern as `ibkr-flex.ts`).

**Cache:** localStorage key `macro-recap-{YYYY}-W{WW}` (ISO week). Regenerates once per week or on explicit "Refresh" button click. Show a small spinner + "AI-generated · Refresh" link bottom-right of the card.

**Required new Netlify env var** on web site: `ANTHROPIC_API_KEY`

---

## Module 2: Macro Tab — Sentiment Gauge

Sits below the Environment block on the same Macro tab page.

### Visual

Large arc gauge (SVG, 0–100), needle pointing to current score. Zone labels on the arc:
```
0────────25────────45────────55────────75────────100
  Extreme    Fear    Neutral   Greed    Extreme
   Fear                                 Greed
```
Color gradient: red → orange → gray → teal → green.

Below the gauge: a vertical list of 7 component rows showing each input's label, mini horizontal bar, and its 0–100 sub-score. So subscribers understand *why* the needle is where it is.

### Seven Inputs (all auto-computed)

| # | Component | Weight | Signal | Source |
|---|---|---|---|---|
| 1 | Market Momentum | 18% | SPY % above/below its 125d MA, normalized ±10% → 0–100 | TwelveData |
| 2 | Volatility Level | 16% | VIX: <12=100, 12–16=75, 16–20=50, 20–25=25, >25=0 | Finnhub `^VIX` |
| 3 | IV Premium (vol ratio) | 16% | VIX ÷ 30d realized HV on SPY. Ratio >1.3=fear(low), ~1.0=neutral, <0.8=greed(high) | VIX from Finnhub; 30d HV computed from TwelveData daily closes |
| 4 | Tail Risk | 12% | VVIX: <85=calm(high), 85–100=elevated(mid), >100=fear(low) | Finnhub `^VVIX` |
| 5 | GEX Bias | 18% | `signals.bias`: bullish=90, flat=50, conflicted=35, bearish=10 | Supabase `signals` table (latest row) |
| 6 | Credit | 10% | HYG: above 50d MA + rising=80, mixed=50, below + falling=20 | Finnhub + TwelveData |
| 7 | Dollar (UUP) | 10% | UUP below 9+21d MA=80 (tailwind), above both=20 (headwind) | Finnhub + TwelveData |

**Final score** = weighted average of 7 sub-scores.

**GEX Bias fetch:** reuse `fetchGraddox()` from `packages/ui/src/features/signals/api.ts`. Already typed. The `bias` field maps directly to a score.

**Note on Finnhub `^VIX` and `^VVIX`:** verify these tickers resolve on the free tier before shipping. Fallback: if `^VIX` fails, derive volatility from UVXY price direction only. If `^VVIX` fails, skip component 4 and redistribute its weight equally.

---

## Module 3: Portfolio Heatmap (PortfolioDashboard)

New block in `packages/ui/src/features/picks/components/PortfolioDashboard.tsx`. Add after the Conviction Changes block.

### Layout

Treemap-style grid. Box per holding:
- **Box size** ∝ `holdings.current_weight`
- **Box color** — two modes via toggle (see below):
  - **Today:** day % change from Finnhub (green = up, red = down, intensity = magnitude; ±3% = full saturation)
  - **Total:** unrealized return since entry — `(currentPrice − entryPrice) / entryPrice` for share legs; `(markPrice − entryPrice) / entryPrice` for option legs
- **Box content:** ticker + value (day % or total %)
- **Click:** `onSelectTicker(ticker)` — same pattern as TickerLink

### Toggles (top-right of block header)

- **Today | Total** — color mode
- **By Basket | All** — grouped with basket label rows, or flat single grid

### Data

- Holdings + weights: existing `useHoldings` hook
- Live prices: existing `useLivePrice` + `usePriceCacheStore`
- Entry prices for "Total" mode: already in `legs` table via existing `useHoldings` data (legs are joined)
- CASH row excluded (same as position count convention)
- Closed positions excluded (show only open holdings)

### Implementation note

Use CSS grid with `grid-template-columns` proportional sizing or a lightweight treemap layout algorithm (no external library — implement a simple slice-and-dice or squarified treemap in a util function in `@stw/shared`). Keep it mobile-friendly: minimum box size so small positions remain tappable on ≤390px.

---

## New Files

```
packages/shared/src/types/macro.ts
  — MacroIndicator, MacroTier, SentimentInput, SentimentScore, MacroRecap types

packages/ui/src/features/macro/
  MacroView.tsx                          — page component, renders both blocks
  useMacroIndicators.ts                  — fetches prices + MAs, computes tiers + signals
  useSentimentGauge.ts                   — computes 7-input score, reads GEX bias via fetchGraddox
  useWeeklyRecap.ts                      — calls macro-recap fn, localStorage cache by ISO week
  useMacroPrefs.ts                       — reads/writes visibleIndicators from profiles or localStorage
  components/
    EnvironmentBanner.tsx
    IndicatorTable.tsx                   — grouped by tier, MA columns, signal dots
    SentimentGauge.tsx                   — SVG arc needle + component breakdown list
    MacroRecapCard.tsx                   — AI narrative + key level callout + refresh btn

packages/ui/src/features/picks/components/PortfolioHeatmap.tsx
  — treemap grid, Today/Total toggle, By Basket/All toggle

apps/web/netlify/functions/macro-recap.ts
  — JWT auth → Claude haiku API call → returns { summary, keyLevel, keyLevelNote, bottomLine }
```

---

## Modified Files

| File | Change |
|---|---|
| `packages/ui/src/components/Layout.tsx` | Add "Macro" nav tab between Signals and Portfolio |
| `apps/web/src/App.tsx` | Add `/macro` route, `AccessGate` Basic tier |
| `apps/admin/src/App.tsx` | Add `/macro` route, no paywall |
| `packages/ui/src/features/picks/components/PortfolioDashboard.tsx` | Add `<PortfolioHeatmap>` block |
| `packages/ui/src/context/AppCapabilities.tsx` | No change needed — `finnhubKey` + `twelveDataKey` already provided |

---

## New Migration

**`044_macro_prefs.sql`** — adds `macro_prefs JSONB` column to `profiles`:
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS macro_prefs JSONB DEFAULT '{}';
```
Stores `{ "visibleIndicators": ["SPY", "QQQ", "VIX", "US10Y"] }`. Default empty = show defaults.

---

## Key Reuse (do not reinvent)

| What | Where |
|---|---|
| Finnhub staggered fetch + 15-min cache | `PicksView.tsx` lines 122–164 |
| `usePriceCacheStore` Zustand store | `packages/ui/src/store/priceCache.ts` |
| TwelveData fetch pattern | `GexChart.tsx` lines 74–113 |
| `fetchGraddox()` → GEX bias | `packages/ui/src/features/signals/api.ts` |
| `fmtDateTime` for timestamps | `@stw/shared` |
| `SectionHeader` pattern | used in `PortfolioDashboard.tsx` — title outside card, optional right timestamp |
| `TickerLink` + `onSelectTicker` | `packages/ui/src/features/picks/components/TickerLink.tsx` |
| JWT auth in Netlify fn | `apps/web/netlify/functions/ibkr-flex.ts` — copy the JWT verify pattern |

---

## Design System

Follow existing conventions exactly:
- Dark theme, `--surface`/`--s2` cards, `--border` borders
- Signal colors: use `--c5` (green) for bullish, `--c3` (amber) for caution, `--c1` (red) for bearish
- White text on any filled green button/badge (`color: '#fff'`)
- Timestamps right-aligned, filters/labels left
- Mobile-first: all layouts work at ≤390px; tables scroll inside `overflow-x: auto`

---

## Verification Checklist

1. `pnpm typecheck` — zero errors
2. `pnpm test` — existing shared tests green
3. `pnpm dev:web` → navigate `/macro`:
   - Indicator table loads live prices, shows correct tier groupings
   - Environment banner color matches the tier distribution
   - Sentiment gauge needle moves based on computed score
   - All 7 component rows visible below the gauge
   - "Refresh" on recap card triggers Netlify fn, returns narrative (requires `netlify dev`)
4. `pnpm dev:admin` → `/macro` tab visible, no paywall, same data
5. PortfolioDashboard heatmap:
   - Boxes sized by weight, colored by day %
   - Today/Total toggle switches color basis
   - By Basket groups correctly, All shows flat grid
   - CASH row not shown; closed positions not shown
   - Click on box opens ticker detail
6. User preferences:
   - Toggle off an indicator → it disappears from table
   - Preference persists across page reload
7. Mobile at 390px:
   - Indicator table scrolls horizontally (not page scroll)
   - Gauge arc renders at reduced size, not clipped
   - Heatmap boxes remain tappable (min 44px touch target)

---

## New Netlify Env Var Required

On the **web** Netlify site (not admin):
- `ANTHROPIC_API_KEY` — server-side only, no `VITE_` prefix

---

## Phase 3: Sector Rotation (next session, not in scope now)

Use traditional 11 SPDR sectors: XLK, XLV, XLF, XLE, XLI, XLY, XLP, XLU, XLRE, XLB, XLC.
Apply the **9+21+200 MA grouping** (same three tiers as Environment table).
Radar charts showing RS vs SPY across 5 timeframes (Week, 1M, 3M, 6M, 1Y).
"Leaders" and "Setting Up" rows populated from STW holdings mapped to each sector basket.
XLSR excluded — it's a meta-ETF deriving from the same XL_ data we already compute.
