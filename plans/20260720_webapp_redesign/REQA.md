# Redesign — RIGOROUS element-level re-QA (handover)

> The first QA pass (see QA.md) was structure-only and NOT trustworthy — the host proved it on the
> detail panes. This is the **rigorous** pass: diff the **live DOM** (logged-in app) against the
> **byte-exact** `.dc.html` ref markup, element by element, and **match the mock exactly** on copy.
> Fix real deltas, commit per coherent unit, keep the branch green (typecheck).

## HOW TO RUN (same as QA.md)
- `corepack pnpm --filter web dev` (→ :5173) + `--filter admin dev` (→ :5174). Both auth-gated.
- Auth for QA: the host signs in via **Claude-in-Chrome** (the in-app preview pane sign-in didn't work).
  Session is per-origin — bring web up **on :5173** so the existing Chrome session is reused.
- Diff method: extract app DOM text (Chrome `javascript_tool`, read a pane/section's `innerText`),
  compare to the ref's static copy. Refs: `plans/20260720_webapp_redesign/refs/*.dc.html`
  (Detail Panes ref was comment-only locally → the byte-exact markup is in the design project
  `design_handoff_stw_companion/…`, re-fetch via the DesignSync MCP, project 665f2470-…).
- **VALUES differ (demo vs real prod data) and are NOT defects** — only static copy/labels/structure count.

## OPERATING PRINCIPLES (host rulings — apply to ALL screens)
- **PR1** App richer than the mock → **KEEP** the rich real-data detail + **ADD** any missing mock
  label/explanatory copy. Only strip to the mock when the host says so per-case.
- **PR2** Mock copy that is **factually WRONG** for the app's data model → **SKIP** it (keep the app
  truthful); note each skip. (e.g. the mock's "grown by the run-up, not adds" is false — leg weight
  is cost-basis %, changed by adds/trims, not price — so it was skipped.)
- **Copy** otherwise: **match the mock exactly** (host).

## GLOBAL items (decided + implemented)
- **G1 — canonical sizing wording (DONE, shared).** `sizingTone.label` = "N points heavier/lighter"
  (state + locked oversized=amber / undersized=indigo colors unchanged). Detail-pane suffix
  "≈ $X more/less". Tailing tab "heavier/lighter than STW". `sizing.test.ts` updated.
- **G2 — "+" on gains (DONE for My Portfolio; shared helper built).** New `@stw/shared` `formatMoney(v,{signed})`.
  Gains show "+", losses "-$…", neutral totals unsigned. Applied: position pane, PortfolioPage
  (Positions P&L col, group P&L, Overview movers). **When re-QAing the remaining screens, apply the
  same at any NEW $-gain site you find** (Picks Overview/Trades use %/pts, Risk shows caps/drawdown —
  no $ gains there, so nothing was needed).
- **G3 — minus glyph (DEFERRED, cosmetic).** Drawdown/rung/loss numbers use hyphen "-"; mock uses
  typographic minus "−". App-wide, low priority — batch at the end if wanted.

## STATUS — per view
| View | Rigorous status |
|---|---|
| **Position detail pane** | ✅ DONE — commits 400c304, d783198 (stats + risk-plan one-card + rungs "keep ≤" + advisory) |
| **Pick detail pane** | ✅ DONE — 380d4b9 ("you don't tail this pick"), 0a87ecf ("Your personal note" split section). K1/K2/K3 resolved via PR1/PR2 (kept rich; skipped false "grown by run-up"). |
| Global G1 (sizing) | ✅ DONE — a480408 |
| Global G2 (+gains) | ✅ DONE (My Portfolio) — 2bcfc3e + 6daca5b |
| Profile | ⬜ needs rigorous re-diff |
| Settings | ⬜ needs rigorous re-diff (note: cap-row labels use shared FormRow uppercase micro-label vs mock's 12px sentence-case — was S1; primitive-reuse call, decide) |
| Macro | ⬜ needs rigorous re-diff (M1: "ON THE RADAR" constituents are plain spans not TickerLinks — likely intentional, no detail page; M2: raw JSON parse-error string leaks on calendar failure — local dev has no Netlify functions) |
| GEX Signals | ⬜ needs rigorous re-diff |
| My Portfolio · Overview | ⬜ needs rigorous re-diff (G2 already applied) |
| My Portfolio · Risk | ⬜ needs rigorous re-diff |
| My Portfolio · Tailing | 🟡 G1 wording done; rest needs re-diff |
| My Portfolio · Positions list | ⬜ needs rigorous re-diff (L1: 2nd filter row overflows at 1440, scrolls — minor) |
| Stock Picks · list | ⬜ needs rigorous re-diff |
| Stock Picks · Overview | ⬜ needs rigorous re-diff |
| Stock Picks · Trades | ⬜ needs rigorous re-diff |
| Admin · Edit-position + Log-a-transaction | ⬜ needs rigorous re-diff |

## OPEN QUESTIONS for the host (non-blocking, flagged during the pass)
- **T1** Position pane: the ↗ icon opens *STW's tracked position*; the mock's affordance is an inline
  link "Compare all on Tailing →" (different destination — the Tailing tab). Follow mock, or keep ↗?
- Delete-account support email stays `cc@claudiachez.com` (confirmed this session).

## CONSTRAINTS (unchanged)
- Don't push / open the PR without explicit host go-ahead. Never touch the staging→main promotion.
- Migrations 077/078/079 already applied to PROD. Frozen regime gate. Locked event-sourcing + P&L-split.
- After QA is clean + host go-ahead: `/stw-review` → push `claude/webapp-redesign` → ONE PR to `staging`.
