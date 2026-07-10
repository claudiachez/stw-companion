# Prompt: Generate the Macro Dashboard end-user guide

> **What this file is.** This is not the end-user guide itself — it is a **reusable prompt**. Paste
> the entire contents of this file into a fresh Claude conversation (or any capable LLM) and it will
> generate the actual subscriber-facing help article. It is self-contained: every number, threshold,
> and data-source fact a writer would need is embedded below, verified directly against the source
> code (`packages/shared/src/utils/macro.ts`, `packages/ui/src/features/macro/**`,
> `apps/web/netlify/functions/macro-*.ts`) as of 2026-07-10 (updated for the data-feeds
> re-platform: FRED index feeds, VVIX removal, Market Internals consolidation). Re-run this prompt any time the guide
> needs regenerating or updating — there is no need to re-derive these facts from the codebase again
> unless the underlying modules change (in which case, update the "Ground-truth data" section below
> first, then re-run).

---

## 1. Task

You are writing a **subscriber-facing help article** that explains the **Macro tab** of the STW
Companion app — a dashboard of 11 stacked modules that together answer "what kind of market
environment are we in right now, and how should that change my trading?"

**Audience:** beginner-to-intermediate retail traders. Assume they know what a stock, an ETF, and
basic candlestick terms are, but do **not** assume they know what VIX, GEX, basis points, realized
volatility, or relative strength mean — define every term the first time it's used.

**Tone:** analytical and educational, never advisory. Explain *what the dashboard is showing and why
it's constructed that way* — never tell the reader what to buy, sell, or do with their own money.
Phrases like "this module tells you whether trend is intact" are fine; phrases like "you should buy
the dip here" are not.

**Grounding rule (critical):** every number, weight, threshold, or band cutoff you state **must**
come from the "Ground-truth data" section below. Do not invent, round suggestively, or "improve" any
figure. If something isn't covered below (e.g. a precise historical example), say so in general terms
rather than fabricating a specific instance. This mirrors the same no-fabrication rule the app's own
AI recap feature (`macro-recap.ts`) is built to follow — never invent a data point you weren't given.

---

## 2. Ground-truth data (verified against source, 2026-07-10)

The Macro tab renders 11 modules top-to-bottom, in this exact order. Each subsection below gives you
everything you need to write that module's section: what question it answers, every metric it shows,
the exact scoring mechanics (where they exist), the data source + refresh cadence, who can see/control
what, and the app's own in-product explanation (so your prose can expand on it, never contradict it).

### Module 1 — Market Regime (banner)

**Question it answers:** How aggressive should I be right now, overall?

This is the headline number: a single 0–100 **Environment Score**, a weighted blend of five
"sleeves" (modules 4–8 below), mapped to one of five **regime bands**:

| Score range | Band | Trading mode (shown verbatim in the app) |
|---|---|---|
| 75–100 | **Risk-On** | "Normal sizing, breakouts acceptable, less need for hedges" |
| 60–74 | **Constructive / Selective** | "Favor strongest setups only" |
| 45–59 | **Cautious / Neutral** | "Reduce chase, wait for reclaim levels, tighter stops" |
| 30–44 | **Defensive** | "Smaller size, hedges allowed, avoid weak charts" |
| 0–29 | **Risk-Off** | "Capital preservation, mostly cash/hedges, only tactical trades" |

**Sleeve weights** (sum to 100%):

| Sleeve | Weight | Source module |
|---|---|---|
| Trend | 30% | Module 4 |
| Volatility | 20% | Module 5 |
| Credit | 15% | Module 6 |
| Rates + Dollar | 15% | Module 7 |
| GEX (positioning) | 20% | Module 8 |

These default weights are now **admin-configurable** (they were previously hardcoded) — the STW
editor can retune them; the values above are the current defaults and are what the guide should
state. If a sleeve's data is temporarily unavailable, its weight is **redistributed proportionally**
across whichever sleeves do have data that moment — the score never just goes blank because one
input is missing.

The banner also shows a **5-day direction descriptor** (Improving / Deteriorating / Reversing Up /
Reversing Down / Mixed) — see the "5-Day Trend Engine" note at the end of this section for exactly how
that's computed and its real current scope (per-browser, not yet cross-device).

**In-app explanation (verbatim):** "The overall market read, computed from weighted sleeve scores —
Trend 30%, Volatility 20%, Credit 15%, Rates+Dollar 15%, GEX 20%. 75–100 = Risk-On, 60–74 =
Constructive, 45–59 = Cautious, 30–44 = Defensive, 0–29 = Risk-Off. It answers: how aggressive should
I be right now?"

**Source/cadence:** purely derived from modules 4–8 below — no separate fetch of its own.

---

### Module 2 — Module Scores (score strip)

**Question it answers:** Of the five sleeves feeding the regime score, which ones are actually driving
today's read?

A horizontal row of five cards (Trend, Volatility, Credit, Rates/USD, GEX), each showing its 0–100
score, a status word, and a short-term delta. Four sleeves show a **5-day delta**; GEX shows a
**3-day delta** instead, because GEX positioning can flip faster than the others. Deltas read as
null/blank until enough days of history have accumulated (see the 5-Day Trend Engine note).

**In-app explanation (verbatim):** "Each sleeve's 0–100 score at a glance (higher = more risk-on).
Shows what's actually driving the regime — whether it's trend, stress, credit, rates, or positioning."

**Source/cadence:** same as Module 1 — derived from modules 4–8.

---

### Module 3 — Event Risk

**Question it answers:** Could a scheduled economic release in the next day or two change the setup?

This is a **temporary overlay**, not a permanent change to the regime score. It classifies the current
moment into one of four states based on a calendar of macro releases (CPI, FOMC, jobs reports, etc.):

| State | Trigger |
|---|---|
| No major event risk | Nothing important due within 48 hours |
| Event Watch | A Very-High/High-importance event is 24–48 hours out (or any tracked event ≤48h out with nothing bigger ahead) |
| High Event Risk | A Very-High/High-importance event is within 24 hours |
| Reaction Overlay | A tracked event was *released* within the last ~72 hours (about 1–3 trading days) — the market is still digesting it |

Events are tiered into four importance levels by name-matching: **Very High** (CPI, PCE, FOMC rate
decisions, Powell speeches, Nonfarm Payrolls, unemployment rate), **High** (PPI, average hourly
earnings), **Medium** (jobless claims, retail sales, ISM Manufacturing/Services, Treasury/bond
auctions), everything else **Low**.

**What actually works vs. what doesn't (state this plainly in the guide):** the reliable part of this
module is the *upcoming*-event risk windows — Event Watch and High Event Risk — which flag that a
known release is coming in the next day or two. The economic-release calendar carries scheduled dates
but **not** the actual print value or the consensus estimate, so the post-release "surprise / shock"
reaction is **not** computed from the feed. Frame this module as a forward-looking heads-up on what's
coming, not a scorer of what just landed. (You may still note that the card pairs an upcoming event
against the live setup — QQQ's trend bucket, VIX level/direction, 10-year yield direction — to compose
a plain-language read of how much that event could matter right now.)

**Data source:** scheduled events come from **FRED's economic-release calendar** (Federal Reserve
Economic Data — the Fed's free, authoritative public data service; CPI, PCE, Employment/NFP, GDP, and
PPI releases) plus a built-in **static list of FOMC rate-decision dates**. The old MarketWatch scrape
and the FXStreet cross-check link are **retired** — do not mention them. If the data source is
unavailable, the card shows an explicit unavailable warning rather than ever fabricating a fake event
row.

**In-app explanation (verbatim):** "What scheduled macro events (CPI, FOMC, jobs, etc.) could change
the setup in the next 1-2 days. This is a temporary OVERLAY, not a permanent change to the regime
score — it fades a few trading days after the print unless the structure actually shifted. Scheduled
dates come from FRED's release calendar plus a static FOMC schedule."

---

### Module 4 — Trend / Market Structure

**Question it answers:** Are risk assets technically intact right now? This is the heaviest-weighted
sleeve (30% of the regime score).

Shows SPY (S&P 500) and QQQ (Nasdaq 100) by default; clicking either ticker toggles three more —
IWM (Russell 2000, small caps), RSP (equal-weight S&P 500), VEA (developed international markets) —
no special "expert" permission needed, it's a plain click-to-show toggle available to every user.

Each symbol is classified into one of five structure buckets by comparing its current price (close) to
its 9-day, 21-day, and 200-day moving averages (MAs — the average closing price over that many trading
days, a standard way to gauge short/medium/long-term trend):

| Bucket | Condition | Sub-score |
|---|---|---|
| Momentum | Above the 9-, 21- **and** 200-day MA | 90 |
| Healthy Pullback | Above 21D and 200D, but dipped below the 9D | 70 |
| Mid-Term Caution | Above the 200D, but below both 9D and 21D | 50 |
| **Recovery Attempt (bear-market rally)** | **Below** the 200D, but bouncing above the 9D/21D | 35 |
| Risk-Off Trend | Below the 9-, 21- **and** 200-day MA | 10 |

**Key concept to teach (use this as a worked example):** the "bear-market rally" bucket exists
specifically because a short-term bounce while still below the long-term (200-day) trendline is *not*
the same thing as a real recovery — it scores only 35/100, well below "Healthy Pullback" (70), because
the long-term trend is still broken even though price is bouncing. This is the dashboard's single
biggest correction vs. a naive "price is going up = bullish" read.

The Trend sleeve's overall score is the **average of the active per-symbol sub-scores** among whichever
symbols are currently visible.

**In-app explanation (verbatim):** "Are risk assets technically intact? Each index vs its 9-, 21- and
200-day moving averages. Above all three = momentum; below the 200-day = risk-off; below the 200-day
but bouncing above the short ones = a bear-market rally (not bullish). The heaviest sleeve (30%)."

**Source/cadence:** live quotes from Finnhub (refreshed at most every 15 minutes, cached per-browser);
daily closes (for the moving averages) from TwelveData, cached once per day.

---

### Modules 5–7 — consolidated into one "Market Internals" section

**Important layout change:** the next three sleeves — Volatility / Stress (Module 5), Credit /
Liquidity (Module 6), and Rates + Dollar Headwinds (Module 7) — are now presented together under one
**Market Internals** section, as **one compact row per sleeve** (score + status word + key values),
not three separate cards. Keep explaining the three concepts individually in the guide, but note that
they now live together under "Market Internals" if you describe the tab's layout module-by-module.

**Shared data-source change:** all three of these sleeves now read their index-level inputs from
**FRED** (Federal Reserve Economic Data — the Fed's free, authoritative public data service). This
replaced the earlier ETF-proxy / third-party approach entirely. FRED serves the VIX, the 10-year
Treasury yield, the high-yield credit spread, and the dollar index as real published series.

---

### Module 5 — Volatility / Stress

**Question it answers:** Is fear rising in the options market?

Two indicators, each converted to a 0–100 sub-score where **higher = calmer** (so it can combine
cleanly with the other risk-on sleeves):

- **VIX** — the CBOE Volatility Index, the market's gauge of expected 30-day S&P 500 volatility (the
  classic "fear gauge"). Score: <15 → 90 (calm), 15–20 → 55 (normal), 20–25 → 30 (elevated), ≥25 → 10
  (severe).
- **IV Premium** — VIX divided by SPY's own realized 30-day volatility (an annualized measure of how
  much SPY has *actually* moved recently). A ratio above 1 means options are pricing in more future
  movement than has actually been happening — i.e., hedges are "expensive" relative to realized
  reality. Score: <0.90 → 85 (calm), 0.90–1.25 → 55 (normal), >1.25 → 20 (fear).
- A third internal sub-score (**VIX 5-day direction**) feeds the sleeve average but isn't shown as its
  own card: VIX falling ≥1 point over 5 trading days scores 80 (calming), roughly flat scores 50,
  rising ≥2 points scores 20 (fear building).

(**Note — VVIX has been removed entirely.** No free data feed serves it, so the old "volatility of
volatility / tail risk" sub-indicator no longer exists in this module. Do not include it.)

The Volatility/Stress sleeve score is the average of whichever of these three sub-scores are available,
labeled Calm (≥70) / Normal (≥45) / Elevated (≥25) / Stress (below 25). The card also shows VIX's
roughly 1-year **percentile rank** (how today's level compares to the past year) so "VIX 19" can read
as calm-in-context rather than an absolute number out of context.

**In-app explanation (verbatim):** "Is fear rising? VIX = expected S&P volatility; IV Premium = VIX ÷
realized vol (how expensive hedges are vs how much the market is actually moving). Higher score =
calmer."

**Source/cadence:** the VIX comes from **FRED** (series `VIXCLS`), including the historical daily
series used for the percentile and 5-day trend. Realized volatility for the IV Premium is computed
from SPY daily closes (TwelveData). Note: FRED also serves the 3-month VIX (series `VXVCLS`), which is
what lets the regime "volatility state" term-structure check (VIX vs VIX3M) actually resolve now — it
previously often showed UNKNOWN because VIX3M wasn't available.

---

### Module 6 — Credit / Liquidity

**Question it answers:** Is the credit/bond market confirming the move in stocks? Credit stress
typically shows up *before* an equity selloff, so this acts as an early warning.

Now uses the **real ICE BofA US High Yield Option-Adjusted Spread (OAS)** — the extra yield investors
demand to hold risky high-yield ("junk") corporate bonds over safe Treasuries. This replaced the old
HYG-ETF proxy with the actual credit-spread series. **Watch the sign carefully: a credit spread
*widens* as stress rises — higher / rising spread is worse**, the opposite direction to the old HYG
price (where higher was better). The score combines two booleans — is the spread below its 50-day
average, and is it tightening (narrowing) today — into a four-way score: below-MA (tighter) +
tightening → 80 (Confirming), below-MA + widening → 60 (Mild Caution), above-MA (wider) + tightening →
45 (Mixed), above-MA + widening → 20 (Warning). In words: below its 50-day average and tightening =
credit confirming; above its average and widening = stress.

**In-app explanation (verbatim):** "Is credit confirming the equity move? The high-yield credit spread
(ICE BofA HY OAS) vs its 50-day average — the spread widens when credit stress rises, so a tightening
spread below its average confirms the move and a widening spread above it is a warning. Credit usually
weakens before stocks do."

**Source/cadence:** FRED daily data for the ICE BofA US High Yield OAS (series `BAMLH0A0HYM2`).

---

### Module 7 — Rates + Dollar Headwinds

**Question it answers:** Are rising interest rates or a strengthening dollar creating headwinds for
growth and speculative stocks?

Two inputs:

- **US10Y** — the 10-year Treasury yield. Below 4.30% scores as a tailwind (80 if falling, 65 if not);
  4.30–4.50% scores neutral/watch (55); above 4.50% scores as a headwind (35, or 20 if actively
  rising). **Key nuance (use this as the second worked example):** a *fast* drop in yields (≥0.10
  percentage points over 5 trading days) at the same time volatility/credit stress is rising is treated
  as a **flight to safety** — money fleeing to bonds out of fear — and is deliberately scored low (30),
  *not* as a bullish growth tailwind, because falling yields driven by fear are a very different signal
  than falling yields driven by easing inflation.
- **The broad dollar index** — the trade-weighted value of the U.S. dollar (FRED's broad dollar index,
  which replaced the old UUP ETF proxy). A falling dollar scores as a tailwind (80, weak dollar helps
  multinational earnings and commodities); a rising dollar scores as a headwind (20); a flat/mixed read
  scores neutral (50).

The sleeve score is the average of the two, labeled Tailwind (≥60) / Neutral (≥40) / Headwind (below
40).

**In-app explanation (verbatim):** "Are macro headwinds building? Rising 10-year yields and a
strengthening dollar pressure growth and speculative stocks. Key nuance: yields falling while stress
rises is a flight to safety, not a growth tailwind."

**Source/cadence:** FRED daily data — the 10-year Treasury yield (series `DGS10`) and the broad
trade-weighted dollar index (series `DTWEXBGS`).

---

### Module 8 — GEX / Positioning

**Question it answers:** What is dealer/options positioning suggesting about near-term price magnets
and pivots? This is explicitly a **tactical overlay** — it helps time entries and spot pivot levels,
but doesn't define the whole macro picture on its own.

"GEX" = gamma exposure, a measure of how options dealers are positioned that can act as a magnet or
headwind around certain price levels. The card reads live **SPY** gamma and surfaces the **gamma flip**
(the pivot where dealer positioning turns from stabilizing to amplifying), the **call wall** (most call
gamma — an upside magnet / resistance), the **put wall** (most put gamma — support), and **net GEX**.
From spot vs the flip it gives a one-line positioning read:

| Reading | Implication |
|---|---|
| Positive γ (spot above the flip) | Dealers dampen moves — dips into support tend to hold; a grind, not a chase. |
| At flip | Right at the pivot — a decisive break either side sets the tone; wait for confirmation. |
| Negative γ (spot below the flip) | Dealers amplify moves — breaks accelerate; keep size down until spot reclaims the flip. |

A short delta shows the positioning score's change over the **last 3 days** (not 5) — GEX positioning
can shift faster than the other sleeves.

**In-app explanation (verbatim):** "Options-positioning read (dealer gamma exposure) for SPY, with the
gamma flip, call wall and put wall. Above the flip = positive gamma (dealers dampen moves); below =
negative gamma (dealers amplify moves). A tactical overlay: it helps time entries and spot pivots, but
doesn't set the whole macro picture on its own."

**Source/cadence:** the **FlashAlpha** GEX API (SPY as the index proxy), written twice per weekday
(~8:30am & 4:30pm ET) by a scheduled process and read from the app's database; the card shows when that
was last updated.

---

### Module 9 — Risk Appetite (gauge)

**Question it answers:** How much fear vs. greed is priced into the market *right now*? This is
explicitly a **different question** from the Market Regime (Module 1): the regime describes what the
environment objectively *is*; this gauge describes how emotional the tape currently *feels*.

A semicircular 0–100 gauge (0 = Extreme Fear, 100 = Extreme Greed) with five zones: **Extreme Fear**
(<25), **Fear** (25–44), **Neutral** (45–54), **Greed** (55–74), **Extreme Greed** (≥75). Built from
**six** weighted inputs (the old seventh input, Tail Risk / VVIX, has been removed along with VVIX
itself — no free feed serves it; do not include it):

| Input | What it measures |
|---|---|
| Market Momentum | SPY's price vs its 125-day moving average (±10% maps to the full 0–100 range) |
| Volatility (VIX) | Same VIX scoring as Module 5 |
| IV Premium | Same VIX÷realized-vol scoring as Module 5 |
| GEX Bias | Same Graddox bias scoring as Module 8 |
| Credit | The high-yield credit spread vs its 50-day average (as in Module 6) |
| Breadth | RSP (equal-weight S&P 500) vs SPY (cap-weighted) — is the *average* stock confirming the index, or is the rally narrow? |

These weights are shared verbatim between the live gauge shown here and the server-side process that
writes the daily history snapshot (see the 5-Day Trend Engine note below), specifically so the
persisted trend can never drift out of sync with what the gauge displays. As with the other composite
scores, a missing input has its weight redistributed across the inputs that are present.

**In-app explanation (verbatim):** "How much fear vs greed is priced right now (0 = extreme fear, 100
= extreme greed). A different question from the regime: the regime is what the environment IS; this is
how emotional the tape is. Built from momentum, VIX, IV premium, GEX, credit and breadth."

**Source/cadence:** FRED (VIX + high-yield credit spread) + TwelveData (SPY/RSP daily closes for
momentum and breadth) + STW's Graddox signal (GEX). Daily metrics refresh once per browser session.

---

### Module 10 — Market Recap

**Question it answers:** What does all of the above add up to, in plain English, for the week?

An AI-written weekly note (full sections: headline, verdict, "The Big Story," a bull/base/bear scenario
breakdown for the week ahead, a "Next Week" playbook, a "levels to watch" callout, a trading-mode tag,
and a closing "final word" line). It is generated automatically — there's no manual trigger required
for subscribers — and is cached/refreshed **once per ISO calendar week**.

**Grounding rule (important to convey to readers, and a rule for you to follow in this guide too):**
the note is built to use *only* the actual module scores, deltas, and GEX/positioning data it's given —
it's explicitly designed to never fabricate a specific number (a dollar flow figure, a streak count, a
named fund) that wasn't part of its actual inputs.

**Admin-only control:** every other control on this entire page is visible to all subscribers. This
module is the **one exception** — only the STW editor (admin) sees a "Regenerate" button and an
optional free-text steering note ("Optional: steer the next rewrite, e.g. focus more on credit stress
this week"). Subscribers only ever read the resulting note; they cannot trigger or influence a
regeneration themselves.

**In-app explanation (verbatim):** "An AI summary that turns all the module scores into a plain-English
read plus a suggested trading mode. Generates automatically and refreshes weekly."

**Source/cadence:** generated by a server-side function backed by Anthropic's Claude (Sonnet model,
falling back to a smaller Haiku model if needed), grounded only in the other ten modules' current
scores. The result is stored centrally so every subscriber sees the identical weekly note regardless of
device — this module IS cross-device by design, unlike the 5-day deltas described below.

---

### Module 11 — Sector Rotation

**Question it answers:** Where is money rotating across the market's 11 major sectors right now, and
which individual names look most interesting within each?

Shows all 11 SPDR sector ETFs (Technology, Health Care, Financials, Energy, Industrials, Consumer
Discretionary, Consumer Staples, Utilities, Real Estate, Materials, Communication Services), ranked
#1 (leading) to #11 (lagging) by the same trend-bucket structure used in Module 4 plus 1-month
**relative strength** (RS) vs SPY. (RS = that sector's return minus SPY's return over the same window,
in percentage points — a sector with RS of +3pp over 1 month outperformed the S&P by 3 percentage
points, regardless of whether the market itself was up or down that month.)

Each sector card includes a radar chart plotting its RS vs SPY across five lookback windows: **Week**
(5 trading days), **1 Month** (21 trading days), **3 Month** (63 trading days), **6 Month** (126
trading days), **1 Year** (252 trading days).

Below each radar, two chip rows surface individual stock ideas drawn from a curated list of ~6
well-known holdings *within that sector* (e.g. Technology's list includes Apple, Microsoft, Nvidia,
Broadcom, Oracle, Salesforce):

- **Leaders** — names whose own trend structure is confirmed bullish (Module-4-style "Momentum" or
  "Healthy Pullback" bucket), ranked by 1-month RS, top 5 shown.
- **Setting Up** — names still in a caution/recovery bucket ("Mid-Term Caution" or the bear-market-rally
  bucket) but whose 1-month RS has turned positive — i.e., early, not-yet-confirmed names, top 5 shown.

**Critical framing point — repeat this explicitly, it's a deliberate design choice:** these Leaders and
Setting Up tickers are each sector's **own** universe of well-known names — they are **not** STW's
existing held positions. The intent is to surface ideas beyond what STW already holds, complementing
the firm's picks rather than just re-listing them. A reader should never assume a ticker shown here is
something STW currently owns.

**In-app explanation (verbatim):** "Where money is rotating across the 11 SPDR sectors, ranked #1
(leading) to #11 (lagging) by structure + 1-month RS. Structure = the same 9/21/200-day trend bucketing
used in the Trend module; the radar plots each sector's RS vs SPY (percentage points) across
Week/1M/3M/6M/1Y. Leaders/Setting Up below each radar are stock ideas from that sector's OWN universe
(not STW's existing holdings) — Leaders have confirmed bullish structure, Setting Up are still
mid-caution/recovering but turning positive on 1M RS. They complement STW's picks, not replace them."

**Source/cadence:** TwelveData daily closes for both the 11 sector ETFs and their constituent stocks,
fetched in small sequential batches to respect API rate limits.

---

### Cross-cutting: the "5-Day Trend Engine" (deltas shown throughout)

Modules 1, 2, 8, and 9 each display a short-term delta (mostly 5 trading days; GEX uses 3). Be precise
about how these currently work, since it differs from a simple "always synced everywhere" assumption:

- Every time the page loads with fresh data, the browser writes one local snapshot of that day's
  module scores into the browser's own storage (not a server).
- Deltas are computed by comparing today's snapshot to the snapshot from N trading days ago, where "N
  trading days ago" really means "N times the app was previously opened and recorded a snapshot" — a
  practical approximation, not a literal calendar lookup.
- Because this history lives in the browser, **it currently resets if you switch devices or clear your
  browser data**, and deltas read as blank/null until ~3–5 days of history have accumulated on that
  device. This is expected behavior, not a bug.
- Separately, a server-side scheduled process writes a daily snapshot of these same scores to a central
  database every weekday afternoon (after market close) — this exists as infrastructure for a future
  cross-device version of these deltas, but as of this writing the on-screen deltas you see are still
  computed from the local, per-browser history described above, not from that central database.

Keep this nuance light in the actual guide — one or two sentences in a "How fresh is this data" section
is enough; don't dwell on the internal architecture.

---

## 3. Writing instructions

Structure the output guide as a single Markdown document with this outline:

1. **Title + one-paragraph intro** — what the Macro tab is, in plain terms, and why a trader (not an
   economist) would want it: "is now a good time to be aggressive or defensive, and what's actually
   driving that."
2. **Table of contents** linking to every section below.
3. **One section per module, in the same order they appear on the page** (Market Regime → Module
   Scores → Event Risk → Trend/Market Structure → Volatility/Stress → Credit/Liquidity → Rates+Dollar
   → GEX/Positioning → Risk Appetite → Market Recap → Sector Rotation). For each: what question it
   answers, every metric/indicator shown defined in plain language, the scoring mechanics where they
   exist (reproduce the tables above), why it matters, and the data source + refresh cadence. Note that
   Volatility/Stress, Credit/Liquidity, and Rates+Dollar now render together in one compact "Market
   Internals" section (one row per sleeve) — keep explaining the three concepts individually, but say
   they live together under Market Internals when you describe the layout.
4. **A dedicated "How the Regime Score is calculated" section** — pull together the sleeve-weight table
   and the regime-band table from Module 1 into one clear explainer, since this is the single most
   important mechanic on the page and readers will want to refer back to it.
5. **Two worked "gotcha" examples**, each as a short callout box: (a) the **bear-market rally** —
   why a bounce below the 200-day moving average still scores as caution, not bullish; (b) the
   **flight-to-safety** yield drop — why falling 10-year yields during rising stress is scored as
   defensive, not as a growth tailwind. These are the dashboard's two most important "don't be fooled
   by the obvious read" lessons — make them memorable.
6. **A closing glossary** of every acronym/term used (VIX, IV Premium, credit spread / HY OAS, GEX,
   US10Y, FRED, MA/moving average, RS/relative strength, SPDR, basis point if used, ISO week, etc.) in
   one alphabetized list. Do **not** include VVIX or UUP — both have been removed from the dashboard.
7. **A "Data freshness cheat-sheet" table**: one row per module, columns = Module · Primary Source ·
   Refresh Cadence. Pull these directly from each module's "Source/cadence" line above.

**Style rules:**
- Define every acronym in plain words the first time it appears in body text, even though the glossary
  also exists — readers skim, they won't always click through to the glossary first.
- Keep sentences short. Prefer two short sentences to one long compound one.
- Never give trading advice. Describe what a reading means about the environment; never say what the
  reader should do with their own money.
- Use the exact verbatim in-app blurbs (quoted above) as anchors for each module's opening paragraph —
  expand on them, never contradict them.
- Explicitly state, in the Sector Rotation section, that the Leaders/Setting Up tickers are that
  sector's own universe and are *not* STW's held positions.
- Do not invent specific historical examples, dates, or numbers beyond what's given above.

---

## 4. Output format

Produce **one single, self-contained Markdown document** — table of contents, all sections, glossary,
and cheat-sheet table included — ready to publish as a subscriber-facing help article as-is. Output
**only** the Markdown document. Do not add any commentary, preamble, or sign-off outside of it.
