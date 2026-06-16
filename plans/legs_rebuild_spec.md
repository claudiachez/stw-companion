# Legs Rebuild — authoritative spec (built 2026-06-15)

Supersedes the per-ticker discrepancy notes in [`legs_rebuild.md`](legs_rebuild.md). Built from the
**7-snapshot series** (5/1–6/12 `updates-portfolio`, in `~/…/Stock Talk Weekly/Portfolio Updates.md`)
cross-referenced with the **pre-redesign backup** (`backups/stw_db_backup_2026-06-12_pre-redesign.json`).

## Methodology (locked with user 2026-06-15)
1. **Leg exists** only if it appears in ≥1 weekly snapshot (5/1–6/12). Filters phantoms.
2. **Open leg set** = the 6/12 snapshot (host's authoritative weekly truth-up). **Holding status** =
   backup `last_action` (correct pre-corruption value; current prod statuses are corrupted).
3. **Conversions** (option→common, 6/5→6/12): the call was **sold** (not exercised — common cost
   basis is *below* the strike) and common **bought** separately. So: CLOSE the option leg + OPEN a
   new SHARES leg at the snapshot common cost.
4. **Weights**: 6/12 snapshot position weight, split **90/10** (mixed = 90% common / 10% across
   options; options-only = even split; shares-only = 100%).
5. **Exits**: clean common closes → backup `exit_price`/`exit_pnl_pct`. Option closes + historical
   sub-legs → **user-provided** (see §3 confirmation list). RNG `50C Jun'26` = EXPIRED_WORTHLESS (−100%).
6. Rebuild = delete corrupted `legs`+`leg_transactions` → insert correct `legs` → insert opening
   `BUY` per leg (030 trigger derives entry/weight/status) → for closed legs add `SELL`/`EXPIRED`.
   `holding_transactions` (intact timeline) untouched. Fix `holdings.last_action` where corrupted.

---

## §1 — OPEN positions (24, per 6/12 snapshot) — DEFINITIVE, no input needed

Per-leg weight = 90/10 split of the 6/12 position weight. Month-only expiry → 3rd Friday.

| Ticker | Wt% | Legs (entry; weight) |
|---|---|---|
| OSS | 10.8 | Common @4.71 (10.8) |
| VPG | 6.5 | Common @53.16 (5.85) · 50C Nov'26 @9.20 (0.325) · 60C Jun'26 @5.30 (0.325) |
| SYNA | 4.7 | Common @86.14 (4.23) · 85C Sep'26 @9.90 (0.47) — **flip holding Closed→Hold** |
| CTS | 2.2 | Common @51.26 (1.98) · 50C Oct'26 @6.28 (0.22) |
| VIAV | 14.3 | Common @14.63 (14.3) |
| NBIS | 4.3 | Common @23.92 (4.3) |
| GDYN | 2.9 | Common @6.34 (2.9) — converted from 5C calls (see §3) |
| BDC | 2.3 | Common @125.85 (2.07) · 120C Sep'26 @8.68 (0.23) |
| ENS | 8.5 | Common @116.63 (8.5) |
| TE | 6.4 | Common @7.87 (6.4) |
| SHLS | 2.8 | Common @9.41 (2.8) — converted from 10C Oct (see §3) |
| FPS | 2.5 | Common @34.31 (2.25) · 35C Nov'26 @8.64 (0.25) |
| AMKR | 11.3 | Common @26.35 (11.3) |
| ADEA | 5.3 | Common @30.10 (4.77) · 35C Sep'26 @2.74 (0.53) |
| FIVN | 7.0 | Common @20.48 (6.3) · 22.5C Oct'26 @2.67 (0.7) |
| CRNC | 2.9 | Common @9.98 (2.9) — converted from 10C Aug (see §3) |
| CXDO | 2.8 | Common @6.93 (2.8) — converted from 7.5C Jul (see §3) |
| MITK | 4.1 | Common @13.28 (3.69) · 12.5C Nov'26 @3.70 (0.41) |
| IRDM | 3.4 | 22.5C Jul17'26 @3.35 (3.4) — options-only |
| LEU | 1.5 | Common @96.94 (1.5) |
| AMZN | 0.8 | Common @88.93 (0.8) |
| HOOD | 0.8 | Common @19.74 (0.8) |
| TSLA | 0.8 | Common @19.38 (0.8) |
| ARKK | 0.7 | 70P Jun18'26 @0.83 (0.7) — hedge (PUT) |

---

## §2 — Close/conversion timeline (from live-notes, user-provided 2026-06-15)

| Date | Event |
|---|---|
| 5/15 | ADEA `30C Jun'26` **converted→shares** (sold, Common@30.10 opened, kept 30C Sep); AMZN `300C Jan'27`, AVAV `175C Sep'26`, KTOS `35C&40C Jan'27` leaps closed (BP for new positions) |
| 5/21 | MITK `12.5C Nov'26` entry revised 3.70→**3.77** (upsize 2.9%→4.7%) |
| 5/28 | P `75C Aug'26` fully closed (kept AMSC shares) |
| 6/3 | PLPC common closed; KTOS common closed (options were 5/15) |
| 6/5 | RDCM, VLN, AMSC commons closed; AMRC `35C Oct'26` closed |
| 6/10 | BB `6C Sep'26` closed **+300%** (host-stated) |
| 6/11 | **Contract→shares wave**: IRDM trimmed to ~4% (stays open); FIVN +Common@20.48, `25C Oct'26` closed (kept 22.5C); ARKK `70P Jun18` hedge opened @0.83; SHLS +Common@9.41 (`10C Oct'26` closed); CXDO +Common@6.93 (`7.5C Jul'26` closed); CRNC +Common@9.98 (`10C Aug'26` closed); GDYN +Common@6.34 (`5C Jun18`+`5C Sep18` closed); LUMN `7C Jan'27` closed; BLDP `4C`+`5C Aug'26` closed; ARRY `9C Aug'26` closed **at a LOSS** |
| 6/5–6/12 | ADEA `30C Sep'26` closed; MITK `12.5C Jul'26` closed (dates not in notes) |

### DEFINITIVE closed (clean exit + realized%)
| Ticker | Leg | Entry | Exit | Realized% | Source |
|---|---|---|---|---|---|
| KTOS | Common | 22.34 | 58.22 | +160.6 | backup |
| PLPC | Common | 192.16 | 390.17 | +103.1 | backup |
| VLN | Common | 1.57 | 2.10 | +33.8 | backup |
| HII | Common | 292.94 | 296.41 | +1.2 | backup |
| AMSC | Common | 41.22 | 41.58 | +0.9 | backup |
| RDCM | Common | 12.91 | 12.32 | −4.6 | backup |
| RNG | 50C Jun'26 | 3.63 | 0 | −100 | EXPIRED_WORTHLESS (user) |
| BB | 6C Sep'26 | 0.87 | ~3.48 | **+300** | host-stated (6/10) |
| ADEA | 30C Jun'26 | 1.50 | — | (null) | sold/converted→shares 5/15 |

Pre-5/1 closed (DPRO, GLDD, GME, ITRI, PANL, SQQQ, THR): already Closed, leave as-is.

---

## §3 — FINAL exit ledger (user-researched mid-market midpoints, 2026-06-15)

⚠️ Backup `ibkr_legs` marks were **discarded** — user's researched closing prices show many were
wrong (multiple "gains" were actually losses). Exit = midpoint of the user-provided range.

### Closed option legs on STILL-OPEN positions
| Ticker | Closed leg | Entry | Exit | Realized% | Closed |
|---|---|---|---|---|---|
| ADEA | 30C Jun'26 | 1.50 | 1.50* | ~0 (SOLD, not exercised) | 5/15 |
| ADEA | 30C Sep'26 | 3.58 | 4.83 | +34.9 | ~6/11 |
| AMZN | 300C Jan'27 | 11.90 | 18.15 | +52.5 | 5/15 |
| FIVN | 25C Oct'26 | 3.70 | 1.90 | −48.6 | 6/11 |
| MITK | 12.5C Jul'26 | 1.77 | 4.13 | +133.1 | 6/11 |
| GDYN | 5C Jun18'26 | 1.10 | 1.45 | +31.8 | 6/11 |
| GDYN | 5C Sep18'26 | 1.51 | 2.00 | +32.5 | 6/11 |
| SHLS | 10C Oct'26 | 1.95 | 1.58 | −19.2 | 6/11 |
| CRNC | 10C Aug'26 | 1.85 | 1.90 | +2.7 | 6/11 |
| CXDO | 7.5C Jul'26 | 0.65 | 0.43 | −34.6 | 6/11 |

### Fully-closed positions
| Ticker | Leg | Entry | Exit | Realized% | Closed |
|---|---|---|---|---|---|
| KTOS | Common | 22.34 | 58.22 | +160.6 | 6/3 |
| KTOS | 35C Jan'27 | 54.00 | 21.15 | −60.8 | 5/15 |
| KTOS | 40C Jan'27 | 49.50 | 16.90 | −65.9 | 5/15 |
| PLPC | Common | 192.16 | 390.17 | +103.1 | 6/3 |
| VLN | Common | 1.57 | 2.10 | +33.8 | 6/5 |
| HII | Common | 292.94 | 296.41 | +1.2 | 6/3 |
| AMSC | Common | 41.22 | 41.58 | +0.9 | 6/5 |
| RDCM | Common | 12.91 | 12.32 | −4.6 | 6/5 |
| RNG | 50C Jun'26 | 3.63 | 0 | −100 (EXPIRED) | ~6/18 |
| BB | 6C Sep'26 | 0.87 | 3.48 | +300 (host) | 6/10 |
| P | 75C Aug'26 | 8.80 | 4.40 | −50.0 | 5/28 |
| ARRY | 9C Aug'26 | 1.54 | 0.50 | −67.5 | 6/11 |
| AVAV | 175C Sep'26 | 31.90 | 15.25 | −52.2 | 5/15 |
| AMRC | 35C Oct'26 | 4.59 | 1.30 | −71.7 | 6/5 |
| BLDP | 4C Aug'26 | 0.90 | 0.68 | −25.0 | 6/11 |
| BLDP | 5C Aug'26 | 0.60 | 0.27 | −55.0 | 6/11 |
| LUMN | 7C Jan'27 | 2.86 | 2.48 | −13.5 | 6/11 |
| LUMN | 8C May'26 | 0.93 | 0.77 | −17.7 | ~5/8 |
| LUMN | 8C Jul'26 | 1.17 | 5.55 | +374.4 | ~5/8 |

Pre-5/1 closed (DPRO, GLDD, GME, ITRI, PANL, SQQQ, THR): already Closed, leave as-is.

### Ledger COMPLETE (2026-06-15)
All entries/exits resolved. `*` = estimate (ADEA 30C Jun'26 exit 1.50, web lookup couldn't pin the
exact 5/15 premium — ATM, sold at ~entry; user may correct). KTOS LEAP entries (54.00/49.50) were
deep-ITM buys 9/26/25 @ stock $86.28; sold 5/15 @ stock ~$56 → real losses despite the common's +161%.

---

## Phantom legs being dropped (never in any snapshot)
ADEA 30C Jun'26 · CXDO 10C Oct'26 · AMZN 250C Jan2028 · HOOD 80C Jun'26 · ENS 115C Mar'26 ·
GDYN 7C Oct'26 · SYNA 85C Mar'26 · AMKR extra commons + 25C Mar/30C Jun · HII extra common + 285C Mar ·
VIAV extra commons + 14C Mar · CRNC/CXDO duplicate/closed phantom option rows · KTOS phantom Jan'27 dupes.
