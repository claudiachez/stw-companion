# STW Companion — Commentary vs. Transaction History Boundary Spec

**Purpose:** Eliminate duplication across the four surfaces on the Ticker Detail page by giving
each surface exactly one job and one owner. Hand-off for the Claude Code agent implementing the
routines (`stw-morning-run`, `stw-afternoon-run`, `stw-transcripts`).

**Scope:** This spec defines *what content goes where*. It does **not** change the database schema,
the `leg_transactions` / `legs` / `holdings` / `conviction_comments` tables, or the routine
trigger/dedup logic. Those stay as written in the existing SKILLs.

---

## 1. The four surfaces and their single jobs

The Ticker Detail page renders **four** surfaces from **three** tables. Today three of them
overlap. After this spec, each holds one non-overlapping thing.

| Surface (UI) | Backing field | Owner routine(s) | Cardinality | Job — answers the question |
|---|---|---|---|---|
| **Highlight box** (boxed line under the conviction bar) | `holdings.summary` | thesis-refresh path (all 3 routines) | 1 | *The durable "why he's in it"* — survives across every comment and trade |
| **Key Points** (diamond bullets) | `holdings.bullets` | thesis-refresh path (all 3 routines) | 1 set | *The durable thesis pillars* — same survival test as summary |
| **Commentary** (dated, source-tagged: STREAM / DISCORD) | `conviction_comments` (many rows) | all 3 routines, 1 row per material **view** | many | *What he thinks about the company/chart/thesis right now* — the opinion log |
| **Transaction History** (`notes` column) | `leg_transactions.notes` | morning/afternoon (the event-sourcing path) | many | *What he did, and the mechanics of doing it* — the action log |

**Key correction from the current build:**
- The Highlight box currently **echoes the newest Commentary row** → it must instead render
  `holdings.summary` (the durable why), which is presently written but rendered nowhere.
- Key Points currently **restate the latest comment** → must instead hold durable pillars only.

---

## 2. THE BOUNDARY RULE (the one line that matters)

> **A transaction row and a commentary row may share a date and even the same source message, but
> they must never share content. Mechanics (price / size / weight / structure / why-structured-
> this-way) go to Transaction History. Views (chart / thesis / conviction / appetite) go to
> Commentary. If you strip the mechanics out of a message and a standalone view remains, that view
> earns a Commentary row. If nothing is left, there is NO Commentary row. A view about an
> already-held leg with no trade attached is Commentary-only.**

### The strip-out test (apply to every host message)
1. Remove the buy/sell/price/size/weight/structure.
2. Is there anything left that is a **view on the stock** (chart read, thesis update, conviction
   restatement, earnings reaction, appetite to add/trim)?
   - **Yes** → that residue → **Commentary**. The mechanics → **Transaction History**.
   - **No** → it is *only* a transaction → **Transaction History only**. Do not create a
     Commentary row.

### Durable-vs-episodic test (separates Commentary from Summary/Key Points)
For anything that lands in Commentary, ask: *"Would this still be true and relevant three comments
from now?"*
- **No (episodic)** → stays a Commentary row (e.g., "options up ~350%, frustrated for a pullback").
- **Yes (durable)** → it also belongs in `summary` / `bullets`, and the thesis-refresh path
  rewrites those. Refresh the durable fields **only when the durable why actually changes**
  (new position, real bull-case shift) — never on a routine episodic remark.

---
## 3. WORKED EXAMPLES — real CXDO data

### CASE A — Transaction History ONLY (a trade with no standalone view)

**A1 — 5/1 fill**
- TXN `notes`: `New · $7.5C Jul '26 · $0.65 · 0.5% · Opened OTM calls ahead of earnings, starter size.`
- Commentary: **none** for the fill. (The *plan* is a separate row — see C1.)

**A2 — 6/11 contract→shares replacement**
- TXN `notes`: `Closed $7.5C Jul @ $0.42; Closed $10C Oct @ $0.35; New Shares @ $6.93, 2.5%. Share adds replace the contracts — reducing volatility/beta of the portfolio.`
- Commentary: **none.** "Reduce beta" is the mechanics-of-the-trade rationale, not a thesis/chart
  view. Nothing survives the strip-out.

### CASE B — Commentary ONLY (a view with no trade)

**B1 — 6/1 "+350%" lament** *(the canonical example: a comment on an already-held leg)*
- Commentary `comment`: `Options already up ~350% and he openly said he doesn't have enough size. Gorgeous on all timeframes. Frustrated it won't give him the pullback to add.`
- Transaction History: **none.** No leg opened/closed/resized by this statement. It is an
  observation about a position he *already holds*. (The 6/1 upsize is its own TXN row, driven by
  the separate upsize message — not by this comment.)

**B2 — 5/3 chart read**
- Commentary `comment`: `17 years of base-building; now climbing a clean ladder of higher highs and higher lows toward overhead resistance. Over $8.30 can be explosive.`
- Transaction History: **none.** No trade on 5/3 — pure chart opinion.

### CASE C — ONE message feeds BOTH, each gets only its half (where duplication creeps in)

**C1 — 5/1 1:56 PM primer-and-plan**
- TXN `notes` (from the 1:52 PM fill): `New · $7.5C Jul '26 · $0.65 · 0.5% · Opened OTM calls ahead of earnings.`
- Commentary `comment`: `Stated the playbook: if earnings go well, will drop the full DD thread and potentially upsize, sized to the reaction. Posted a primer — chart snapshots + a $CXDO–$BAND comp sheet.`
- No overlap: mechanics in TXN, plan/primer (a forward-looking view) in Commentary.

**C2 — 6/1 upsize**
- TXN `notes`: `Upsized to 3.9% — added $10C Oct @ $2.24. Began filling Friday, completed Monday.` (mechanics, stated verbatim)
- Commentary `comment`: the B1 "+350%" lament, if treated as same-day.
- No overlap: the TXN row never repeats "gorgeous/frustrated"; the comment never repeats
  "$2.24 / 3.9%".

### NEITHER surface — pure multi-ticker noise (portfolio digest only)
5/4 earnings-calendar list, 5/11 "ripped last week," 5/14 "+20% reaction" recap, 5/15 "relative
strength off the open." None is a CXDO-specific view or a CXDO trade. These are logged in the day's
portfolio digest only — **no** Commentary row and **no** Transaction row at the ticker level.

---

## 4. FULL RECONSTRUCTED CXDO RECORD (target state)

### `holdings.summary` (Highlight box — durable why)
> Crexendo ($CXDO) is a profitable, founder-aligned small-cap in business communications software,
> anchored by the NetSapiens platform asset sold to carriers/MSPs and a direct UCaaS business. The
> thesis is a 20-year base breakout backed by real earnings momentum: high-margin software growth
> (~72% gross margin, ~27% growth), 10 consecutive quarters of GAAP profitability, near-zero capex
> so OCF ≈ FCF, and an accretive ESI acquisition bought at ~1.3x sales that adds scale and operating
> leverage before synergies. AI-voice optionality (CAIRO) makes it thematically relevant, not just
> cheap. Held as a high-conviction, options-led position he treats as "viable to be upsized at any
> time."

### `holdings.bullets` (Key Points — durable pillars)
- Platform asset in NetSapiens — software sold to carriers/MSPs/resellers who white-label it (recurring, sticky)
- High-margin software engine: software rev +26.9% FY2025 at ~72.1% GM; ~59% blended
- Durable profitability: 10 consecutive GAAP-profitable quarters, 29 non-GAAP
- Near-zero capex (~$18K FY2025) → OCF converts almost directly to FCF
- ESI acquisition ($35M, ~1.3x sales) — immediately accretive; synergies + full-quarter contribution still ramping
- Direct $BAND peer growing far faster (rev +16% / EPS +43% TTM vs. +4.9% / +1.4%)
- ~20-year base breakout with earnings momentum; $8.30 = the "explosive" level
- AI-voice thematic via CAIRO (receptionist, routing, intent detection, transcription, analytics)
- Low single-customer risk (no customer >10% of rev/receivables FY24–25)
- Options-led, high "weighting juice," standing upsize candidate

### `holdings` scalars
- `conviction` = **5 (HIGHEST)** — consistent with the newest comment's level
- `dd_updated_at` = **2026-05-06** (full DD drop = last durable-why change)
- category = **Telecom + Voice AI**, rank #22/46

### `leg_transactions` (Transaction History — action log)
| Date | Action | Details | Price | Weight | Notes |
|---|---|---|---|---|---|
| May 1, '26 | New | $7.5C Jul '26 | $0.65 | 0.5% | Opened OTM calls ahead of earnings, starter size. |
| Jun 1, '26 | Upsized | $10C Oct '26 | $2.24 | — | "Upsized to 3.9%" (stated total). Per-leg weight attribution deferred to a separate session — do not back-solve. Began filling Friday, completed Monday. |
| Jun 11, '26 | Closed | $7.5C Jul '26 | $0.42 | 0% | Contract→shares replacement (booked at real exit, not $0). |
| Jun 11, '26 | Closed | $10C Oct '26 | $0.35 | 0% | Contract→shares replacement. |
| Jun 11, '26 | New | Shares | $6.93 | 2.5% | Added shares @ $6.93 (same move on $SHLS @ $9.41). Replaces the contracts — reducing volatility/beta. |

### `conviction_comments` (Commentary — opinion log; renders newest-first)
| event_date | source | conviction_level | comment |
|---|---|---|---|
| 2026-05-01 | discord | 4 | Playbook stated: if earnings go well, will drop the full DD thread and potentially upsize, sized to the reaction. Primer posted (chart snapshots + $CXDO–$BAND comp sheet). |
| 2026-05-03 | discord | 4 | 17 years of base-building; clean ladder of higher highs/lows toward overhead resistance. Over $8.30 can be explosive. |
| 2026-05-05 | discord | 4 | "Monster bottom line beat." Q1 rev +29% YoY to $20.7M; GAAP NI $0.6M, non-GAAP $3.3M; 10th straight GAAP-profitable quarter despite ESI amortization drag. Very satisfied. |
| 2026-05-06 | discord | 5 | Full DD thread (the "if earnings go well" trigger fired). Profitable platform business above its size: NetSapiens + UCaaS; ESI at ~1.3x sales, accretive, one month in-quarter; software +26.9% at ~72.1% GM; fwd P/E ~20; faster-growing $BAND peer; 20-year base breakout; AI-voice via CAIRO. *(refreshes summary + bullets)* |
| 2026-05-08 | discord | 5 | Characterized CXDO (then 1.9%) as an "options-only" position above 1.5% with the most "upside juice" — sizing that can expand weighting fast if it moves. |
| 2026-05-28 | discord | 5 | Just outside the top 15 — rounds out the top 18 with $CRNC, $BB, within a stone's throw of #15 in weighting. |
| 2026-06-01 | discord | 5 | Options already up ~350% and he openly said he doesn't have enough size. Gorgeous on all timeframes. Frustrated it won't give him the pullback to add. |
| 2026-06-16 | streaming | 5 | Continuing to defend the 200-day despite a red day; weakness partly sympathy pressure from a weak comparable peer that did a dilutive offering this week. Underlying structure still intact. |

---

## 5. OPEN ITEMS TO CONFIRM (carried from review)

1. **Thin/borderline Commentary rows.** 5/04, 5/11, 5/14, 5/15 are multi-ticker mentions. This
   spec drops them from the ticker-level Commentary (digest-only). Confirm the filtering lives in
   the **writer** (routine decides not to store), not the renderer.
2. **`source` label map.** Canonical: `streaming → STREAM`, `discord → DISCORD`. Confirm no rows
   were ever written with a literal `"stream"`.
3. **Conviction consistency.** Decide whether `holdings.conviction` must always equal the newest
   comment's `conviction_level`, and enforce in **one** place rather than relying on three routines.
4. **Conviction is inferred, not stated.** The 6/16 episode shows the host explicitly refuses a
   numeric scale. Consider a one-line UI disclaimer ("conviction inferred from sizing & commentary,
   not stated by STW").
