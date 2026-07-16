# Understanding the Macro Tab

The Macro tab is a single dashboard built to answer one question: *is now a good time to be
aggressive or defensive, and what's actually driving that?* It pulls together trend, volatility,
credit, rates, the dollar, options positioning, sentiment, scheduled economic events, and sector
rotation into one page — so instead of checking eight different sites, you get one read on the
overall market environment and the specific pieces feeding it. (The three market-internals
sleeves — volatility, credit, and rates/dollar — now share one compact "Market Internals" section
rather than three separate cards, but each still answers its own question.)

This guide explains every module in the order it appears on the page: what question it answers,
every metric and indicator it shows, how the scoring works where it's a calculated score, why it
matters, and where the data comes from and how often it updates.

## Table of Contents

1. [Market Regime (banner)](#1-market-regime-banner)
2. [Module Scores (score strip)](#2-module-scores-score-strip)
3. [Event Risk](#3-event-risk)
4. [Trend / Market Structure](#4-trend--market-structure)
5. [Volatility / Stress](#5-volatility--stress)
6. [Credit / Liquidity](#6-credit--liquidity)
7. [Rates + Dollar Headwinds](#7-rates--dollar-headwinds)
8. [GEX / Positioning](#8-gex--positioning)
9. [Risk Appetite (gauge)](#9-risk-appetite-gauge)
10. [Market Recap](#10-market-recap)
11. [Sector Rotation](#11-sector-rotation)
12. [How the Regime Score Is Calculated](#how-the-regime-score-is-calculated)
13. [Two Gotchas the Dashboard Is Built to Catch](#two-gotchas-the-dashboard-is-built-to-catch)
14. [Glossary](#glossary)
15. [Data Freshness Cheat-Sheet](#data-freshness-cheat-sheet)

---

## 1. Market Regime (banner)

**Question it answers:** How aggressive should I be right now, overall?

This is the headline of the whole page: a single 0–100 **Environment Score** that blends five
underlying "sleeves" — Trend, Volatility, Credit, Rates+Dollar, and GEX/positioning — into one
number, and then maps that number to a plain-English **regime band**. The default sleeve weights
(Trend 30% / Volatility 20% / Credit 15% / Rates+Dollar 15% / GEX 20%) are now **admin-configurable**
— the STW editor can retune them, though the defaults are what's shown throughout this guide:

| Score range | Band | Trading mode |
|---|---|---|
| 75–100 | Risk-On | Normal sizing, breakouts acceptable, less need for hedges |
| 60–74 | Constructive / Selective | Favor strongest setups only |
| 45–59 | Cautious / Neutral | Reduce chase, wait for reclaim levels, tighter stops |
| 30–44 | Defensive | Smaller size, hedges allowed, avoid weak charts |
| 0–29 | Risk-Off | Capital preservation, mostly cash/hedges, only tactical trades |

If one sleeve's data isn't available at a given moment, its weight is spread proportionally
across the sleeves that do have data — the score never goes blank just because one input
dropped out.

The banner also shows a short **5-day direction descriptor** (Improving, Deteriorating,
Reversing Up, Reversing Down, or Mixed). See the "How fresh is this data" note near the end of
this guide for exactly what that's based on.

**Why it matters:** this is the single number to check first. Everything else on the page exists
to explain *why* this number is what it is.

**Source/cadence:** calculated directly from modules 4–8 below — it has no data fetch of its own.

[↑ Back to top](#table-of-contents)

---

## 2. Module Scores (score strip)

**Question it answers:** Of the five sleeves feeding the regime score, which ones are actually
driving today's read?

A row of five cards — Trend, Volatility, Credit, Rates/USD, GEX — each showing its own 0–100
score, a status word, and a short-term delta. Four of the five show a 5-day delta; GEX shows a
3-day delta instead, because options-dealer positioning can flip faster than the other sleeves.
Deltas show as blank until enough days of history have built up.

**Why it matters:** the regime score on its own can hide which sleeve is doing the work. If the
score is high, is it because trend is strong, or because volatility is just unusually calm? This
strip breaks that apart at a glance.

**Source/cadence:** same as Module 1 — derived from modules 4–8, no separate fetch.

[↑ Back to top](#table-of-contents)

---

## 3. Event Risk

**Question it answers:** Could a scheduled economic release in the next day or two change the
setup?

This module is a **temporary overlay** — it doesn't permanently change the regime score, it
flags when the score's current read might be about to get tested by a known event. It checks a
calendar of macro releases (CPI inflation data, Federal Reserve rate decisions, jobs reports,
and similar) and classifies the current moment into one of four states:

| State | Trigger |
|---|---|
| No major event risk | Nothing important due within 48 hours |
| Event Watch | A Very-High or High-importance event is 24–48 hours out |
| High Event Risk | A Very-High or High-importance event is within 24 hours |
| Reaction Overlay | A tracked event was released within roughly the last 1–3 trading days, and the market is still digesting it |

Events themselves are sorted into four importance tiers by name: **Very High** (CPI, PCE, Fed
rate decisions, Fed Chair speeches, the monthly jobs report, the unemployment rate), **High**
(PPI — producer prices, average hourly earnings), **Medium** (weekly jobless claims, retail
sales, ISM manufacturing/services surveys, Treasury bond auctions), and everything else **Low**.

**A note on what actually works here:** the upcoming-event states — Event Watch and High Event
Risk — tell you a known release is coming in the next day or two, so a strong technical setup
could be about to get tested. Once a release lands, the Reaction Overlay shows its **actual print**
and the **previous** figure (e.g. CPI 3.1% YoY, prior 3.3%). What's *not* available is the
**consensus estimate** (no free data feed carries it), so the module can't compute a "beat vs miss
/ surprise" — it shows you the number that printed, not how it compared to expectations.

**Why it matters:** a strong technical setup can get knocked over by a surprise inflation print
or jobs number. This module gives you a heads-up window rather than a surprise.

**Source/cadence:** scheduled events come from **FRED's economic-release calendar** (the Federal
Reserve's free, authoritative data service — CPI, PCE, Employment/NFP, GDP, and PPI releases)
plus a built-in static list of FOMC rate-decision dates. If the data source becomes unavailable,
the card says so plainly rather than showing a fabricated event.

[↑ Back to top](#table-of-contents)

---

## 4. Trend / Market Structure

**Question it answers:** Are risk assets technically intact right now? This is the
heaviest-weighted sleeve in the regime score, at 30%.

By default this shows two indices: **SPY** (tracks the S&P 500, the 500 largest U.S. companies)
and **QQQ** (tracks the Nasdaq 100, tech-heavy). Clicking either ticker reveals three more —
**IWM** (Russell 2000, small-cap stocks), **RSP** (an equal-weight version of the S&P 500), and
**VEA** (developed international markets outside the U.S.). No special access is needed; it's a
plain toggle available to everyone.

Each symbol is sorted into one of five structure "buckets" by comparing its current price to its
9-day, 21-day, and 200-day **moving averages** (the average closing price over that many trading
days — a standard way to read short-, medium-, and long-term trend):

| Bucket | Condition | Score |
|---|---|---|
| Momentum | Above the 9-, 21-, and 200-day average | 90 |
| Healthy Pullback | Above the 21- and 200-day average, dipped just below the 9-day | 70 |
| Mid-Term Caution | Above the 200-day average, but below both the 9- and 21-day | 50 |
| Recovery Attempt (bear-market rally) | Below the 200-day average, but bouncing above the 9- and 21-day | 35 |
| Risk-Off Trend | Below the 9-, 21-, and 200-day average | 10 |

The Trend sleeve's overall score is just the average of whichever symbols you currently have
visible.

**Why it matters:** this is the foundation sleeve. The "Recovery Attempt" bucket is the
dashboard's most important nuance here — see the gotcha section below for why a bounce in this
bucket is treated as caution, not a buy signal.

**Source/cadence:** live prices from Finnhub, refreshed at most every 15 minutes; the daily
closing prices used to calculate the moving averages come from TwelveData, refreshed once per
day.

[↑ Back to top](#table-of-contents)

---

## Market Internals (Modules 5–7)

The next three sleeves — **Volatility / Stress**, **Credit / Liquidity**, and **Rates + Dollar
Headwinds** — now live together in one compact **Market Internals** section, shown as one row per
sleeve (each with its score, status word, and key values) rather than as three separate cards.
Each still answers its own distinct question, explained below.

All three now read their index-level inputs from **FRED** — Federal Reserve Economic Data, the
Fed's free, authoritative public data service. This replaced the older ETF-proxy and third-party
approach: the VIX, the 10-year Treasury yield, the credit spread, and the dollar index are now the
real published series, not stand-ins.

---

## 5. Volatility / Stress

**Question it answers:** Is fear rising in the options market?

Two indicators, each scored 0–100 where a **higher number means calmer markets**:

- **VIX** — the CBOE Volatility Index, the market's measure of how much the S&P 500 is expected
  to move over the next 30 days. The classic "fear gauge." Scored: below 15 → 90 (calm), 15–20 →
  55 (normal), 20–25 → 30 (elevated), 25 and above → 10 (severe).
- **IV Premium** — the VIX divided by SPY's own actual ("realized") 30-day volatility. A ratio
  above 1 means options are pricing in more future movement than has actually been happening
  lately — hedges are relatively expensive. Scored: below 0.90 → 85 (calm), 0.90–1.25 → 55
  (normal), above 1.25 → 20 (fear).

A third input — VIX's own 5-day direction — also feeds the sleeve average without getting its
own card: VIX falling at least 1 point over 5 trading days scores 80 (calming), roughly flat
scores 50, and rising at least 2 points scores 20 (fear building).

The sleeve's overall score averages whichever of these three are available, and is labeled Calm
(70+), Normal (45+), Elevated (25+), or Stress (below 25). The card also shows VIX's roughly
1-year **percentile rank**, so a VIX reading of 19 can be read in context — calm relative to the
past year, rather than just a number on its own.

**Why it matters:** options-market fear often moves before price does. This sleeve is 20% of the
regime score.

**Source/cadence:** the VIX comes from FRED (series `VIXCLS`), the authoritative published daily
close; the historical daily VIX series used for the percentile and 5-day trend comes from FRED as
well. Realized volatility for the IV Premium is computed from SPY daily closes (TwelveData).

[↑ Back to top](#table-of-contents)

---

## 6. Credit / Liquidity

**Question it answers:** Is the credit/bond market confirming the move in stocks? Credit stress
tends to show up *before* a stock-market selloff, so this acts as an early warning sleeve.

This module now uses the **real ICE BofA US High Yield Option-Adjusted Spread (OAS)** — the extra
yield investors demand to hold risky high-yield ("junk") corporate bonds over safe Treasuries.
This replaced the old HYG-ETF proxy with the actual credit-spread series. **Read the direction
carefully: the spread *widens* when credit stress rises** — a higher, rising spread is *worse*,
the opposite sign to a bond ETF's price. The score combines two simple facts — is the spread below
its 50-day average, and is it tightening (narrowing) today — into a four-way score:

| Spread vs. 50-day average | Today's move | Score | Label |
|---|---|---|---|
| Below (tighter) | Tightening | 80 | Confirming |
| Below (tighter) | Widening | 60 | Mild Caution |
| Above (wider) | Tightening | 45 | Mixed |
| Above (wider) | Widening | 20 | Warning |

In short: a spread that's below its 50-day average and still tightening means credit is confirming
the move in stocks; a spread that's above its average and widening is a stress warning.

**Why it matters:** this sleeve is 15% of the regime score, and is meant as an early warning —
credit often cracks before equities notice.

**Source/cadence:** FRED daily data for the ICE BofA US High Yield OAS (series `BAMLH0A0HYM2`).

[↑ Back to top](#table-of-contents)

---

## 7. Rates + Dollar Headwinds

**Question it answers:** Are rising interest rates or a strengthening U.S. dollar creating
headwinds for growth and speculative stocks?

Two inputs feed this sleeve:

- **US10Y** — the yield on the 10-year U.S. Treasury bond. Below 4.30% scores as a tailwind (80
  if falling, 65 if not); 4.30–4.50% scores neutral/watch (55); above 4.50% scores as a headwind
  (35, or 20 if actively rising). There's an important nuance here — see the gotcha section below
  for the "flight to safety" case, where a fast yield drop during rising stress is scored as
  defensive (30), not as a bullish tailwind.
- **The broad dollar index** — the trade-weighted value of the U.S. dollar. A falling dollar
  scores as a tailwind (80 — a weak dollar tends to help multinational earnings and commodities);
  a rising dollar scores as a headwind (20); a flat/mixed read scores neutral (50).

The sleeve score averages the two, labeled Tailwind (60+), Neutral (40+), or Headwind (below 40).

**Why it matters:** rates and the dollar are 15% of the regime score, and both can quietly choke
off growth-stock rallies even when the broader trend looks fine.

**Source/cadence:** FRED daily data — the 10-year Treasury yield (series `DGS10`) and the broad
trade-weighted dollar index (series `DTWEXBGS`).

[↑ Back to top](#table-of-contents)

---

## 8. GEX / Positioning

**Question it answers:** What is options-dealer positioning suggesting about near-term price
magnets and pivot levels? This module is explicitly a **tactical overlay** — useful for timing
entries and spotting pivots, but it doesn't define the whole macro picture by itself.

"GEX" stands for gamma exposure — a measure of how options dealers are positioned that can act
as a magnet or a headwind around certain price levels. The card reads live SPY gamma and shows:
**Spot**, the **gamma flip** (the pivot where positioning turns from stabilizing to amplifying),
the **call wall** (the strike with the most call gamma — an upside magnet / resistance), the
**put wall** (the most put gamma — downside support), and **net GEX**. From spot vs the flip it
gives a one-line positioning read:

| Reading | What it implies |
|---|---|
| Positive γ (spot above the flip) | Dealers dampen moves — dips into support tend to hold; expect a grind, not a chase |
| At flip | Right at the pivot — a decisive break either side sets the tone; wait for confirmation |
| Negative γ (spot below the flip) | Dealers amplify moves — breaks accelerate; keep size down until spot reclaims the flip |

A short delta shows how the positioning score has changed over the last 3 days — shorter than the
5-day window used elsewhere, because dealer positioning can shift quickly.

**Why it matters:** this sleeve is 20% of the regime score, and the levels it surfaces are useful
reference points regardless of your overall view.

**Source/cadence:** the **FlashAlpha** GEX API (SPY as the index proxy), refreshed twice each
weekday by a scheduled job and read from the app's database; the card displays exactly when it was
last updated. (Before 2026-07-10 this used STW's Graddox signal.)

[↑ Back to top](#table-of-contents)

---

## 9. Risk Appetite (gauge)

**Question it answers:** How much fear vs. greed is priced into the market right now? This is a
deliberately different question from the Market Regime in Module 1 — the regime describes what
the environment objectively *is*; this gauge describes how emotional the tape currently *feels*.

A semicircular gauge from 0 (Extreme Fear) to 100 (Extreme Greed), split into five zones:

| Zone | Range |
|---|---|
| Extreme Fear | Below 25 |
| Fear | 25–44 |
| Neutral | 45–54 |
| Greed | 55–74 |
| Extreme Greed | 75 and above |

It's built from six weighted inputs:

| Input | What it measures |
|---|---|
| Market Momentum | SPY's price vs. its 125-day moving average |
| Volatility (VIX) | Same VIX scoring as Module 5 |
| IV Premium | Same VIX-vs-realized-volatility scoring as Module 5 |
| GEX Bias | Same GEX positioning score as Module 8 (FlashAlpha) |
| Credit | The high-yield credit spread vs. its 50-day average (as in Module 6) |
| Breadth | The equal-weight S&P 500 (RSP) vs. the cap-weighted S&P 500 (SPY) — is the *average* stock confirming the rally, or is it narrow? |

These same weights are shared between this live gauge and the background process that writes
the daily history snapshot, so the two can never drift out of sync. As with the other composite
scores, if an input is missing, its weight is spread across whichever inputs are available.

**Why it matters:** the regime score and this gauge can disagree, and that disagreement is
informative — a "Constructive" regime read paired with "Extreme Greed" sentiment is a different
situation than the same regime read paired with "Fear."

**Source/cadence:** FRED for the VIX and the high-yield credit spread, plus TwelveData daily
closes for SPY/RSP (momentum and breadth), plus the FlashAlpha GEX read. Daily metrics
refresh once per browser session.

[↑ Back to top](#table-of-contents)

---

## 10. Market Recap

**Question it answers:** What does all of the above add up to, in plain English, for the week?

An AI-written weekly note with several parts: a headline, a verdict, "The Big Story," a
bull/base/bear scenario breakdown for the week ahead, a "Next Week" playbook, a "levels to watch"
callout, a trading-mode tag, and a closing "final word" line. It generates automatically — no
subscriber action is needed — and refreshes once per calendar week.

**Important to know:** the note is built to use *only* the actual module scores, deltas, and
positioning data it's given. It's explicitly designed to never invent a specific figure — a
dollar-flow number, a streak count, a named fund — that wasn't part of its real inputs.

**Admin-only control:** every other control on the Macro tab is visible to all subscribers. This
module is the one exception — only the STW editor sees a "Regenerate" button and an optional
note to steer the next rewrite. Subscribers only ever read the resulting note.

**Why it matters:** this is the one module that turns ten separate readings into a single
narrative — useful as a weekly summary even if you don't want to dig into every sleeve yourself.

**Source/cadence:** generated by a server-side process using Anthropic's Claude (the Sonnet
model, with an automatic fallback to the smaller Haiku model if needed), grounded only in the
other ten modules' current scores. The result is stored centrally, so every subscriber sees the
identical note regardless of device.

[↑ Back to top](#table-of-contents)

---

## 11. Sector Rotation

**Question it answers:** Where is money rotating across the market's 11 major sectors right now,
and which individual names look most interesting within each?

This module shows all 11 SPDR sector ETFs — Technology, Health Care, Financials, Energy,
Industrials, Consumer Discretionary, Consumer Staples, Utilities, Real Estate, Materials, and
Communication Services — ranked from #1 (leading) to #11 (lagging). The ranking combines the
same trend-bucket structure used in Module 4 with 1-month **relative strength** versus SPY.
Relative strength (RS) is simply that sector's return minus SPY's return over the same window, in
percentage points — a sector with +3pp of RS over one month beat the S&P by 3 percentage points,
regardless of whether the overall market was up or down that month.

Each sector card includes a radar chart plotting its relative strength versus SPY across five
time windows: Week (5 trading days), 1 Month (21 trading days), 3 Month (63 trading days),
6 Month (126 trading days), and 1 Year (252 trading days).

Below each radar, two rows of stock chips surface ideas from a curated list of roughly 6
well-known holdings within that sector:

- **Leaders** — stocks whose own trend structure is confirmed bullish (the "Momentum" or "Healthy
  Pullback" bucket from Module 4), ranked by 1-month relative strength, top 5 shown.
- **Setting Up** — stocks still in a caution or recovery bucket ("Mid-Term Caution" or "Recovery
  Attempt") but whose 1-month relative strength has turned positive — earlier, not-yet-confirmed
  names, top 5 shown.

**Important — read this carefully:** the Leaders and Setting Up tickers shown here are each
sector's own universe of well-known names. **They are not STW's existing held positions.** The
intent is to surface ideas beyond what STW already holds, as a complement to STW's picks, not a
restatement of them. Don't assume a ticker shown in this module is something STW currently owns.

**Why it matters:** rotation between sectors often tells you where strength is building or fading
well before it shows up in a single index number.

**Source/cadence:** TwelveData daily closing prices for both the 11 sector ETFs and their
constituent stocks, fetched in small batches to respect data-provider rate limits.

[↑ Back to top](#table-of-contents)

---

## How the Regime Score Is Calculated

The Market Regime banner (Module 1) is the single most important number on the page, so it's
worth seeing the full mechanic in one place.

**Step 1 — five sleeve scores, each 0–100:**

| Sleeve | Weight | Comes from |
|---|---|---|
| Trend | 30% | Module 4 |
| Volatility | 20% | Module 5 |
| Credit | 15% | Module 6 |
| Rates + Dollar | 15% | Module 7 |
| GEX (positioning) | 20% | Module 8 |

**Step 2 — weighted blend.** Each sleeve score is multiplied by its weight and added together to
produce one 0–100 Environment Score. If a sleeve's data is temporarily missing, its weight is
redistributed proportionally across whichever sleeves do have data, so a single missing input
never blanks out the whole score.

**Step 3 — map the score to a band:**

| Score range | Band | Trading mode |
|---|---|---|
| 75–100 | Risk-On | Normal sizing, breakouts acceptable, less need for hedges |
| 60–74 | Constructive / Selective | Favor strongest setups only |
| 45–59 | Cautious / Neutral | Reduce chase, wait for reclaim levels, tighter stops |
| 30–44 | Defensive | Smaller size, hedges allowed, avoid weak charts |
| 0–29 | Risk-Off | Capital preservation, mostly cash/hedges, only tactical trades |

Trend carries the heaviest weight (30%) because long-term price structure is the foundation the
other sleeves sit on top of; GEX and Volatility are next (20% each) because options positioning
and fear levels can shift the picture relatively quickly; Credit and Rates+Dollar (15% each)
round out the score as confirming or contradicting signals from the bond and currency markets.

[↑ Back to top](#table-of-contents)

---

## Two Gotchas the Dashboard Is Built to Catch

### Gotcha #1: The bear-market rally

It's tempting to read "price is going up" as bullish, full stop. The Trend/Market Structure
module (Module 4) is built specifically to catch the case where that's misleading.

If a stock or index is **below its 200-day moving average** (its long-term trend is broken) but
has **bounced above its 9-day and 21-day moving averages** (a short-term pop), the dashboard
classifies that as "Recovery Attempt" — and scores it only **35 out of 100**. Compare that to
"Healthy Pullback" (a stock still *above* its 200-day average that's just dipped below its
9-day), which scores **70**. Same direction of recent price movement, very different score —
because the long-term trend is what's broken in the first case, even while price is bouncing.

This is the dashboard's single biggest correction against a naive "price is going up = bullish"
read.

### Gotcha #2: Flight to safety

It's also tempting to read falling interest rates as automatically good for growth and
speculative stocks — lower rates usually make future earnings worth more today. The Rates +
Dollar module (Module 7) is built to catch the case where that's backwards.

If the 10-year Treasury yield drops quickly — at least 0.10 percentage points over 5 trading
days — **at the same time** that volatility or credit stress is rising, the dashboard treats
that as a **flight to safety**: money fleeing into bonds out of fear, not because inflation is
cooling. That combination is deliberately scored low (**30**), not as a bullish tailwind —
because falling yields driven by fear send a very different signal than falling yields driven by
easing inflation, even though the yield chart looks identical either way.

[↑ Back to top](#table-of-contents)

---

## Glossary

- **Basis point (bp):** one-hundredth of a percentage point (0.01%). Used when describing small
  moves in yields.
- **Credit spread (HY OAS):** the extra yield ("option-adjusted spread") investors demand to hold
  risky high-yield corporate bonds over safe Treasuries. It *widens* when credit stress rises, so
  a higher, rising spread is worse. This dashboard uses the ICE BofA US High Yield OAS.
- **FRED:** Federal Reserve Economic Data — the free, authoritative public data service run by
  the St. Louis Fed. This dashboard sources its VIX, 10-year Treasury yield, high-yield credit
  spread, dollar index, and economic-release calendar from FRED.
- **GEX (gamma exposure):** a measure of how options dealers are positioned, sourced here from the
  FlashAlpha GEX API (SPY proxy) to read the gamma flip, call/put walls, and net GEX, and give a
  positive-γ / at-flip / negative-γ positioning read.
- **ISO week:** a standardized way of numbering calendar weeks (Monday–Sunday) used to schedule
  when the weekly Market Recap refreshes.
- **IV Premium:** the VIX divided by an asset's own realized (actual) volatility — a measure of
  whether options are pricing in more future movement than has actually been happening.
- **Moving average (MA):** the average closing price of an asset over a set number of trading
  days (e.g. a 200-day moving average), used to read short-, medium-, or long-term trend.
- **RS (relative strength):** an asset's return minus a benchmark's return (usually SPY) over the
  same time window, expressed in percentage points.
- **SPDR:** a family of sector-tracking ETFs (e.g. one per S&P 500 sector); this dashboard uses
  all 11 SPDR sector funds in the Sector Rotation module.
- **SPY / QQQ / IWM / RSP / VEA:** ticker symbols for ETFs that track, respectively, the S&P 500,
  the Nasdaq 100, the Russell 2000 (small caps), the equal-weight S&P 500, and developed
  international markets.
- **US10Y:** the yield on the 10-year U.S. Treasury bond, a benchmark interest rate that
  influences borrowing costs and stock valuations broadly.
- **VIX:** the CBOE Volatility Index — the market's measure of expected S&P 500 volatility over
  the next 30 days; the classic "fear gauge."

[↑ Back to top](#table-of-contents)

---

## Data Freshness Cheat-Sheet

| Module | Primary Source | Refresh Cadence |
|---|---|---|
| Market Regime (banner) | Derived from Modules 4–8 | No separate fetch |
| Module Scores (strip) | Derived from Modules 4–8 | No separate fetch |
| Event Risk | FRED economic-release calendar + static FOMC date list | Checked on page load |
| Trend / Market Structure | Finnhub (live quotes) + TwelveData (daily closes for moving averages) | Live quotes ≤15 min; daily closes once/day |
| Volatility / Stress | FRED (VIX close + history) + TwelveData (SPY closes for realized vol) | Once/day |
| Credit / Liquidity | FRED (ICE BofA HY OAS daily) | Once/day |
| Rates + Dollar Headwinds | FRED (10-year yield + broad dollar index, daily) | Once/day |
| GEX / Positioning | FlashAlpha GEX API (SPY proxy) | Twice/weekday (~8:30am & 4:30pm ET) |
| Risk Appetite (gauge) | FRED (VIX + credit spread) + TwelveData (SPY/RSP daily closes) + FlashAlpha GEX | Daily once/session |
| Market Recap | Server-side AI process (Claude Sonnet, fallback Haiku), grounded in Modules 1–9 | Once/calendar week |
| Sector Rotation | TwelveData (sector ETFs + constituent stocks) | Once/day |

[↑ Back to top](#table-of-contents)
