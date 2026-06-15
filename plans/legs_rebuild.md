# Legs Rebuild — recover correct per-leg data (handoff 2026-06-15)

## Problem
`stw_backfill_2026.sql` parsed the `legs` table incorrectly. Across most open positions the
`legs` rows are wrong: **missing legs, phantom legs, wrong statuses, wrong entry prices.** The app
reads `legs` for the Trades tab + per-leg P&L, so those are wrong in the UI.

**Recovery sources (all still in prod — 034/035 NOT applied, so deprecated cols survive):**
- `holdings.position_detail` — per-holding canonical leg string the app captured live. **Best source,
  but NOT flawless**: some stale/expired options not pruned (ADEA, LUMN), some incomplete (FIVN/CXDO/SHLS
  show options-only but the position also has common per the snapshot), format edge cases (BLDP, BDC).
- The **6/12 weekly snapshot** (below) — pruned/authoritative, but a single point in time and can lag
  unannounced legs. Use as the tie-breaker.
- `holding_transactions` — **intact** (114 rows, dated, through 6/12). The app's transaction timeline
  reads this, so the month of history is preserved. Leave as-is.

**Key insight:** the host does NOT announce every leg in the daily feed (e.g. SYNA `$85C Sep'26` only
appeared in the weekly snapshot, never `live-notes`). → Phase 2: the **Friday routine must reconcile
legs/contracts from the weekly snapshot, not just weights.**

**Plan:** user manually rebuilds the discrepant tickers (authoritative leg list per ticker) and feeds
them back → new session writes a corrective SQL (rebuild `legs` + opening `leg_transactions`;
per-leg weight = 90/10 default rule; fix holding-level status where corrupted, e.g. SYNA Closed→held).
Then build the admin leg/transaction editor. DO NOT apply 034/035 until legs are verified.

## Status legend
- ✅ CLEAN — `legs` matches `position_detail`, leave alone (still confirm vs snapshot):
  **ARKK, IRDM, LEU, MITK, NBIS, OSS, TE, TSLA**
- ❌ all others below need rebuild.

## Per-ticker: `position_detail` (captured) vs `legs` (actual, broken)

| Ticker | position_detail (reference) | legs now (broken) | Issue |
|---|---|---|---|
| ADEA | Common@30.10 + 30C Jun'26@1.50 + 30C Sep'26@3.58 + 35C Sep'26@2.74 | Common@30.10[O] + 30C Jun26@2.50[CLOSED] + 35C Sep26@2.74[O] + 30C Sep26@3.00[O] | entry mismatches; snapshot shows ONLY 35C Sep'26 → stale opts |
| AMKR | Common@26.35 | Common@24.35[O] + Common@27.50[O] + 25C Mar26[EXERCISED] + 30C Jun26[CLOSED] | phantom legs; entries wrong |
| AMRC | $35C Oct'26@4.59 | (no legs) | missing all |
| AMSC | Common@41.22 | Common@41.22[CLOSED] | status: should be OPEN |
| AMZN | Common@88.93 | Common@88.93[O] + 250C Jan2028@5.00[O] | phantom option |
| ARRY | $9C Aug'26@1.54 | 9C Aug26@1.54[CLOSED] | status: should be OPEN |
| BDC | Common@125.85 + $120C Sep@8.68 | Common@125.85[O] | missing 120C Sep (no year in PD) |
| BLDP | Aug'26 $4C @$0.90 and $5C @$0.60 | 4C Aug26@0.90[CLOSED] + 5C Aug26@0.60[CLOSED] | status: should be OPEN; format edge case |
| CRNC | Common@9.98 | Common@9.98[O] + 10C Aug26@1.85[CLOSED] | phantom option |
| CTS | Common@51.26 + 50C Oct'26@6.28 | Common@51.26[O] | missing 50C Oct |
| CXDO | $7.5C Jul17'26@0.65 + $10C Oct'26@2.24 | Common@6.93[O] + 10C Oct26@2.24[CLOSED] + 10C Oct26@1.50[CLOSED] | PD omits common(?); missing 7.5C Jul; dup/closed 10C |
| ENS | Common@116.63 | Common@116.63[O] + 115C Mar26@3.50[CLOSED] | phantom option |
| FIVN | $22.5C Oct'26@2.67 | Common@20.48[O] + 22.5C Oct26@2.00[O] + 25C Oct26@3.70[CLOSED] | PD omits common; entry 2.67 vs 2.00; phantom 25C |
| FPS | Common@34.31 + 35C Nov'26@8.64 | Common@34.31[O] | missing 35C Nov |
| GDYN | Common@6.34 | Common@6.34[O] + 7C Oct26@1.20[CLOSED] | phantom option |
| HII | Common@292.94 | Common@236.40[CLOSED] + Common@293.00[CLOSED] + 285C Mar26[EXERCISED] | status; entries; phantom |
| HOOD | Common@19.74 | Common@19.74[O] + 80C Jun26@3.00[O] | phantom option ($80C on a $19 stock) |
| KTOS | Common@22.34 | Common@22.34[CLOSED] + 35C Jan27[CLOSED] + 40C Jan27[CLOSED] | status; phantom options |
| LUMN | $7C Jan'27@2.86 | 8C May26[EXPIRED] + 8C Jul26[CLOSED] + 7C Jan27@2.63[CLOSED] | all closed; entry 2.86 vs 2.63; phantom |
| PLPC | Common@192.16 | Common@192.16[CLOSED] | status: should be OPEN |
| RDCM | Common@12.91 | Common@12.91[CLOSED] | status: should be OPEN |
| RNG | $50C Jun18'26@3.63 | (no legs) | missing all (also holding last_action=Hold wt 0.01 — review) |
| SHLS | $10C Oct'26@1.95 | Common@9.41[O] + 10C Oct26@1.95[O] | snapshot says shares@9.41 only; SHLS $10C de-facto closed |
| SYNA | Common@86.14 + $85C Sep'26@9.90 | Common@85.78[O] + 85C Mar26[EXPIRED] | holding wrongly Closed; entry 85.78 vs 86.14; **rolled Mar→Sep** (Mar $85C expired/rolled, Sep $85C @9.90 current); missing Sep |
| VIAV | Common@14.63 | Common@15.20[O] + Common@13.84[O] + 14C Mar26[EXERCISED] | entries; phantom legs |
| VPG | Common@53.16 + 50C Nov'26@9.20 + 60C Jun'26@5.30 | Common@53.16[O] | missing both options |

Closed holdings (last_action=Closed, mostly null position_detail) — lower priority, confirm genuinely
closed: AVAV, BB, DPRO, GLDD, GME, ITRI, P, PANL, SQQQ, THR.

## 6/12 snapshot (authoritative weekly `updates-portfolio`, user-pasted)
```
6/12/26, 9:57 AM — 78:22 EQUITY:OPTIONS — 23 POSITIONS
Format: % WEIGHTING - $TICKER @ COMMON COST BASIS + OPTIONS @ COST BASIS. Core = *

ROBOTICS + EDGE AI 24.2%
  10.8%: OSS* @ 4.71
  6.5%: VPG* @ 53.16 + 50C Nov'26 @ 9.20 + 60C Jun'26 @ 5.30
  4.7%: SYNA* @ 86.14 + 85C Sep'26 @ 9.90
  2.2%: CTS @ 51.26 + 50C Oct'26 @ 6.28
DATACENTER + AI INFRA 23.8%
  14.3%: VIAV* @ 14.63
  4.3%: NBIS* @ 23.92
  2.9%: GDYN @ 6.34
  2.3%: BDC @ 125.85 + 120C Sep'26 @ 8.68
POWER INFRASTRUCTURE 20.2%
  8.5%: ENS* @ 116.63
  6.4%: TE @ 7.87 (NEW)
  2.8%: SHLS @ 9.41
  2.5%: FPS @ 34.31 + 35C Nov'26 @ 8.64
U.S. CHIPS SUPPLY CHAIN 16.6%
  11.3%: AMKR* @ 26.35
  5.3%: ADEA @ 30.10 + 35C Sep'26 @ 2.74
TELECOM + VOICE AI 12.7%
  7.0%: FIVN @ 20.48 + 22.5C Oct'26 @ 2.67
  2.9%: CRNC @ 9.98
  2.8%: CXDO @ 6.93
AI FRAUD / VERIFIED IDENTITY 4.1%
  4.1%: MITK @ 13.28 + 12.5C Nov'26 @ 3.70
SPACE & SATELLITE 3.4%
  3.4%: IRDM (options only) - 22.5C Jul 17 @ 3.35
NUCLEAR 1.5%
  1.5%: LEU* @ 96.94
LEGACY 2.4%
  0.8%: AMZN* @ 88.93
  0.8%: HOOD @ 19.74
  0.8%: TSLA* @ 19.38
Hedge: ARKK 70P Jun18'26 @ 0.83 — 0.7%
Cash: -8.9% (+108.2% long incl hedge)
```
Note: the snapshot is 23 positions; DB has ~10 holdings marked active but ABSENT from it
(AMRC, AMSC, HII, KTOS, LUMN, PLPC, RDCM, RNG, VLN, ARRY) — confirm post-6/12 adds vs stale.
