# GEX / Positioning re-platform — Discord Graddox → FlashAlpha

**Status:** the visible replace is DONE (card + regime composite sleeve + score strip + persisted 5D
history), SLOPE 20 signed off by the host. The recap-grounding swap is a flagged follow-on (step 6).
Branch: `claude/macro-trend-direction`. **Verification pending** the FlashAlpha key + migration 067.

**Decision (host, 2026-07-10):** the Macro tab's GEX / Positioning module (Module 8) moves off the
once-daily Discord-sourced **Graddox** signal onto the **FlashAlpha** GEX API — including the Market
**composite** regime score's GEX sleeve. Start on FlashAlpha's **free tier** (SPY proxy, 5 req/day,
single expiry); a paid key later unlocks real SPX with no code change. The Signals tab keeps using
Graddox — this change is scoped to the Macro tab + the composite, and does NOT touch the frozen
two-component regime **gate** (engine_version 1.1.0).

## Architecture — why a scheduled writer, not a `fred`-style proxy
FlashAlpha free = **5 requests/DAY**, so the browser can never call it directly (a handful of page
loads would exhaust the quota). Pattern mirrors `macro-snapshot` / `signals`:

> `gex-snapshot` scheduled Netlify fn (web only, ~2×/weekday) → FlashAlpha SPY → derive levels +
> sleeve score → upsert one `gex_snapshots` row → **every client + the macro-snapshot writer read
> Supabase**, never FlashAlpha.

Run the writer on **one site only** (`apps/web`) to spend ~2 req/day, not 4 — clients read the table
cross-site.

## Landed already (this branch)
- `packages/shared/src/utils/gex.ts` — `FlashAlphaGexResponse`/`GexLevels` types, `deriveGexLevels`
  (net GEX + flip native; call wall = max `call_gex` strike, put wall = max `put_gex` strike),
  **`gexSleeveScore(spot, gammaFlip)`** (the regime-moving formula, below), `gexPositioningLabel` /
  `gexPositioningImplication`. Exported from the shared barrel.
- `packages/shared/src/utils/gex.test.ts` — 10 tests (derive, walls, clamps, null-handling, labels).
- `supabase/migrations/067_gex_snapshots.sql` — `gex_snapshots` table (date/session/symbol,
  spot/flip/net_gex/label, derived call_wall/put_wall, `sleeve_score`, `as_of`, `raw`), RLS
  read-only for `authenticated`, service-role writes. **Not yet applied.**

## The GEX-sleeve scoring formula (needs host sign-off — it moves the headline regime number)
Positioning is read off **spot vs the gamma-flip**: above flip = positive-gamma (dealers dampen
volatility → supportive → higher); below flip = negative-gamma (dealers amplify → fragile → lower).

```
cushionPct = (spot − gammaFlip) / spot × 100
score      = clamp(50 + cushionPct × SLOPE, 5, 95)      SLOPE = 20
```
- At the flip → **50** (pivot). +1% above → 70. −1% below → 30. Clamps at ±~2.25%.
- One tunable constant (`GEX_SLEEVE_SLOPE`). Replaces the old discrete `gexScore(bias)` (Bullish 90 /
  Flat 55 / Conflicted 35 / Bearish 10). The new score is continuous and derived from live
  positioning rather than a hand-typed bias word.

## Wiring — DONE (steps 1–5)
1. ✅ **`apps/web/netlify/functions/gex-snapshot.ts`** — scheduled `30 12,20 * * 1-5` UTC (~8:30am /
   ~4:30pm ET; session from the UTC hour). Fetches `GET .../gex/SPY?expiration=<nearest Friday>` with
   `X-Api-Key: FLASHALPHA_API_KEY` (`.trim()`'d, server-side, no `VITE_`), `deriveGexLevels` +
   `gexSleeveScore`, upserts `gex_snapshots` on `(symbol, snapshot_date, session)`, writes a `run_log`
   row (ok/error). Web site only (avoids double-spending the 5/day quota).
2. ✅ **`packages/ui/src/features/macro/useGexExposure.ts`** — reads the latest SPY `gex_snapshots` row.
3. ✅ **`GexPositioningCard.tsx`** (rewritten) — spot · gamma flip (+cushion) · call wall · put wall
   tiles + positioning label/implication + net-GEX line; `Source: FlashAlpha · SPY (index proxy)` footer.
4. ✅ **`MacroView.tsx`** — regime composite `gexSleeve = gex.sleeveScore`; strip GEX `detail =
   gexPositioningLabel`; card reads `useGexExposure`; GEX help tooltip rewritten. `useGraddox` retained
   ONLY to ground the recap (see step 6).
5. ✅ **`apps/web/netlify/functions/macro-snapshot.ts`** — persists the GEX sleeve from the latest
   `gex_snapshots` row (not the Graddox signal), so the stored 5D history matches the live sleeve.

## Follow-on (deferred, not yet done)
6. **Recap GEX grounding** — `recap-core.ts` (scheduled AM/PM), `macro-recap.ts` (manual), and the shared
   `MacroRecapRequest` type still ground the recap's GEX block on the Graddox `signals` row. Swapping
   these to the FlashAlpha levels is a 3-file + shared-type change whose client→server coupling is
   runtime JSON (not typechecked) and can't be verified without a live key + a recap run — so it's split
   out to avoid silently breaking recap generation. The recap keeps working on its current grounding in
   the interim (it already runs an independent approximate recompute using HYG/TNX, so it was never
   perfectly aligned with the tab).

## Manual action (host, outside repo)
- Sign up for a **free FlashAlpha API key** and add **`FLASHALPHA_API_KEY`** to the **web** Netlify
  site's env (server-side, no `VITE_`). Until then the code builds + typechecks but can't be verified
  against live data. (Admin site doesn't need it — the writer runs on web only.)
- Apply migration **067** to PROD + sandbox.

## Known limitations (free tier)
- **SPY, not SPX** — index proxy until a paid key. **Single expiry** (nearest Friday), not full-chain.
  15-min-ish freshness. All acceptable for a twice-daily composite input; revisit on a paid tier.

## Standing prohibitions carried through
- Regime multiplier stays advisory/display-only. The two-component **gate** and the Macro **composite**
  never blend; no new indicator enters the gate. This is a composite-sleeve *source* swap only.
