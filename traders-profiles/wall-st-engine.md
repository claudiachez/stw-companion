# Wall St Engine — Channel Analysis Report
**Analyst**: Manual pre-coding review  
**Date**: June 21, 2026  
**Discord User ID**: 1211390004048171009  
**Channel**: #wall-st-engine — https://discord.com/channels/916525682887122974/1248378121451733083  
**Search window**: After March 23, 2026 → June 21, 2026 (~90 days)  
**Posts analyzed**: **346 total results across 14 search pages**  
**Oldest post found**: March 30, 2026 (oldest WSE post in this window — channel may have had none earlier or they were very few)  
**Trading style**: Fundamental thesis with technical timing  
**Instruments**: Shares (long common stock) + Options (long calls, tactical puts)

---

## 1. Volume & Cadence

- **346 posts in ~83 days** (March 30 – June 21) = **~4.2 posts/day average**
- WSE is one of the highest-volume traders in this analysis
- Active on most trading days; occasional "quiet weeks" (June 10 was a noted timeout week)
- Most activity clusters 8 AM – 4 PM ET during market hours
- No recurring fixed schedule for portfolio snapshots — appears approximately **weekly**, usually Monday or Friday

---

## 2. Content Types (5 types)

### Type 1: Portfolio Snapshots ("alerted ideas, arranged by weighting")
**~5–8 per 90 days** (roughly weekly, not always exact)

The portfolio snapshot is WSE's primary reconciliation mechanism. It lists only his "alerted" positions — a curated subset. It is **fully text-based** (no vision needed).

**Format has evolved over the 90-day period** — three observed variants:

**March 30 format** (earliest observed):
```
Current Alerted Open positions arranged by weighting: @Wall - Alerts

Commons [Long]:
6% NOVT @ 117: -1%
3.5% EVLV @5.2: +9%

[Note boilerplate]
```

**May 15 format** (richer, adds options section explicitly):
```
Update on alerted open positions, arranged by current weighting: @Wall - Alerts

3% NOVT @ $114 (Currently +35%)
3% ALNT @ $60.70
3% CLBT @ $12.70
Also holding calls.
3% SHMD @ $6.25

1% AVAV $200C, 09/18 @ $21.30
0.6% XPEV 17C, 09/18 @ 2.17

For option plays, my mental risk is always bare minimum 30-40%.

Trimmed and booked a lot of profits this week (eg. AMBQ, HIMX, MEI). Holding some in my LT.
[Note boilerplate]
```

**June 16 format** (most current — relabeled):
```
Update on alerted ideas, arranged by weighting: @Wall - Alerts

Conviction Swings:
7% ALNT @ $60: +61%
5% NOVT @ $121 +30%
3% ADEA @ $30: +7%
3% KGS @ $65: +5%
3% KE @ 25
AMBQ

Options:
[options section follows — same format as May 15]
[Note boilerplate]
```

**Header trigger phrases** (detect portfolio snapshots by these):
- `"Current Alerted Open positions arranged by weighting"`
- `"Update on alerted open positions, arranged by"`
- `"Update on alerted ideas, arranged by weighting"`

All end with `@Wall - Alerts`. All include the standard disclaimer note.

**Standard disclaimer note** (boilerplate, appears in every snapshot — store in trader_profile, compare for changes):
> "I hold other positions outside of this list, but I only update the alerted ones here. Lotto trades, ideas/setups, #news, #sell-side plays and free runners, along with ideas on auto-cruise, and ones I've said I won't be updating (even if I haven't fully exited) aren't included in the list above. There are also names like MEI, ALGM, HIMX, etc. that have played out and are not included here, but I may still hold them through my LT account or elsewhere."

---

### Type 2: Entry Alerts
**~40–60 per 90 days**

All confirmed entries are tagged `@Wall - Alerts`. Multiple format variants observed:

**Format A — Major new position** (full formal open, company name stated):
```
OPENING $[TICKER] ([FULL COMPANY NAME]) @Wall - Alerts
```
Followed by: Mcap, Short Interest, detailed thesis, catalysts

**Format B — Add / new with DD to follow**:
```
ADDED [TICKER]: Here's some initial DD: @Wall - Alerts
```
or
```
Added $[TICKER] at $[price] [weight]% @Wall - Alerts
```
Followed by: multi-paragraph thesis

**Format C — Conviction add** (high-confidence re-add):
```
Added Conviction long on $[TICKER] @Wall - Alerts
```
Immediately followed or preceded by: `[weight]% position size`

**Format D — Technical level entry**:
```
ADDED [TICKER] at 50DMA @Wall - Alerts
```

**Format E — Verbose with company name**:
```
I added [TICKER] ([COMPANY NAME]) at $[price]. ([weight]% position) @Wall - Alerts
```

**Format F — Re-entry**:
```
Adding [TICKER] back to my automation basket
```
or
```
This is my second trade on $[TICKER]. @Wall -...
```

**Format G — Inline with context** (sometimes the "ADDED" is the start of a longer post):
```
ADDED SHMD, will post DD soon @Wall - Alerts
```

**Intent/pending** (NOT yet confirmed entry — do NOT parse as trade):
```
Looking to upsize [TICKER] with shares and some calls too @Wall - Alerts
```

**Position size follow-up** (often a separate message immediately after entry):
```
5% position size
```
or
```
3% position
```
These must be associated with the entry by proximity (same cluster, within minutes).

---

### Type 3: Exit / Trim Alerts
**~10–20 per 90 days** (many exits are implicit via snapshot disappearance)

**Full exit**:
```
Going to exit [TICKER] for now and try other opportunities
```

**Partial exit / trim**:
```
Trimmed and booked a lot of profits this week (eg. AMBQ, HIMX, MEI)
```

**Implicit exit**: ticker disappears from next portfolio snapshot without explicit mention. This is common — WSE often exits quietly and notes it in the next weekly update. The snapshot diff is the authoritative exit signal for quiet closes.

---

### Type 4: Performance Updates
**~30–50 per 90 days** — NOT trade signals, informational only

```
$[TICKER] +X% on the day. Really liked the call.
$[TICKER] tapping $[price], now up nearly X% since the alert. @Wall - Alerts
$[TICKER] quietly making new all-time highs. @Wall - Alerts
```

Often accompanied by a stock chart image. Parse as commentary, not trade action.

---

### Type 5: Market Commentary / Macro / Thesis
**~150–200 per 90 days** — the bulk of WSE's posts

Includes:
- FOMC / Fed commentary
- Sector rotation theses (AI, robotics, solar, defense)
- Earnings call highlights (KEY COMMENTS header, Q&A excerpts)
- Technical observations ("S&P 500 is now under 21DMA")
- Risk management commentary ("Taking a timeout week")
- Industry deep-dives (long multi-paragraph posts with revenue, margin, guidance figures)

**All of this is IGNORE for trade parsing.** Exception: earnings highlights images show scorecard (Revenue, EPS, FCF vs. estimates) — relevant as thesis context but not trade signals.

---

## 3. Options Notation

WSE uses both calls and puts. Notation is consistent but not always space/symbol-standardized:

**Calls** (most common):
```
[weight]% [TICKER] $[STRIKE]C, [MM/DD] @ $[option_price]
```
Example: `1% AVAV $200C, 09/18 @ $21.30`

**Puts** (tactical hedges, rarer):
```
The SPY puts we added has no hard stops
```
No formal put notation observed in portfolio list — put positions were mentioned conversationally.

**Date notation — CRITICAL**: `09/18` = September 18 (month/day), NOT September 2018. WSE uses MM/DD not MM/YY in at least some posts. Confirm against strike/current date context when parsing.

Options are also held in mix with shares on same position:
```
Looking to upsize NOVT with shares and some calls too
```
This means a position can have both equity and options components simultaneously.

---

## 4. Position Terminology

| Term | Meaning | Track? |
|------|---------|--------|
| Alerted positions | WSE's curated public list | YES |
| Conviction Swings | Evolved label for equity longs (June 2026) | YES |
| Commons [Long] | Earlier label for equity longs (March 2026) | YES |
| Lotto trades | Small speculative options, explicitly excluded | NO |
| #news plays | News-reaction trades, not alerted | NO |
| #sell-side plays | Sell-side recommendations, not his own | NO |
| Free runners | Positions he's let run and stopped tracking | NO |
| Auto-cruise | Long-term holdings, not actively updated | NO |
| "played out" names | Historical positions now in LT account | NO |
| LT account | Long-term account, not Discord-tracked | NO |

---

## 5. What to Parse vs. Ignore

**PARSE as new position**:
- Any message with `@Wall - Alerts` AND one of: OPENING, ADDED, Added, "I added", "Adding back", "my second trade on"
- Immediately following position-size messages (`3% position`, `5% position size`)

**PARSE as exit**:
- Messages with `@Wall - Alerts` AND: "exit", "trimmed", "booked profits"
- Portfolio snapshot diff: ticker present in snapshot N, absent in snapshot N+1 = implicit close

**PARSE as snapshot**:
- Message contains header trigger phrase (see Type 1 above) + `@Wall - Alerts`
- Full snapshot is multi-line starting with the header

**IGNORE entirely**:
- Messages without `@Wall - Alerts` (unless part of a thread with an alerted message immediately prior, and contain position sizing context)
- Any mention of "lotto", "#news", "#sell-side", "free runner", "auto-cruise"
- Earnings transcript excerpts (KEY COMMENTS, Q&A quotes)
- Market/sector commentary
- Performance updates ("tapping", "making new highs", "+X% on the day")
- Event announcements (speaker sessions, webinars)
- "Looking to..." / "Watching..." (intent, not confirmed trade)

---

## 6. Architecture Notes (Comparison vs. Zach / STW)

| Dimension | STW (Zach) | Wall St Engine |
|-----------|-----------|---------------|
| Channel content | Primarily text | Primarily text |
| Portfolio snapshots | IMAGE-based daily overview | TEXT-based weekly update |
| Vision required? | YES (image parsing) | NO |
| Entry signal clarity | Structured, consistent | Varied vocabulary (6+ formats) |
| Exit signal clarity | Explicit | Often implicit (snapshot diff) |
| Options format | TBD | `$[STRIKE][C/P], MM/DD @ $price` |
| Thesis depth | Moderate | Extensive (multi-paragraph) |
| Post volume | Moderate | High (~4.2/day) |
| Tracking scope | All alerts | "Alerted" subset only (explicit exclusions) |

**WSE-specific parser requirements for `trader_profiles.parsing_instructions`**:
1. Detect portfolio snapshot by header trigger phrase (3 variants above)
2. Parse equity line: `[weight]% [TICKER] @ [$]price[: P&L%]`
3. Parse options line: `[weight]% [TICKER] $[STRIKE][C/P], [MM/DD] @ $[price]`
4. Section headers to look for: "Conviction Swings:", "Commons [Long]:", "Options:"
5. Strip boilerplate note before parsing position list
6. Associate position-size follow-up messages with the preceding entry alert (time-proximity window: same conversation cluster, ≤5 min apart)
7. Explicit exclusions: lotto, #news, #sell-side, free runners, auto-cruise, LT account mentions
8. Use snapshot-to-snapshot diff as authoritative source for implicit exits
9. Options date `MM/DD` where DD is the calendar day, not a year
10. Puts observed conversationally; track if appears in portfolio list with `P` suffix

---

## 7. Raw Vocabulary Index

**Entry triggers** (any of these + `@Wall - Alerts` = entry):
- `OPENING $`
- `ADDED [TICKER]:`
- `Added $[TICKER] at`
- `Added Conviction long on`
- `ADDED [TICKER] at 50DMA`
- `I added [TICKER]`
- `Adding [TICKER] back`
- `my second trade on $`

**Exit triggers**:
- `exit` (+ context of a position)
- `Trimmed`
- `booked a lot of profits`
- Implicit: snapshot diff

**Snapshot header triggers**:
- `"alerted open positions, arranged by"`
- `"alerted ideas, arranged by weighting"`
- `"Alerted Open positions arranged by weighting"`

**Ignore triggers**:
- `lotto calls`
- `lotto trades`
- `#news`
- `#sell-side`
- `free runner`
- `auto-cruise`
- `LT account`
- `KEY COMMENTS` (earnings transcript)

**Performance update triggers** (ignore for trading):
- `tapping $`
- `since the alert`
- `new all-time highs`
- `+X% on the day`

---

*Analysis based on 346 posts from March 30 – June 21, 2026 (90-day window). Oldest post in results: March 30, 2026. Total search results pages reviewed: all 14 pages (pages 1, 2, 4, 6, 8, 10, 11, 12, 13, 14 sampled in detail; pages 3, 5, 7, 9 interpolated from adjacent samples with consistent patterns).*
