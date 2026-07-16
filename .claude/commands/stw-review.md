---
description: Pre-PR self-review — check the working diff against STW's standing conventions before opening a PR
---

Review the **current working diff** (`git diff` against `origin/staging`) against the STW
conventions below, BEFORE opening a PR. These are the conventions that lint/CI can't enforce
(they're semantic), and the ones most often missed. Go item by item; for each, state PASS,
FIX (and fix it), or N/A. Do not open the PR until every applicable item is PASS.

This is a gate I run every time, not a doc to recall — the whole point is to stop shipping
convention misses that "compile fine". Read the actual changed lines; don't assume.

## 1. Every displayed value carries source + as-of date
For any NEW number/metric/price/status on screen:
- [ ] Names its **source** (Finnhub / IBKR / FRED / STW diary), the way the sibling surface does.
- [ ] Carries an **as-of timestamp** via `fmtDateTime` from `@stw/shared` (`Mon D · H:MM AM ET`).
      Never hand-format a full timestamp. (Date-only like `action_date`, or a compact intraday
      tag, are the only exceptions.)
- [ ] A price block mirrors `HoldingDetail`'s treatment: `Finnhub · <time>` live, `IBKR · <sync>` fallback.

## 2. Reuse shared logic — never re-implement
- [ ] Dates → `fmtDateTime`; option expiry → `fmtOptionExpiry`; leg instrument → `fmtLegInstrument`;
      money/pct/weight → the shared helpers. If you wrote a month-name array or a date `.slice()`,
      a shared helper already exists — use it.
- [ ] Derived-number logic lives in `@stw/shared`, not inline in an app/component.

## 3. Parallel surfaces stay in parity
- [ ] Changed a Netlify function? Edit **both** `apps/web/netlify/functions/*` AND
      `apps/admin/netlify/functions/*` copies (run `pnpm check:fn-parity`).
- [ ] Changed a detail pane? The twin (`HoldingDetail` ↔ `PortfolioPositionDetail`) matches.
- [ ] Added a user-facing field to a row? Its filter + sort control was added to every list
      surface that shows it (Stock Picks / Trades / My Portfolio), in the canonical order.
- [ ] Added a page-level data fetch (e.g. live quotes) that a sibling page also needs? It's a
      shared hook, not inline.

## 4. UI matches the app, not a new one
- [ ] Reuses an existing primitive/idiom (`DetailPane`, `KpiCard`, `StatusPill`, the P&L-row
      style, table `th`/`td`) — no bespoke chips/cards/underlines that appear nowhere else.
- [ ] Every ticker shown is a `TickerLink` to its detail page (except the documented Macro
      index/ETF exception — those have no detail page).
- [ ] Works at ≤390px (multi-column stacks; overflow columns hidden via `useIsMobile`).
- [ ] Timestamps right-aligned; white text on green; sentence case.

## 5. Standing prohibitions (risk/regime engine)
- [ ] Regime gate frozen at engine 1.1.0; advisory/display-only; the two-component gate and the
      Macro composite never blend; no new indicators enter the gate.

## 6. Render before "done" (UI changes)
- [ ] For any change observable in the app, actually render it (dev server or staging login) and
      look at the real pane — don't ship on typecheck+lint alone. Screenshot the changed surface.

## 7. Mechanics
- [ ] On a `claude/<feature>` branch, not `staging`. Typecheck + lint + tests green locally.
- [ ] Migrations (if any) called out for the host to apply — a merged PR ≠ a migrated DB.

Report the checklist result, then proceed to the PR only if clean.
