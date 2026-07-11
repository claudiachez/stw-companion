# GEX source → SPX Gamma Edge newsletter (2026-07-11)

**Status: IN PROGRESS (this session).** Branch `claude/gex-spx-gamma-edge-source` → PR to `staging`.

## Why

The Macro GEX / Positioning module (Module 8) needs a **fresh, real-index, free,
cloud-native** gamma-positioning source. The two prior attempts both fail one of those:

- **FlashAlpha (PRs #90–#93)** — its free tier gates **all ETF *and* index** GEX
  (SPY/QQQ/IWM/SPX require the paid Basic plan). Verified 2026-07-11: the writer
  `403`s `tier_restricted` on SPY, every tick. The free tier serves individual
  stocks only — not a market-regime signal. Pipeline is dark on the free key.
- **Graddox via Discord (`signals`)** — free and real-index, but the morning
  summary ends up built on **lagging ~24h data** (host objection, 2026-07-11);
  it's also machine-bound Discord ingestion.

**Chosen source: the SPX Gamma Edge newsletter** (`spxgammaedge.substack.com`) —
a free, publicly readable, **twice-daily** report on SPX dealer gamma:
`PREMARKET REPORT.` (~12:12 UTC, before the open) and `END OF SESSION REPORT.`
(~23:22 UTC, after close). The premarket report fixes the freshness gap. SPX is
the real index. The public **RSS feed** (`/feed`) carries the **full post body**
in `content:encoded`, so ingestion is a plain server-side `fetch` + parse — no
headless browser, no API key, no rate limit.

Host sign-off (2026-07-11): proceed on the terms **factual levels only, attributed
on the card, never the newsletter's prose verbatim** — market levels are facts,
not copyrightable expression. **SPX only** on the card (the source is SPX-only).

## What each report gives (the "Structural Read" block, consistent labels)

| Label | Premarket | EOD | Maps to |
|---|---|---|---|
| `Gamma Flip` | ~7,486 | ~7,495 | **gammaFlip** (drives the sleeve score) |
| `Implied Open` / `Session Close` | ~7,527 | 7,575.39 | **spot** (AM vs PM) |
| `Prior Close` | 7,543.64 | 7,543.64 | spot fallback |
| `Call Wall` | 7,600 | 7,600 | **callWall** |
| `Support Shelf` | 7,400 | 7,450 | **putWall** |
| `Aggregate GEX` | +101,111 | +156,633 | **netGex** (signed, newsletter units — NOT $) |
| `Peak Gamma` / `Pin Node` | 7,550 | 7,550 | context (raw) |
| `Upper Shelf` | 7,700 | 7,700 | context (raw) |

`netGexLabel` = sign of Aggregate GEX (`+`→positive, `−`→negative).

## Implementation

- **`@stw/shared/utils/gex.ts`** — remove the dead FlashAlpha types
  (`FlashAlphaStrike`, `FlashAlphaGexResponse`) + `deriveGexLevels`; add a pure,
  unit-tested **`parseGammaEdgeReport(text, kind)`** (colon-anchored label grab,
  null-on-missing). Keep `GexLevels`, `gexSleeveScore`, `gexPositioningLabel`,
  `gexPositioningImplication` unchanged. (Supersedes PR #94, which fixed a bug in
  the now-removed `deriveGexLevels`.)
- **`apps/web/netlify/functions/gex-snapshot.ts`** — rewrite the fetch layer:
  read the RSS feed → pick the session's report (`am`→PREMARKET, `pm`→EOD) →
  `content:encoded`→plain text → `parseGammaEdgeReport` → upsert `gex_snapshots`
  as `symbol='SPX'`, tagging the row with the **report's own ET date** (idempotent;
  a weekend/holiday run just re-upserts the last trading day's row — no stale
  overwrite, no `force` flag). Cron shifts to **`45 12,23 * * 1-5`** (12:45 UTC AM
  after the premarket publish; 23:45 UTC PM after the EOD publish). No more
  `FLASHALPHA_API_KEY` — only Supabase env.
- **`gex_snapshots`** — no migration; the `symbol` column already exists (default
  `SPY`). We just write `SPX`. `net_gex` now holds the newsletter's signed
  aggregate figure (its own units), `raw` stashes the extra levels.
- **UI** — `useGexExposure` reads `symbol='SPX'`; `GexPositioningCard` attributes
  "SPX Gamma Edge · SPX", relabels Net GEX → **Aggregate GEX** and prints it as a
  signed integer (not `$B`); `MacroView` source line updated. `macro-snapshot`
  reads `symbol=eq.SPX` for the composite sleeve.

## Standing prohibitions (unchanged)

GEX feeds the Macro **composite** only, never the frozen two-component regime
**gate** (engine 1.1.0). The gate and composite never blend.

## Follow-ups (not in this PR)

- **Recap GEX grounding** (`recap-core.ts`, `macro-recap.ts`) still grounds on the
  Graddox `signals` row. That's free + functional and never cited FlashAlpha, so
  the old "TASK 2" swap is **obsolete**. Optionally re-point it at the fresher
  `gex_snapshots` (SPX Gamma Edge) later — client→server JSON coupling, own change.
- `FLASHALPHA_API_KEY` on the Netlify sites is now unused — safe to remove.
- Longevity: if the newsletter ever paywalls the RSS full-content, the parser
  yields nulls → surfaces honestly (no fabrication), visible via `run_log`.
