# Macro Dashboard Module — Implementation Handoff (v2)

## Context

The host wants a dedicated **Macro** nav tab (between Signals and Portfolio) that gives subscribers a
live, *actionable* read on the market regime — without clicking individual tickers.

**v1 is built and live on `staging`** (PR #56): a single 9/21/200 MA indicator table + a 7-input
Sentiment Gauge, with the regime computed by **counting** green/amber/red rows. On review the host
decided that approach conflates four different signal types — trend, volatility/stress, positioning,
and macro headwinds — into one bucket, producing confusing reads. Two concrete defects:

- `useMacroIndicators.ts` puts **VIX** and **US10Y** in the *same* MA table as SPY/QQQ, and
  `computeSignal` (lines 61–73) special-cases yield inside the trend table. VIX is a
  volatility/stress measure (SPX implied vol), not a price-trend asset; US10Y is a yield/rates
  headwind, not equity momentum. Neither belongs in the trend grouping.
- `MacroView.tsx` `computeRegime` (lines 18–45) derives the regime by **counting signal rows** —
  exactly the simple-count approach v2 replaces with **weighted module scores**.

This v2 spec reorganizes the tab into clean analytical modules **and** adds two new capabilities:
**5-day trend tracking** (so users see whether conditions are improving/deteriorating/reversing,
not just a static snapshot) and a **Macro Event Risk** module (CPI/PPI/PCE/FOMC/jobs as a temporary
overlay). The build is a **fresh per-module component rebuild** — new components replace the single
`IndicatorTable` layout; the v1 components are retired.

> **Status:** This document is the build blueprint. v1 stays live until the rebuild lands. A new
> session should be able to implement without re-researching.

---

## Core principle shift

- **v1:** "tells users what the environment is *right now*."
- **v2:** "tells users what the environment is, **whether it's getting better or worse**, and
  **whether a scheduled macro catalyst could change the setup**."

Every major module carries: **current score · 5-day trend · optional 20-day context · commentary
trigger · trading-mode impact.**

Two scores answer two different questions, kept distinct:
- **Market Regime** (Environment Score) → "what regime are we in?"
- **Risk Appetite** (the gauge) → "how much fear/greed is priced right now?"

GEX is a **tactical overlay** (20% of the regime), not pure macro: a bearish GEX downgrades
confidence but does **not** by itself flip the regime Risk-Off when SPY/QQQ are above 200D and
credit is calm.

---

## Responsive design — mobile AND desktop (both first-class)

The repo rule is "design for ≤390px first," but desktop is **not** a stretched-up phone view — both
are primary targets. Specify a layout per breakpoint for every module:

- **Module Score Strip:** full-width single row of cards on desktop; horizontal-scroll / wrap on mobile.
- **Module cards** (Volatility / Credit / Rates+Dollar / GEX / Event Risk): multi-column responsive
  grid on desktop (2–3 across), single-column stack on mobile.
- **Trend table:** full table on desktop; on mobile it scrolls inside the card (`overflow-x: auto`)
  — never page scroll.
- **Banner + Risk Appetite gauge:** banner spans full width both ways; on desktop the gauge sits
  beside its component breakdown (two-column), stacked on mobile; arc scales down without clipping.
- Use the established page shell (`maxWidth: 1100; margin: 0 auto`, already in `MacroView.tsx`) so
  desktop content is centered, not edge-to-edge.
- **Verify each module at ≤390px AND at ≥1100px** before it's considered done.

---

## Module order (top → bottom)

| # | Module | Question it answers |
|---|---|---|
| 1 | **Market Regime Banner** | Risk-On / Constructive / Cautious / Defensive / Risk-Off — one line + direction |
| 2 | **Module Score Strip** | What's driving the regime? (per-module score · label · 5D delta) |
| 3 | **Macro Event Risk** | What scheduled catalyst could change the setup? |
| 4 | **Trend / Market Structure** | Are risk assets technically intact? |
| 5 | **Volatility / Stress** | Is fear rising? |
| 6 | **Credit / Liquidity** | Is risk appetite confirmed by credit? |
| 7 | **Rates + Dollar Headwinds** | Are macro headwinds building? |
| 8 | **GEX / Positioning** | Is positioning helping or hurting short-term trades? |
| 9 | **Risk Appetite** (renamed gauge) | How much fear/greed is priced now? |
| 10 | **AI Recap / Trading Mode** | What should the trader actually do? |

---

## Scoring model (the core change)

Each sleeve emits a **0–100 sub-score** (higher = more risk-on / less stress). The **Environment
Score** is the weighted sum:

| Sleeve | Weight |
|---|---|
| Trend / Structure | 30% |
| Volatility / Stress | 20% |
| Credit / Liquidity | 15% |
| Rates + Dollar | 15% |
| GEX / Positioning (tactical overlay) | 20% |

```
Environment Score =
  0.30·Trend + 0.20·Volatility + 0.15·Credit + 0.15·RatesDollar + 0.20·GEX
```

A missing sleeve → its weight is **redistributed proportionally** across the available sleeves
(mirror the existing null-redistribution in `useSentimentGauge.ts` lines 158–166).

**Regime bands:**

| Score | Label | Banner dot | Trading interpretation |
|---|---|---|---|
| 75–100 | Risk-On | green `--c5` | Normal sizing, breakouts acceptable, less need for hedges |
| 60–74 | Constructive / Selective | green-blue `--c4` | Favor strongest setups only |
| 45–59 | Cautious / Neutral | amber `--c3` | Reduce chase, wait for reclaim levels, tighter stops |
| 30–44 | Defensive | muted `--c1` | Smaller size, hedges allowed, avoid weak charts |
| 0–29 | Risk-Off | red `--c1` | Capital preservation, mostly cash/hedges, only tactical trades |

---

## Module 1 — Market Regime Banner

One line + dot, `SectionHeader` pattern (title outside the card, `Updated: {fmtDateTime}`
right-aligned). Regime label + dot come from the **Environment Score band** above — **not** a row
count.

The banner also carries a **direction descriptor** derived from the 5D move in the Environment
Score:

| Descriptor | Meaning |
|---|---|
| Improving | Module scores rising |
| Deteriorating | Module scores falling |
| Reversing Up | Was weakening, now recovering |
| Reversing Down | Was improving, now weakening |
| Mixed | No clean directional read |

```
● CAUTIOUS / NEUTRAL — reversing down after failed reclaim     Updated: Jun 27 · 9:58 AM ET
```

---

## Module 2 — Module Score Strip

A compact row of cards directly below the banner so users instantly see what's driving the regime.

| Module | Example value |
|---|---|
| Trend | `58 · Caution · 5D −7` |
| Volatility | `42 · Elevated · 5D −10` |
| Credit | `64 · Stable · 5D +2` |
| Rates/USD | `39 · Headwind · 5D −8` |
| GEX | `35 · Bearish · 3D flat` |

Layout: full-width single row on desktop; horizontal-scroll / wrap on mobile. Each card's color
follows its sub-score (green ≥60, amber 40–59, red <40).

---

## Module 3 — Macro Event Risk (new)

Answers: *what scheduled macro events could change the setup?* Event risk is a **temporary overlay,
never a permanent regime-score change.**

### Events to track

| Event | Importance |
|---|---|
| CPI / Core CPI | Very High |
| PCE Inflation | Very High |
| FOMC Decision + Powell press conference | Very High |
| Nonfarm Payrolls / Unemployment Rate | Very High |
| PPI | High |
| Average Hourly Earnings | High |
| Jobless Claims · Retail Sales · ISM Mfg/Services | Medium |
| Treasury Auctions | Medium/High (rate-sensitive regimes) |

### Pre-release state

Show: event · date/time (ET) · consensus · previous · current setup · risk note.

```
High Event Risk: CPI tomorrow at 8:30 AM ET
Setup: QQQ below short-term MAs, 10Y rising, VIX elevated.
Interpretation: Market is vulnerable to a hot inflation print.
```

### Post-release state

Pull: actual · consensus · previous · **surprise = actual − consensus** · market reaction · regime
context. **Interpretation must combine** actual-vs-consensus + pre-event setup + reactions across
SPY/QQQ + US10Y + VIX + HYG — never read an event in isolation.

```
CPI came in hotter than expected. Core CPI: 0.4% vs 0.3% expected.
Setup: QQQ below 9D/21D, 10Y rising, VIX elevated.
Interpretation: Negative for growth stocks unless yields reverse lower.
Watch QQQ reclaim of 21D MA before increasing risk.
```

### Overlay lifecycle

| State | Overlay |
|---|---|
| No major event within 48h | None |
| Major event within 24–48h | Event Watch |
| Major event within 24h | High Event Risk |
| Actual released, meaningful surprise | Reaction Overlay |
| 1–3 trading days after event | Fades unless structure changed |

Risk levels: **Low** (nothing in 48h) · **Medium** (medium-impact, or major >24h out) · **High**
(CPI/PCE/FOMC/NFP within 24h) · **Shock** (actual meaningfully beats/misses consensus).

Typical first-pass interpretations (still cross-checked against setup): hotter CPI/PPI/PCE → bearish
for growth/risk if yields rise; cooler → bullish if yields fall; strong jobs + hot wages → bearish
if rate expectations rise; weak jobs + higher unemployment → bullish only if recession stress is
low; dovish Fed → risk-on unless growth stress severe; hawkish Fed → risk-off pressure (esp.
QQQ/IWM); weak ISM → bearish if credit + breadth deteriorating; soft retail sales → mixed.

### Data-source dependency (Phase-3 decision, not resolved here)

Needs an economic-calendar source with **actual / consensus / previous**:

| Option | Pros | Cons |
|---|---|---|
| Trading Economics API | Good calendar coverage | Paid / API key |
| Financial Modeling Prep economic calendar | Simple API | Verify plan limits |
| EODHD economic calendar | Market-data friendly | Paid |
| FRED | Great history | Not a consensus/release calendar |

**MVP fallback:** a manual important-events list + official-source links. **Later:** store released
values in Supabase for historical impact tracking.

---

## Module 4 — Trend / Market Structure

The **only** home for the 9/21/200 MA framework.

| Symbol | Role | Default |
|---|---|---|
| SPY | Core market trend | Yes |
| QQQ | Growth / tech risk | Yes |
| IWM | Small-cap risk appetite | Expert |
| RSP | Breadth / equal-weight confirmation (same constituents as SPY, 0.2% each) | Expert |
| VEA | Global developed-market confirmation | Expert |

Sector ETFs are deferred to the Sector Rotation phase.

### Signal logic — 5 buckets (adds the recovery bucket)

| Condition | Signal | Sub-score |
|---|---|---|
| Close > 9D, 21D, 200D | Momentum | 90 |
| Close > 21D & 200D, below 9D | Healthy Pullback | 70 |
| Close > 200D, below 9D & 21D | Mid-Term Caution | 50 |
| Close < 200D, but above 9D and/or 21D | **Bear-Market Rally / Recovery Attempt** | 35 |
| Close < 9D, 21D, 200D | Risk-Off Trend | 10 |
| Insufficient data | N/A | — |

The **Bear-Market Rally** bucket is the key fix: an asset below its 200D but bouncing above 9/21D
must not read as bullish. **Trend sleeve score = average of active indicators' sub-scores.**

### 5D trend tracking

Track current structure score, score 5 trading days ago, 5D delta, prior 5D delta, reversal label.
Per-row badge:

```
SPY  Caution   5D ↓ weakening
QQQ  Caution   5D ↓ strong deterioration
IWM  Momentum  5D ↑ improving
```

---

## Module 5 — Volatility / Stress

Cards, not a trend row. Thresholds give readability; **also compute rolling percentile** (trailing
~252 closes) so "VIX 19" reads as calm-in-context vs elevated-in-context.

| Input | Green (calm) | Yellow | Red (fear) |
|---|---|---|---|
| VIX level | < 15 | 15–20 | > 20; severe > 25 |
| VVIX (vol-of-vol / tail risk) | < 85 | 85–100 | > 100 |
| IV Premium = VIX ÷ 30D realized vol | < 0.90 | 0.90–1.25 | > 1.25 |
| VIX direction (3–5D) | falling | flat | rising fast |

30D realized vol:
```
dailyLogReturn  = ln(close[t] / close[t-1])
realizedVol30   = stdev(last 30 dailyLogReturns) · sqrt(252) · 100
ivPremium       = VIX / realizedVol30
```
The `hv30` helper already exists (`useSentimentGauge.ts` lines 22–29) — **promote it to a shared
util.** Stress sleeve score: higher = less stress (calm 80–100 · normal 55–79 · elevated 30–54 ·
stress 0–29). Track VIX/VVIX/IV-premium 5D % change + stress-score 5D delta. VVIX skipped
gracefully if `^VVIX` is unavailable on the free tier (redistribute its weight).

---

## Module 6 — Credit / Liquidity

v1 uses **HYG as a credit proxy** (label it as a proxy, not a true spread).

| Condition (HYG, v1) | Signal | Score |
|---|---|---|
| Above 50D and rising | Credit Confirming | 80 |
| Above 50D but falling | Mild Caution | 60 |
| Below 50D but stabilizing | Mixed | 45 |
| Below 50D and falling | Credit Warning | 20 |

Track HYG 5D % change + HYG-vs-50D spread change. Credit often deteriorates before equities fully
break, so the 5D trend matters here.

**Later (v2 data):** ICE BofA High-Yield OAS (FRED `BAMLH0A0HYM2`) — the cleanest credit-stress
input (HYG mixes credit with ETF flows + duration); HYG vs IEF/TLT relative strength.

---

## Module 7 — Rates + Dollar Headwinds

US10Y as its own **rates card, displayed as yield %** (FRED 10-yr constant maturity is quoted in
percent) — never a price row in the trend table.

| US10Y condition | Signal | Score |
|---|---|---|
| < 4.30% and falling | Growth Tailwind | 80 |
| 4.30–4.50% and stable | Neutral / Watch | 55 |
| > 4.50% and rising | Rate Headwind | 20 |
| Falling fast while VIX/credit stress rises | **Risk-Off Flight to Safety** | 30 |

The last row matters: **falling yields are not always bullish** — when yields fall while VIX rises
and credit weakens, it's flight-to-safety, not a growth tailwind. So the US10Y score is
**cross-checked against the Vol + Credit sleeves** before scoring it green.

| UUP condition | Signal | Score |
|---|---|---|
| Below 9D and 21D | Dollar Tailwind | 80 |
| Mixed | Neutral | 50 |
| Above 9D and 21D + rising | Dollar Headwind | 20 |

Sleeve score = blend of US10Y + UUP. Track US10Y 5D change (basis points) + UUP 5D %. Optional
expert: TLT (duration/rate sensitivity).

---

## Module 8 — GEX / Positioning (tactical card)

Its own card near the top — **not** buried in the gauge. Reads the latest `signals` row via the
existing `fetchGraddox()` / `useGraddox`.

| GEX bias | Score |
|---|---|
| Bullish | 90 |
| Flat | 55 |
| Conflicted | 35 |
| Bearish | 10 |

Card surfaces: **Bias · 3D/5D bias-score delta · Key level · Trigger · Trade implication.** Use
shorter windows (1D/3D/5D) because GEX changes fast. This is the STW-unique module — keep it
visually prominent.

```
GEX Bias: Bearish     3D Trend: Flat
Key Level: SPY 735
Trigger: Reclaim above GEX1 improves the tactical setup
Implication: Avoid chasing longs until reclaim
```

---

## Module 9 — Risk Appetite (renamed from Sentiment Gauge)

A separate score from the Market Regime — labeled **Risk Appetite** so it doesn't conflict with the
regime banner. Answers "how much fear/greed is priced right now?"

Large SVG arc gauge (0–100) with needle; below it, the component rows so users see *why* the needle
is where it is. Adjusted to avoid duplication: **Dollar moved out** (now lives in Rates + Dollar);
**Breadth added.**

| # | Component | Weight | Source |
|---|---|---|---|
| 1 | Market Momentum | 18% | SPY vs 125D MA |
| 2 | Volatility (VIX) | 16% | Finnhub `^VIX` |
| 3 | IV Premium | 16% | VIX ÷ 30D realized vol |
| 4 | Tail Risk (VVIX) | 12% | Finnhub `^VVIX`, **percentile-based** |
| 5 | GEX Bias | 18% | Supabase `signals` (tactical) |
| 6 | Credit | 10% | HYG now / HY OAS later |
| 7 | Breadth | 10% | RSP/SPY (or % stocks above 50D/200D) |

(Weights sum to 100%.) Bands: Extreme Fear (0–24) · Fear (25–44) · Neutral (45–55) · Greed (56–74)
· Extreme Greed (75–100). Show a 5D delta:

```
Risk Appetite: 34 · Fear · 5D −9
```

---

## Module 10 — AI Recap / Trading Mode

Reworked `macro-recap` Netlify function. **Input** = regime + per-module scores + event risk:

```json
{
  "regime":    { "score": 48, "label": "Cautious / Neutral", "fiveDayDelta": -8, "trendLabel": "Deteriorating" },
  "modules": {
    "trend":       { "score": 58, "fiveDayDelta": -7,  "label": "Caution" },
    "volatility":  { "score": 42, "fiveDayDelta": -11, "label": "Elevated" },
    "credit":      { "score": 64, "fiveDayDelta": 2,   "label": "Stable" },
    "ratesDollar": { "score": 39, "fiveDayDelta": -8,  "label": "Headwind" },
    "gex":         { "score": 35, "threeDayDelta": 0,  "label": "Bearish" }
  },
  "eventRisk": { "level": "High", "event": "CPI", "time": "Tomorrow 8:30 AM ET",
                 "consensus": "0.3% Core CPI MoM", "previous": "0.2%", "overlay": "High Event Risk" }
}
```

**Output:**
```json
{
  "summary":      "2–3 sentence market read",
  "whatChanged":  "one sentence on the acceleration/reversal",
  "eventRisk":    "one sentence if event risk is active (else empty)",
  "keyLevel":     735,
  "keyLevelNote": "SPY 21D MA / GEX level",
  "tradingMode":  "Selective / Defensive / Risk-On",
  "bottomLine":   "one sentence bottom line"
}
```

Same JWT auth (copy `ibkr-flex.ts`), same ISO-week localStorage cache (`macro-recap-{YYYY}-W{WW}`),
same Refresh button. **Convert `macro-recap.ts` to direct `fetch()` to
`https://api.anthropic.com/v1/messages`** — the current file imports `@anthropic-ai/sdk`, which
CLAUDE.md says causes Netlify 502s (pass `x-api-key`, `anthropic-version: 2023-06-01`, JSON body;
model `claude-haiku-4-5-20251001`).

---

## 5D Trend Engine + Storage

New `useMacroTrendHistory.ts`. Write **one snapshot per trading day** to localStorage; 5D/20D deltas
+ direction labels feed every module badge, the Module Score Strip, the banner descriptor, and the
recap.

localStorage keys:
```
macro-module-history-{YYYY-MM-DD}
macro-indicator-history-{symbol}-{YYYY-MM-DD}
macro-event-cache-{YYYY-MM-DD}
```

**v2 option (later, not migrated now):** a Supabase table for cross-device history —
```sql
CREATE TABLE IF NOT EXISTS macro_daily_snapshots (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date    DATE NOT NULL UNIQUE,
  module_scores    JSONB NOT NULL DEFAULT '{}',
  indicator_scores JSONB NOT NULL DEFAULT '{}',
  event_risk       JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Data Model — new shared types

`packages/shared/src/types/macro.ts` adds:

```ts
export type TrendDirection =
  | 'strong_improvement' | 'improving' | 'flat'
  | 'deteriorating' | 'strong_deterioration'
  | 'reversing_up' | 'reversing_down';

export type MacroModuleKey =
  | 'trend' | 'volatility' | 'credit' | 'rates_dollar' | 'gex' | 'event_risk';

export interface MacroModuleScore {
  key: MacroModuleKey;
  label: string;
  score: number;
  oneDayDelta?: number;
  fiveDayDelta?: number;
  twentyDayDelta?: number;
  trendDirection: TrendDirection;
  updatedAt: string;
}

export interface MacroEventRisk {
  eventId: string;
  eventName: string;
  importance: 'low' | 'medium' | 'high' | 'very_high';
  releaseTime: string;
  actual?: number | string;
  consensus?: number | string;
  previous?: number | string;
  surprise?: number | string;
  status: 'upcoming' | 'released' | 'reaction_overlay' | 'expired';
  riskLevel: 'low' | 'medium' | 'high' | 'shock';
  marketComment?: string;
}
```
Plus the 5-bucket trend types and the revised Risk Appetite inputs. The pure scorers — `trendBucket()`,
per-sleeve scorers, `environmentScore()`, `regimeBand()`, `tradingMode()` — live in `@stw/shared`
and are **unit-tested**.

---

## Build Phases

| Phase | Scope |
|---|---|
| **P1 — Clean module structure** | Regime Banner · Module Score Strip · Trend table (5 buckets) · Volatility · Credit · Rates+Dollar · GEX card · Risk Appetite gauge. No calendar yet. |
| **P2 — 5D trend engine** | `useMacroTrendHistory`, localStorage daily snapshots, 5D/20D deltas, direction labels, module badges, recap integration. |
| **P3 — Macro Event Risk** | `useMacroEvents`, `macro-events` Netlify fn, upcoming card, actual-vs-consensus parser, surprise classification, 1–3 day reaction overlay, recap integration. (Data-source decision required.) |
| **P4 — Portfolio Heatmap** | (preserved — see below). |
| **P5 — Sector Rotation** | (preserved — see below). |

---

## New / Modified Files (the rebuild)

**New:**
```
packages/ui/src/features/macro/
  useMacroModuleScores.ts        — per-sleeve 0–100 scores → Environment Score + regime band
  useMacroTrendHistory.ts        — daily snapshots, 5D/20D deltas, direction labels
  useMacroEvents.ts              — economic calendar (P3)
  components/
    ModuleScoreStrip.tsx
    MacroEventRiskCard.tsx
    TrendStructureTable.tsx
    VolatilityStressCard.tsx
    CreditLiquidityCard.tsx
    RatesDollarCard.tsx
    GexPositioningCard.tsx
apps/web/netlify/functions/macro-events.ts   — economic calendar proxy (P3)
```

**Modified:**
| File | Change |
|---|---|
| `packages/shared/src/types/macro.ts` | Add the v2 types above; add pure scorers + tests |
| `packages/ui/src/features/macro/useMacroIndicators.ts` | Trend symbols only — **drop VIX/US10Y**, drop the `isYield` special-case |
| `packages/ui/src/features/macro/useSentimentGauge.ts` | Rename concept → Risk Appetite; remove Dollar, add Breadth; percentile VVIX; promote `hv30` to shared |
| `packages/ui/src/features/macro/MacroView.tsx` | Render the 10 modules in order; replace row-count `computeRegime` with weighted scores |
| `packages/ui/src/features/macro/components/EnvironmentBanner.tsx` | Regime from Environment Score + direction descriptor |
| `packages/ui/src/features/macro/components/MacroRecapCard.tsx` | Consume module scores + event risk; new output fields |
| `apps/web/netlify/functions/macro-recap.ts` | New module-score input; **convert to direct `fetch()`** |
| `packages/ui/src/features/macro/components/IndicatorTable.tsx` | **Retire** — replaced by `TrendStructureTable` |

No migration in P1/P2 (047 `macro_prefs` already covers per-user indicator visibility).
`macro_daily_snapshots` is a P2-optional future migration.

---

## Key Reuse (do not reinvent)

| What | Where |
|---|---|
| Finnhub staggered fetch + 15-min cache | `useMacroIndicators.ts` (existing) / `PicksView.tsx` |
| `usePriceCacheStore` Zustand store | `packages/ui/src/store/priceCache.ts` |
| TwelveData daily-OHLC fetch + MA cache | `useMacroIndicators.ts` (existing) |
| `hv30` realized-vol helper | `useSentimentGauge.ts` lines 22–29 → promote to `@stw/shared` |
| `fetchGraddox()` / `useGraddox` → GEX bias | `packages/ui/src/features/signals/api.ts` |
| `fmtDateTime` for timestamps | `@stw/shared` |
| `SectionHeader` pattern (title outside card, right-aligned `Updated:`) | `MacroView.tsx` / `PortfolioDashboard.tsx` |
| `TickerLink` + `onSelectTicker` | `packages/ui/src/features/picks/components/TickerLink.tsx` |
| JWT auth in Netlify fn | `apps/web/netlify/functions/ibkr-flex.ts` |
| Anthropic direct-`fetch()` pattern | (target) `macro-recap.ts` per CLAUDE.md Conventions |

---

## Design System

- Dark theme, `--surface`/`--s2` cards, `--border` borders.
- Signal colors: `--c5` green (bullish/calm), `--c3` amber (caution), `--c1` red (bearish/stress).
- White text on any filled green button/badge (`color: '#fff'`).
- Timestamps right-aligned; filters/labels left.
- Mobile-first **and** desktop-complete (see Responsive section).

---

## Verification Checklist (rebuild)

**Macro tab**
- [ ] Regime banner shows score-derived label + direction descriptor (not a row count)
- [ ] Module Score Strip shows all module scores with 5D deltas
- [ ] Trend table groups SPY/QQQ/IWM/RSP/VEA with the 5-bucket logic (incl. Bear-Market Rally)
- [ ] VIX and US10Y are **not** in the trend table
- [ ] Volatility card shows VIX, VVIX, IV Premium (+ percentile)
- [ ] Credit card shows HYG status (labeled proxy)
- [ ] Rates/Dollar card shows US10Y as yield % + UUP
- [ ] GEX card shows latest bias, key level, trigger, implication
- [ ] Gauge is labeled **Risk Appetite**; Dollar removed, Breadth present
- [ ] 5D trend badges show improving/deteriorating/reversing labels
- [ ] AI recap includes whatChanged + tradingMode + event-risk line

**Macro Event Risk (P3)**
- [ ] Upcoming major event appears with importance, consensus, previous
- [ ] After release: actual + surprise populate; reaction across SPY/QQQ/US10Y/VIX/HYG
- [ ] Overlay fades after 1–3 trading days unless structure changed
- [ ] Recap references the event only when relevant

**Responsive**
- [ ] Score strip scrolls/wraps cleanly on mobile; single row on desktop
- [ ] Module cards: grid on desktop, stacked on mobile
- [ ] Trend table scrolls inside its card on mobile (not page scroll)
- [ ] Gauge renders at reduced size without clipping; two-column on desktop
- [ ] Verified at ≤390px AND ≥1100px

**Technical**
- [ ] `pnpm typecheck` · `pnpm test` (shared scorers green)
- [ ] `pnpm dev:web` and `pnpm dev:admin` (`/macro` tab, no paywall on admin)
- [ ] Netlify functions work under `netlify dev`
- [ ] No API keys exposed client-side unless intentionally `VITE_`

---

## Preserved — Phase 4: Portfolio Heatmap (PortfolioDashboard)

New block in `packages/ui/src/features/picks/components/PortfolioDashboard.tsx`, after the
Conviction Changes block.

- Treemap grid; **box size ∝ `holdings.current_weight`**.
- **Color modes (toggle):** *Today* = day % change from Finnhub (green up / red down, intensity by
  magnitude, ±3% = full saturation); *Total* = unrealized return since entry —
  `(currentPrice − entryPrice)/entryPrice` for shares, `(markPrice − entryPrice)/entryPrice` for
  option legs.
- Box content: ticker + value; click → `onSelectTicker(ticker)`.
- **Toggles (top-right):** Today | Total · By Basket | All.
- Data: `useHoldings` (weights + joined legs), `useLivePrice` + `usePriceCacheStore`. Exclude CASH
  and closed positions.
- Implementation: CSS grid proportional sizing or a small slice-and-dice/squarified treemap util in
  `@stw/shared` (no external library). Min box size so small positions stay tappable at ≤390px.

---

## Preserved — Phase 5: Sector Rotation

11 SPDR sectors: XLK, XLV, XLF, XLE, XLI, XLY, XLP, XLU, XLRE, XLB, XLC. Apply the **9+21+200 MA
5-bucket grouping** (same as the Trend module). Radar charts: RS vs SPY across Week / 1M / 3M / 6M /
1Y. "Leaders" and "Setting Up" rows populated from STW holdings mapped to each sector basket. XLSR
excluded (meta-ETF deriving from the same XL_ data).

---

## New Netlify Env Vars

On the **web** Netlify site (server-side only, no `VITE_` prefix):
- `ANTHROPIC_API_KEY` — already added for `macro-recap`.
- Economic-calendar API key (P3) — name TBD once the data source is chosen.
