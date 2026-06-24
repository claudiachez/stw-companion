# Stock Talk Weekly (Zach) — Channel Analysis Report
**Analyst**: Manual pre-coding review  
**Date**: June 21, 2026  
**Discord Handle**: Stock Talk Weekly [STW]  
**Discord User ID**: (STW role-tagged, not single user ID)  
**Alert Tag**: `@Stock Talk Weekly - Alerts`  
**Primary alert channel**: #live-notes-portfolio  
**Portfolio snapshot channel**: #updates-portfolio (Friday weekly image)  
**Search window**: March 23 – June 21, 2026 (~90 days)  
**Posts analyzed**: ~350–450 posts estimated (Discord archive files Mar–Jun 2026 reviewed)  
**Trading style**: High-conviction thematic swing trader; 6–18 month horizon; cost-basis discipline  
**Instruments**: Shares (long common stock) + Options (long calls, occasional puts as macro hedges)

---

## 1. Volume & Cadence

- **~350–450 posts across ~90 days** = ~4–5 posts/day average
- STW is very active — multiple messages per trading day; quiet on weekends
- Posts cluster 8 AM – 6 PM ET during market hours
- **Portfolio snapshot**: every Friday afternoon (3–4 PM ET) as an image in #updates-portfolio, also text-formatted in the same message
- **Live alerts**: intraday in #live-notes-portfolio — entries, exits, chart commentary, thesis updates
- Occasional intraday live streams referenced via #live-streams (recording uploaded to #stream-library-stw)

---

## 2. Content Types (5 types)

### Type 1: Portfolio Snapshots ("weekly portfolio update")
**~12–13 per 90 days** (every Friday)

The weekly portfolio is STW's primary reconciliation mechanism. Posted Friday afternoon in #updates-portfolio. **Format is image-based** — screenshotted portfolio view. However, the same structured text is also posted alongside the image in the channel and captured in the Discord archive files.

**Format evolved over the 90-day period** — two observed variants:

**March–May 2026 format:**
```
Stock Talk Weekly — [Day] [Date], [Time]
[EQ]:[OPT] - EQUITY:OPTIONS RATIO

[N] POSITIONS

LISTING FORMAT: % WEIGHTING - $TICKER (OPTIONS) - COMMON SHARES COST BASIS

Core positions will be marked with an asterisk *

[THEME NAME]

[weight]%: $[TICKER]* - $[cost_basis]
[weight]%: $[TICKER] - (Options only) - $[STRIKE]C [Mon] '[YY] @ $[price] (NEW)
[weight]%: $[TICKER] (Shares + $[STRIKE]C [Mon] '[YY] + $[STRIKE]C [Mon] '[YY]) - $[cost_basis]

Cash: [±X]%
```

**June 2026 format** (evolved — adds theme totals, explicit `@` notation):
```
Stock Talk Weekly — [Day] [Date], [Time]
[EQ]:[OPT] - EQUITY:OPTIONS RATIO

[N] POSITIONS

LISTING FORMAT: % WEIGHTING - $TICKER @ COMMON SHARES COST BASIS + OPTIONS @ COST BASIS

Core positions will be marked with an asterisk *

[THEME NAME] - [TOTAL THEME WEIGHT%]

[weight]%: $[TICKER]* @ $[cost_basis]
[weight]%: $[TICKER] @ $[cost_basis] + $[STRIKE]C [Mon] '[YY] @ $[option_price]
[weight]%: $[TICKER] (Options only) - $[STRIKE]C [Mon] [Day] '[YY] @ $[price]

Hedge: $[TICKER] $[STRIKE]P [Mon] [Day] '[YY] @ $[price] - [weight]%
Cash: [±X]% ([Y]% long)
```

**Header trigger phrase**: `Stock Talk Weekly —` (timestamp follows)  
**NEW position marker**: `(NEW)` appended to the line  
**Core position marker**: asterisk `*` after ticker

**Real example (May 1, 2026 snapshot excerpt)**:
```
87:13 - EQUITY:OPTIONS RATIO
24 POSITIONS

POWER GRID + BATTERIES
12.0%: $ENS* - $116.63
3.8%: $PLPC* - $192.16
...

DATACENTER + AI INFRASTRUCTURE
18.3%: VIAV* - $14.63
...
0.5% - $P $75C Aug '26 - $8.80 (NEW)

Cash: -15.0% (115% long)
```

---

### Type 2: Entry / Upsize Alerts
**~50–80 per 90 days**

All confirmed entries/upsizes are tagged `@Stock Talk Weekly - Alerts`. Multiple format variants:

**Format A — New position, shares only:**
```
I'm taking a [weight]% position in _all shares_ in $[TICKER] @[price]
```

**Format B — Tactical short-term trade (options only):**
```
TACTICAL TRADE: OPEN $[TICKER] $[STRIKE]C [Mon] [Day] $[price] avg. @ [weight]% weighting
```
Followed by: thesis, technical setup, short interest, fundamental context

**Format C — Options add to existing equity position:**
```
I added some $[STRIKE]C for [Month] @ $[price] avg. to raise the weighting on this position back above [X]%
```

**Format D — Upsize with new options tranche:**
```
Upsized $[TICKER] with $[STRIKE]C for [Month] @ $[price] avg. Doubles the weighting on this one to [weight]%
```
or
```
Upsized $[TICKER] to [weight]% weighting by adding $[STRIKE]C for [Month] at $[price] avg.
```

**Format E — Minor weight raise, same contracts:**
```
Raised weighting slightly on $[TICKER] from [X]% to a full [Y]% -- same calls as before
```

**Format F — Graduated from prospective to active:**
```
Will move out of the 'Prospective Positions' basket into active positions.
```

**Intent/pending** (NOT yet confirmed entry — do NOT parse as trade):
```
Depending on FOMC reaction tomorrow, I may upsize several positions. TBD.
The stocks that I _might_ add to/upsize that I _ALREADY OWN_: $SYNA $RDCM $OSS...
```

**Lotto trades** (separate channel — NOT tracked):
```
⁠🍀丨lotto-trades⁠ @Stock Talk Weekly - Alerts Just a flier on $P...
```
These are explicitly routed to #lotto-trades, not the main alert stream, and are NOT tracked positions.

---

### Type 3: Exit Alerts
**~10–20 per 90 days** (explicit; many more are implicit via Friday snapshot)

**Full exit (explicit):**
```
Fully closed $[TICKER] for more buying power
Fully closed [COMPANY] $[TICKER].
Full closed [COMPANY] $[TICKER].
```
STW often provides a lengthy reason with history: original entry price, total return, and why capital is being redeployed.

**Earnings-triggered sell:**
```
Fully closed the position. Will likely be a name I revisit in the future, though.
```
(After a disappointing earnings call — common exit trigger for STW)

**Implicit exit**: ticker disappears from Friday portfolio update. Very reliable — STW updates the portfolio weekly and the snapshot is the ground truth.

---

### Type 4: Performance / Chart Commentary
**~80–120 per 90 days** — NOT trade signals; informational

```
$VIAV +16% $AMSC +9.5% ... Wahoooo
$NBIS is now officially a 10-bagger for us from our purchase at $23.92
$AMKR is up more than 3x from our entry
```

Also includes chart structure commentary on existing positions:
```
$OSS moving averages stacked on the daily...
$MITK daily has been messy/annoying but there is quite a bit of strength on the weekly...
```
Always on EXISTING positions — he explicitly notes this.

---

### Type 5: Thesis / Market Commentary
**~150–200 per 90 days** — the largest category

Includes:
- Multi-paragraph thesis updates on existing positions (e.g., 6-message ADEA hybrid bonding deep-dive)
- Earnings reactions and guidance commentary
- Technical chart updates on owned positions
- Sector rotation commentary (power, AI infra, robotics)
- Risk management philosophy posts
- Community management/instructions

**All of this is IGNORE for trade parsing.** Exception: when a thesis post ends with a trade action statement (tagged `@Stock Talk Weekly - Alerts`), the final sentence is the trade signal.

---

## 3. Options Notation

**Calls** (most common):
```
$[STRIKE]C [Month] '[YY] @ $[option_price]
```
Example: `$7.5C July '26 @ $0.65`

**Multiple tranches (same position):**
```
$[STRIKE]C [Mon] '[YY] + $[STRIKE]C [Mon] '[YY] + small $[STRIKE]C [Mon] '[YY] @ $[price]
```
Example: `$8C July '26 @ $1.17 and $7C for Jan '27 @ $2.63 and small $8C May '26 @ $0.93`

**Calls with specific expiry date (MM/DD):**
```
$[STRIKE]C [Mon] [DD] '[YY] @ $[price]
```
Example: `$22.5C July 17 @ $3.35` (July 17th expiry)

**Puts (hedges only — rare):**
```
$[TICKER] $[STRIKE]P [Mon] [DD] '[YY] @ $[price] - [weight]%
```
Example: `$ARKK $70P Jun 18 '26 @ $0.83 - 0.7%`

**Options-only positions** explicitly labeled:
```
(Options only) - $[STRIKE]C [Mon] '[YY] @ $[price]
```

**Shares + options positions** labeled:
```
(Shares + $[STRIKE]C [Mon] '[YY] + $[STRIKE]C [Mon] '[YY])
```
or in the June format:
```
@ $[shares_cost] + $[STRIKE]C [Mon] '[YY] @ $[option_price]
```

---

## 4. Position Terminology

| Term | Meaning | Track? |
|------|---------|--------|
| Core position (`*`) | Highest conviction, hold long | YES |
| Satellite / non-asterisk | Standard tracked position | YES |
| Tactical trade | Short-term options play | YES (same tracking) |
| Prospective Positions basket | Watchlist / not yet active | NO |
| Lotto trades (#lotto-trades) | Speculative fliers, separate channel | NO |
| Swing trades (#swing-trades) | Shorter-term plays, separate channel | Verify channel routing |
| Free runner | Position held with zero cost basis (proceeds booked) | Track remaining leg only |
| Legacy positions | Long-held positions, lowest activity | YES (still listed in portfolio) |

---

## 5. What to Parse vs. Ignore

**PARSE as new position:**
- Any message tagged `@Stock Talk Weekly - Alerts` AND contains: "taking a X% position", "OPEN", "TACTICAL TRADE: OPEN", "added some", "Upsized", "Raised weighting"
- `(NEW)` in the Friday portfolio snapshot = new position added during the week

**PARSE as exit:**
- "Fully closed", "Full closed" tagged `@Stock Talk Weekly - Alerts`
- Friday snapshot diff: ticker in snapshot N, absent in snapshot N+1 = implicit exit

**PARSE as upsize (not new position):**
- "Upsized $[TICKER]" — increases weight on existing position
- "Raised weighting" — minor upsize, possibly same contracts

**PARSE as snapshot:**
- Message contains header `Stock Talk Weekly —` + timestamp + EQUITY:OPTIONS RATIO + position list

**IGNORE entirely:**
- Messages without `@Stock Talk Weekly - Alerts` (chart commentary, performance updates, community posts)
- Any message routed to #lotto-trades
- Intent posts: "I may upsize", "I might add", "watching for entry"
- Thesis/DD posts (even multi-paragraph ones) unless they conclude with a trade action
- Earnings reactions unless they conclude with "Fully closed" or "adding"

---

## 6. Architecture Notes (Comparison vs. WSE)

| Dimension | Stock Talk Weekly (Zach) | Wall St Engine (WSE) |
|-----------|--------------------------|---------------------|
| Portfolio snapshots | IMAGE + text (Friday weekly) | TEXT only (weekly, ~Fri) |
| Vision required? | YES (for image parsing) | NO |
| Snapshot cadence | Every Friday (reliable) | Approximately weekly (variable) |
| Entry signal clarity | Structured (3–4 main formats) | High variance (8+ formats) |
| Exit signal clarity | Mostly explicit ("Fully closed") | Mostly implicit (snapshot diff) |
| Options format | `$[STRIKE]C [Mon] '[YY] @ $[price]` | `$[STRIKE][C/P], MM/DD @ $[price]` |
| Position labels | `*` = core; no asterisk = satellite | Weight ranking only |
| Portfolio organized by | Theme/sector (labeled sections) | Weight ranking (descending) |
| Tracking scope | All alerted positions | "Alerted" subset only |
| Lotto channel | Separate #lotto-trades (ignore) | Mentioned inline (ignore) |
| Leverage | Yes (can be 110–120% long) | No leverage noted |
| Hedges | Explicit (ARKK puts, SPY puts) | SPY puts mentioned conversationally |
| Thesis depth | Extensive (multi-paragraph, multi-message) | Extensive (similar depth) |
| Post volume | ~4–5/day | ~4.2/day |

**STW-specific parser requirements for `trader_profiles.parsing_instructions`**:
1. Detect portfolio snapshot by header `Stock Talk Weekly —` + EQUITY:OPTIONS RATIO line
2. Parse equity line: `[weight]%: $[TICKER][*] @ $[cost_basis]` or `[weight]%: $[TICKER][*] - $[cost_basis]`
3. Parse options line: `$[STRIKE][C/P] [Mon] [DD]? '[YY] @ $[price]` — note optional day in expiry
4. Parse multi-tranche options: split on ` + ` or ` and `
5. `(Options only)` = no equity component in this position
6. `(NEW)` = position opened during the week
7. `*` = core position flag (store in trader_profiles field)
8. EQUITY:OPTIONS RATIO at top of snapshot = portfolio-level stat (store, don't parse per-position)
9. Hedge lines are separate from position list — parse as bearish option positions
10. Lotto trades in #lotto-trades — filter by channel, never parse
11. Prospective/watchlist positions mentioned in text — do NOT create position records
12. Implicit exit: Friday snapshot diff; if ticker absent from snapshot, close the position

---

## 7. Raw Vocabulary Index

**Entry triggers** (any of these + `@Stock Talk Weekly - Alerts` = entry):
- `I'm taking a` (new shares position)
- `TACTICAL TRADE: OPEN`
- `OPEN $`
- `I added some`
- `Upsized $`
- `Raised weighting`
- `adding $` (options add to existing)
- `Will move out of the 'Prospective Positions' basket`

**Exit triggers:**
- `Fully closed`
- `Full closed`
- Implicit: Friday snapshot diff (ticker absent)

**Snapshot header triggers:**
- `Stock Talk Weekly —` (with date/time following)
- `EQUITY:OPTIONS RATIO`
- `LISTING FORMAT:`

**Upsize triggers** (weight change, not new position):
- `Upsized $[TICKER] to [weight]% weighting`
- `Doubles the weighting`
- `Raised weighting`
- `raise the weighting`

**Ignore triggers:**
- `⁠🍀丨lotto-trades⁠` (lotto channel route)
- `⁠📅丨swing-trades⁠` (swing channel route — verify if tracked separately)
- `Prospective Positions`
- `I may upsize` / `I might add`
- `will post DD` (thesis to follow, not yet a trade)

**Performance update triggers** (ignore for trading):**
- `10-bagger`
- `up more than [X]x from our entry`
- `+[X]% on the day`
- day/weekly chart commentary without entry/exit language

---

*Analysis based on Discord archive files (Discord STW Updates 202603–202606.md) and Portfolio Updates.md covering March – June 2026. Post count is an estimate; exact count requires a full message index. Portfolio snapshots reviewed: May 1, May 8, June 18 (plus intermediate weeks). Vocabulary confirmed across 3+ months of live trading.*
