# Sam (samsolid) — Channel Analysis Report
**Analyst**: Manual pre-coding review  
**Date**: June 24, 2026  
**Discord Handle**: samsolid  
**Discord User ID**: 617106938668515338  
**Alert Tag**: `@Sam - Alerts`  
**Primary channel**: #🏙️丨sam — https://discord.com/channels/916525682887122974/1500954298962415646  
**Lotto channel**: #🍀丨lotto-trades (separate; ignore for tracked positions)  
**Search window**: After March 23, 2026 → June 23, 2026 (requested 90 days)  
**Channel launch**: **May 4, 2026** — channel did not exist before this date; no posts returned before May 4  
**Actual data window**: **May 4 – June 23, 2026 (~50 days)**  
**Posts analyzed**: **368 total results across 15 search pages**  
**Trading style**: Fundamental thesis with technical timing  
**Instruments**: Shares (long common stock) + Options (long calls; occasional puts not yet observed in portfolio list)  
**Social links**: X: @sam_badawi | YouTube: @sam_badawi | Whop: Stock Talk Weekly (community)

---

## 1. Volume & Cadence

- **368 posts in ~50 days** (May 4 – June 23) = **~7.4 posts/day average** — the highest rate of the three traders analyzed
- Active during market hours (8 AM – 6 PM ET) AND evenings (posts as late as 11 PM–1 AM common)
- Weekend posts observed (Sunday workshops, portfolio updates posted early Monday AM)
- **Portfolio snapshots**: weekly every Monday (first full week, covering the prior week); plus **intra-week updates** posted ad hoc when significant changes occur
- **Market Update audio recordings**: typically posted alongside or shortly after the weekly portfolio update (Sunday night / early Monday AM)
- Sam occasionally goes quiet for 2–3 days mid-week and notes it ("Apologies for being quiet the last few days")

---

## 2. Content Types (6 types)

### Type 1: Portfolio Updates (weekly + intra-week)
**~8–10 per 50 days** (every Monday + occasional intra-week)

Sam's primary reconciliation mechanism. Always tagged `@Sam - Alerts`. Three distinct format variants:

**Variant A — Weekly full update (text + image):**
```
PORTFOLIO UPDATE @Sam - Alerts

Week Ending: [Date]

Outperforming the S&P 500 by +X%

YTD: +X% | $SPY +X%
Low: -X% | $SPY -X%

Portfolio Holdings

Shares: [N]
Options: [N]

This Week's Activity

• [Trade/change bullet point 1]
• [Trade/change bullet point 2]

[Broad market commentary paragraph(s)]
```
The "This Week's Activity" bullets are the **primary source for entries and exits** in the weekly update — each bullet describes what changed. Followed by market commentary (ignore for trade parsing). An image attachment (Variant A image, described below) usually accompanies this text block.

**Variant B — Intra-week update (image only):**
```
PORTFOLIO UPDATE

Intra-week, [Day] [Month] [N] @Sam - Alerts
[Portfolio image attached]
```
Posted whenever Sam makes significant changes mid-week. Image-only format (no text position list).

**Variant C — Intra-day text position list:**
```
PORTFOLIO UPDATE

[Brief context comment]

Core Positions
$[TICKER] [WEIGHT]% @ $[COST]
$[TICKER] [WEIGHT]% @ $[COST]
...

Medium-Term Positions
$[TICKER] [WEIGHT]% @ $[COST]
...

Short-Term Positions
$[TICKER] [WEIGHT]% @ $[COST]
...

[N] positions • [options description] • [GROSS]% gross exposure @Sam - Alerts
```
Observed June 22: "18 positions • No options • 110.2% gross exposure @Sam - Alerts." The text list does NOT always accompany the image — they can appear independently.

---

**Portfolio image format (IMAGE-BASED — vision required):**

The portfolio tracker is a custom spreadsheet screenshot — NOT a brokerage screenshot. The format evolved during the 50-day window:

**May 4 format** (earliest observed, no Sector column):
```
# | Ticker | Holding      | Size% | Cost$ | Price$ | Gain%
1 | AMZN   | Long Term    | 17.4% | 117.00| 272.07 | +132.5%
...
```

**June 9+ format** (Sector column added):
```
# | Ticker | Sector         | Holding     | Size% | Cost$ | Price$ | Gain%
1 | AMZN   | Infrastructure | Long Term   | 14.9% | 117.00| 244.19 | +108.7%
2 | ON     | Semiconductors | Long Term   | 14.3% | 46.00 | 117.00 | +154.3%
...
```

**Holding values**: `Long Term` / `Medium Term` / `Short Term`  
**Sector values** (observed): Infrastructure, Semiconductors, Energy, Healthcare, Software, Inference, Fintech

**Options table** (appended to right of equity table when options are held):
```
Ticker | Expiration  | Strike(s) | Type       | Size% | Cost$ | Price$ | Gain%
IRDM   | 07/17/26    | 22.5      | Long Calls | 4.0%  | $3.90 | $17.65 | +352.6%
MITK   | 07/17/26    | 12.5      | Long Calls | 1.0%  | $2.87 | $3.65  | +27.2%
INDI   | 06/18/26    | 4         | Long Calls | 1.0%  | $0.95 | $0.83  | -12.6%
NOW    | 05/15/26    | 100       | Long Calls | 0.2%  | $4.42 | $1.50  | -66.1%
                                   Total       6.2%
```

**Portfolio summary box** (bottom-right of image):
```
Date: [Day], [Date]
X: http://x.com/@sam_badawi
YouTube: http://youtube.com/@sam_badawi
Whop: Stock Talk Weekly

Asset    | Size
Shares   | 105.8%
Options  | 6.2%
Net Long | 112.0%
Cash     | -12.0%
```

**Header trigger** (detect portfolio snapshot): `"PORTFOLIO UPDATE"` (all caps) + `@Sam - Alerts` in same message  
**Subtype discriminator**: presence of `"Week Ending:"` = weekly; `"Intra-week,"` = mid-week; text position list = Variant C

---

### Type 2: Entry Alerts
**~10–20 per 50 days**

All confirmed entries are tagged `@Sam - Alerts`. Four format variants:

**Format A — Weekly update bullet point** (most common, embedded inside Type 1):
```
• Initiated a [X]% position in $[TICKER] at $[PRICE] near [TECHNICAL LEVEL] as a [term] position.
```
Example: `• Initiated a 3% position in $ONDS at $9.20 near the 200MA as a swing position.`  
This is discovered by reading the "This Week's Activity" section of the weekly PORTFOLIO UPDATE, not as a standalone message.

**Format B — Standalone "NEW POSITION" header:**
```
NEW POSITION

[Technical setup description / stop level] @Sam - Alerts

Opening a [X]% position in $[TICKER] @ [PRICE] [sector description].
```
Example: `NEW POSITION / This is a tight stop below the 21EMA on the weekly chart @Sam - Alerts / Opening a 6% position in $CIEN @ 453 networking segment of the portfolio.`

**Format C — Combined swap "EXIT and ENTER POSITION":**
```
EXIT and ENTER POSITION

[Brief rationale / "We are making a swap in positions here."]

Exiting
$[TICKER]
at [PRICE] ([X]% position)

Add
$[TICKER]
at $[PRICE] ([X]% position)
```
Example (June 11): Exiting $UNH at 406.50 (5% position) → Add $TE at $8.22 (4% position)  
This is a simultaneous close + open — parse as one EXIT leg + one ENTRY leg.

**Format D — "SOLD POSITIONS" follow-up entry** (rare):  
After a "SOLD POSITIONS" bulk exit, the next weekly update's "This Week's Activity" will describe what was re-entered. The re-entry may also appear as a standalone NEW POSITION post.

**Intent/pending (NOT confirmed entries — DO NOT parse):**
```
Just a heads up. I'm working on a thesis for $[TICKER]. @Sam - Alerts
$[TICKER] - Prospective position. [chart analysis]
I am considering $[TICKER]...
Looking to buy some leaps into the print. Only 1% size. @Sam - Alerts
I think it's safe to say that I will not be able to size up on $[TICKER] @Sam - Alerts
```
The key distinguisher: intent posts describe analysis/consideration; confirmed entries describe an action already taken ("Opening", "Initiated").

---

### Type 3: Exit / Close Alerts
**~10–15 per 50 days** (explicit; more embedded in portfolio updates)

**Format A — Standalone "CLOSING POSITION" header (explicit, real-time):**
```
CLOSING POSITION

[Market / sector context]

Selling $[TICKER] here at $[PRICE] @Sam - Alerts
```
Example (June 23): `CLOSING POSITION / We are fairly weak but more on the semiconductors. / Selling $ONDS here at $8.75 @Sam - Alerts`

**Format B — "SOLD POSITIONS" bulk notification:**
```
SOLD POSITIONS @Sam - Alerts

As I have mentioned before, I have executed a couple of sales just now. Please refer to previous messages for the justification.
```
Does NOT list individual tickers in the message itself. Tickers must be inferred from prior context messages or confirmed via next portfolio snapshot diff.

**Format C — Weekly update bullet point (embedded in Type 1):**
```
• Sold the remaining $[TICKER] position for a gain of over X%.
• Sold $[TICKER] and re-entered at a lower price as a short-term trading position.
```

**Format D — Combined swap (see Entry Format C above):**  
The "Exiting" leg of an "EXIT and ENTER POSITION" message is a confirmed exit.

**Implicit exit**: ticker present in portfolio image snapshot N but absent in snapshot N+1 = implicit close. The snapshot diff is authoritative for quiet exits.

---

### Type 4: Market Update (Audio Recordings)
**~4–6 per 50 days** (roughly weekly)

```
MARKET UPDATE - [Date]

Here's an audio recording with additional updates. The summary above only highlights the key points, with more details covered in the recording. @Sam - Alerts
[.mp3 file attached, e.g. 20260621_SF_Markets.mp3]
```
Audio files are NOT parseable for trade signals. Treat as commentary. The text summary above it is what matters (if it contains trade actions).

---

### Type 5: Chart Reviews / Thesis Commentary
**~100–150 per 50 days** — the bulk of posts

```
CHART REVIEWS
Going to run through a few charts and observations. @Sam - Alerts
[chart images follow]
```

Also includes:
- Technical analysis on existing or prospective positions (with chart images)
- Earnings commentary and reaction posts
- Market macro commentary (Fed, sector rotation)
- Performance comparisons ("$ARM is still down 10% from our exit")
- Risk management philosophy posts

**All of this is IGNORE for trade parsing** unless the message explicitly contains a confirmed trade action ("Opening", "Selling", "Initiated", "EXIT and ENTER").

@Sam - Alerts appears frequently in commentary posts — the tag alone does NOT indicate a trade. Look for action verbs plus price/size details.

---

### Type 6: Admin / Scheduling Posts
**~5–10 per 50 days**

```
Weekend Note

[Vacation/absence notice or schedule change] @Sam - Alerts
```
Also: community encouragement posts, philosophy posts, responses to member questions. All ignore for trade parsing.

---

## 3. Options Notation

Sam's options format is UNIQUE — uses full date (not month name abbreviation):

**Calls** (most common):
```
$[TICKER] [MM/DD/YYYY] [STRIKE]c @ [PRICE]
```
Example: `$FSLY 01/15/2027 20c @ 16.20`

**Key differences from other traders:**
- Zach: `$[STRIKE]C [Mon] '[YY] @ $[price]` → e.g. `$20C Jan '27 @ $16.20`
- WSE: `$[STRIKE][C/P], [MM/DD] @ $[price]` → e.g. `$20C, 01/15 @ $16.20`
- Sam: `$[TICKER] [MM/DD/YYYY] [STRIKE]c @ [PRICE]` → e.g. `$FSLY 01/15/2027 20c @ 16.20`

Sam's format is the only one that **includes the underlying ticker** in the option notation (redundant when it's clear from context, but important for options-only snapshots).

**Options date format**: full `MM/DD/YYYY` (four-digit year). Parse as Month/Day/Year.  
**Strike notation**: just the number followed by `c` (calls) or `p` (puts) with no `$` prefix before the strike.

**Options in portfolio image**: different columns — Expiration as `MM/DD/YY`, Strike as a number, Type as "Long Calls" or "Long Puts". Parse the image table directly.

**Lotto trades** (separate channel format — NOT tracked positions):
```
$[TICKER] [MM/DD/YYYY] [STRIKE]c @ [PRICE]
Lotto X% of the portfolio. Please do not ape into this. It is a small size that I am willing to lose. @Sam - Alerts # 🍀丨lotto-trades 💬
```
Identified by: "Lotto" keyword + link to #lotto-trades channel. Filter by channel routing; never parse these as tracked positions.

---

## 4. Position Terminology

| Term | Meaning | Track? |
|------|---------|--------|
| Core Positions (text) | Highest conviction; maps to Long Term in image | YES |
| Medium-Term Positions (text) | Standard tracked swing; maps to Medium Term in image | YES |
| Short-Term Positions (text) | Active swings, explicit stop levels; maps to Short Term in image | YES |
| Prospective position | Watchlist / setup being researched, NOT yet entered | NO |
| Lotto (#lotto-trades) | Small speculative options, explicitly separate channel | NO |

**Holding duration labels** (image): `Long Term` / `Medium Term` / `Short Term`  
**Holding tier labels** (text format): `Core Positions` / `Medium-Term Positions` / `Short-Term Positions`  
These map 1:1: Long Term ↔ Core Positions; Medium Term ↔ Medium-Term Positions; Short Term ↔ Short-Term Positions.

**Portfolio leverage**: Sam runs with negative cash (leveraged). May 4: 112.0% Net Long (−12% cash). June 22: 110.2% gross exposure. Margin usage is explicit and acknowledged ("I'd be stepping into margin again if I enter").

**Position concentration**: very concentrated at the top. In May 4 snapshot, top 5 positions = 61.3% of portfolio. Top 2 (AMZN + ON) = ~31% alone.

---

## 5. What to Parse vs. Ignore

**PARSE as new position:**
- Any message with `@Sam - Alerts` AND one of: `"NEW POSITION"`, `"Opening a X%"`, `"Initiated a X%"`
- "This Week's Activity" bullets in PORTFOLIO UPDATE that describe opening: `"Initiated a [X]% position in $[TICKER]"`
- "Add" leg of an "EXIT and ENTER POSITION" message

**PARSE as exit:**
- `"CLOSING POSITION"` header + `"Selling $[TICKER] here at $[PRICE]"` + `@Sam - Alerts`
- `"SOLD POSITIONS @Sam - Alerts"` (bulk; tickers determined by snapshot diff)
- "This Week's Activity" bullets: `"Sold the remaining $[TICKER]"` or `"Sold $[TICKER]"`
- "Exiting" leg of an "EXIT and ENTER POSITION" message
- Portfolio snapshot diff: ticker absent from snapshot N+1 after being in snapshot N

**PARSE as portfolio snapshot:**
- Message with `"PORTFOLIO UPDATE"` (all caps) + `@Sam - Alerts` header
- Detect subtype: weekly text (has `"Week Ending:"`) vs. intra-week image (has `"Intra-week,"`) vs. text list (has `"Core Positions"`)
- Image requires vision; text list is directly parseable

**IGNORE entirely:**
- Messages without `@Sam - Alerts` (pure commentary, chart posts, community discussion)
- Messages with `@Sam - Alerts` but no trade action vocabulary (market commentary, CHART REVIEWS, thesis updates on existing positions, hold confirmations)
- `"$[TICKER] - Prospective position."` (watchlist, not yet entered)
- `"Just a heads up. I'm working on a thesis"` / `"I am considering $[TICKER]"` (intent, not confirmed)
- `"Decided not to go for the [TICKER] lottos"` (cancelled intent)
- `"I think it's safe to say that I will not be able to size up on $[TICKER]"` (capacity note, not trade)
- Any message routed to #lotto-trades (even if tagged @Sam - Alerts)
- MARKET UPDATE audio recordings
- Weekend Note posts
- Twitter/X news embeds (macro news shares)
- Performance commentary: `"$[TICKER] is still down X% from our exit"` etc.
- Hold announcements: `"Holding onto the $[TICKER] swing @Sam - Alerts"` (NOT an entry or exit)
- Earnings commentary: GRAB earnings reflection, #peer-ideas cross-posts

---

## 6. Architecture Notes (Comparison vs. WSE and Zach)

| Dimension | Sam (samsolid) | Zach (STW) | Wall St Engine (WSE) |
|-----------|---------------|------------|---------------------|
| Channel age | ~50 days (launched May 4, 2026) | Established | Established |
| Post volume | ~7.4/day (highest) | ~4–5/day | ~4.2/day |
| Portfolio snapshots | IMAGE + partial text | IMAGE + text | TEXT only |
| Vision required? | YES (image primary) | YES (image primary) | NO |
| Snapshot cadence | Weekly (Mon) + intra-week ad hoc | Weekly (Fri) | ~Weekly (variable) |
| Entry signal clarity | 4 formats; mixed into weekly updates | Structured | 8+ formats |
| Exit signal clarity | Explicit (CLOSING POSITION) + implicit | Mostly explicit | Mostly implicit |
| Options format | `$[TICKER] MM/DD/YYYY [STRIKE]c @ [PRICE]` | `$[STRIKE]C [Mon] '[YY] @ $[price]` | `$[STRIKE][C/P], MM/DD @ $price` |
| Position tiers | 3 explicit tiers (Core / Medium / Short) | Core (*) vs. satellite | Weight ranking only |
| Portfolio sectors | YES (Sector column in image) | NO (theme grouping) | NO |
| Lotto channel | Separate #lotto-trades (ignore) | Separate #lotto-trades (ignore) | Mentioned inline (ignore) |
| Leverage | YES (110–112% net long; negative cash) | YES (up to ~120%) | Not noted |
| Audio content | YES (mp3 market updates) | NO | NO |
| Prospective/watchlist | Labeled "Prospective position" | Labeled "Prospective Positions basket" | Not explicitly labeled |
| Swap trades | "EXIT and ENTER POSITION" (combined) | Not observed | Not observed |
| Bulk exit notice | "SOLD POSITIONS" (no tickers) | Not observed | "Trimmed" (vague) |

**Sam-specific parser requirements for `trader_profiles.parsing_instructions`**:
1. Detect portfolio snapshot by `"PORTFOLIO UPDATE"` (all caps) + `@Sam - Alerts` in same message
2. Parse weekly text: extract "This Week's Activity" bullets → `"Initiated"` = entry, `"Sold"` = exit
3. Parse image (vision): equity table columns `# | Ticker | [Sector]? | Holding | Size% | Cost$ | Price$ | Gain%`; Sector column optional (not present before June 9)
4. Parse image options table: `Ticker | Expiration MM/DD/YY | Strike | Type | Size% | Cost$ | Price$ | Gain%`
5. Parse text position list: `Core Positions / Medium-Term Positions / Short-Term Positions` → `$[TICKER] [WEIGHT]% @ $[COST]`
6. Parse "NEW POSITION" header: look for `"Opening a X%"` in same message for ticker + weight + price
7. Parse "EXIT and ENTER POSITION": parse two legs (Exiting = exit at price, Add = entry at price)
8. Parse "CLOSING POSITION": look for `"Selling $[TICKER] here at $[PRICE]"` in message body
9. Parse "SOLD POSITIONS": flag as bulk exit event; use snapshot diff to determine which tickers closed
10. Options format: `$[TICKER] [MM/DD/YYYY] [STRIKE]c @ [PRICE]` — full 4-digit year, ticker prefix, lowercase c/p
11. Filter lotto trades: if message contains link to #lotto-trades AND "Lotto" keyword, skip entirely
12. Prospective positions: `"$[TICKER] - Prospective position."` = watchlist, DO NOT create position record
13. "Holding onto the $[TICKER]" = NOT an entry or exit, ignore
14. Vision required for all image-based snapshots (Holding column = position tier)
15. Snapshot diff: compare image positions between portfolio updates for implicit exits
16. Portfolio summary box in image: read `Net Long%` and `Cash%` for leverage stats

---

## 7. Raw Vocabulary Index

**Entry triggers** (any of these + `@Sam - Alerts` = confirmed entry):
- `"NEW POSITION"` (header; followed by "Opening a X%")
- `"Opening a X% position in $[TICKER]"`
- `"Initiated a X% position in $[TICKER]"` (inside "This Week's Activity" bullet)
- `"Add"` leg of `"EXIT and ENTER POSITION"` (confirmed, structured)

**Exit triggers:**
- `"CLOSING POSITION"` (header; followed by "Selling $[TICKER] here at $[PRICE]")
- `"Selling $[TICKER] here at $[PRICE]"` (inside CLOSING POSITION)
- `"SOLD POSITIONS"` (bulk; tickers inferred from context/diff)
- `"Sold the remaining $[TICKER]"` (inside weekly update bullet)
- `"Sold $[TICKER] and re-entered"` (inside weekly update bullet)
- `"Exiting"` leg of `"EXIT and ENTER POSITION"`
- Implicit: snapshot diff

**Portfolio snapshot triggers:**
- `"PORTFOLIO UPDATE"` (all caps) + `@Sam - Alerts`
- `"Week Ending:"` = weekly variant
- `"Intra-week,"` = mid-week image update
- `"Core Positions"` / `"Medium-Term Positions"` / `"Short-Term Positions"` = text list variant

**Watchlist triggers (IGNORE — not yet entered):**
- `"Prospective position"` (always followed by chart/thesis)
- `"I'm working on a thesis for $[TICKER]"`
- `"I am considering $[TICKER]"`
- `"Looking to buy"` / `"Looking at the options chain"`

**Lotto triggers (filter to #lotto-trades, IGNORE):**
- `"Lotto X% of the portfolio"`
- `"Please do not ape into this"`
- Link to `#🍀丨lotto-trades`

**Hold/position management triggers (IGNORE for entry/exit):**
- `"Holding onto the $[TICKER] swing"`
- `"I will be holding"`
- `"I am not a fan of the recent price action"` (risk commentary, not exit)

**Ignore content type triggers:**
- `"CHART REVIEWS"` (chart walkthrough session)
- `"MARKET UPDATE"` (audio recording)
- `"Weekend Note"` (scheduling)
- `.mp3` attachment (audio, ignore)
- `"#peer-ideas"` link in message (cross-posted community idea, not Sam's own trade)

**Performance update triggers (IGNORE for trading):**
- `"still down more than X% from our exit"`
- `"up X% on the day"`
- `"outperforming the S&P 500 by"`

---

## 8. Known Positions (May 4 – June 23, 2026)

### From May 4, 2026 portfolio image (20 equity + 4 options):
AMZN (17.4% LT), ON (13.4% MT), AMKR (10.8% MT), MRVL (10.7% MT), ARM (9.1% MT), NBIS (8.0% LT), HII (4.7% LT), FPS (4.2% MT), ENS (3.7% LT), SYNA (3.3% MT), NOW (3.2% MT), RBRK (2.9% MT), HOOD (2.8% MT), ZETA (2.4% LT), AMPX (1.8% MT), TLN (1.6% MT), MELI (1.6% LT), META (1.6% ST), OSS (1.3% MT), GRAB (1.3% MT)  
Options: IRDM $22.5C 07/17/26 (4%), MITK $12.5C 07/17/26 (1%), INDI $4C 06/18/26 (1%), NOW $100C 05/15/26 (0.2%)

### From June 9, 2026 intra-week image (15 equity, no options):
AMZN (14.9% LT), ON (14.3% LT), NBIS (11.7% LT), AMKR (11.6% LT), FPS (9.3% MT), UNH (5.9% ST), MRVL (5.4% MT), NOW (4.4% MT), SYNA (4.3% MT), ENS (3.7% LT), RBRK (3.2% LT), HOOD (2.7% MT), ZETA (2.6% LT), OSS (2.6% MT), MELI (1.3% LT)

### From June 22, 2026 text portfolio (18 positions, no options):
Core: ON (14.8%), AMKR (13.8%), NBIS (13.7%), AMZN (13.1%), ENS (3.5%), RBRK (2.1%), ZETA (2.0%), MELI (1.2%)  
Medium-Term: FPS (9.4%), MRVL (5.7%), SHLS (5.3%), SYNA (4.4%), HOOD (3.2%), OSS (2.7%), NOW (2.4%)  
Short-Term: CIEN (5.4%), TE (4.9%), ONDS (2.7%)

### Confirmed exits during window:
- ARM: exited (sold all, >100% gain — confirmed in June 13 weekly update bullet)
- UNH: exited via EXIT and ENTER POSITION swap (June 11) → replaced with TE
- ONDS: entered May 4 week (~3%) → CLOSING POSITION June 23 at $8.75
- GRAB, HII, META, TLN, AMPX: exited (not in June snapshots; likely via SOLD POSITIONS May 5-6)
- CIEN: appears in June 22 text as 5.4%; entered via NEW POSITION June 12 at $453 (6%)
- TE: entered June 11 via EXIT and ENTER swap at $8.22 (4%)
- SHLS: appears in June 22 at 5.3% — entry not captured in sampled pages (likely intra-week)

---

*Analysis based on 368 posts from May 4 – June 23, 2026 (channel launched May 4, 2026; searched window from March 23 returned no earlier results). Total search result pages: 15. Pages sampled: 1, 2, 3, 14, 15 in detail; remaining pages interpolated from adjacent samples and weekly portfolio image diffs. Portfolio images reviewed: May 4 and June 9 (image), June 22 (text). The channel appears to have been created expressly for the Stock Talk Insiders community in early May 2026 — it is a new channel with a compressed but high-volume history.*
