# Webapp redesign — QA brief

Pixel/fidelity QA of the redesign against the Claude Design refs. Read
`plans/20260720_webapp_redesign/FLAGS.md` first — it lists every DELIBERATE deviation; those are NOT bugs.

```
DESIGN_REFERENCE : Claude Design project "STW Companion Web App Redesign"
                   https://claude.ai/design/p/665f2470-f119-40cb-9e5c-de3d86ad62d8
                   (project id 665f2470-f119-40cb-9e5c-de3d86ad62d8)
                   Local mirror (gitignored, this machine): plans/20260720_webapp_redesign/refs/*.dc.html
                   — open a .dc.html with support.js beside it to render a ref, or re-fetch via the
                     Claude Design MCP. The <script data-dc-script> block in each is the demo-data shape.
IMPLEMENTATION   : repo root "."  ·  branch: claude/webapp-redesign (LOCAL, unpushed)
                   subscriber app = apps/web  ·  admin app = apps/admin  ·  shared UI = packages/ui
RUN_COMMAND      : web   → corepack pnpm --filter web dev      (→ :5173)
                   admin → corepack pnpm --filter admin dev    (→ :5174)
                   (pnpm not on PATH → use ~/.local/bin/pnpm. Names live in .claude/launch.json.)
APP_URL          : web http://localhost:5173  ·  admin http://localhost:5174   (BOTH auth-gated — sign in)
VIEWPORTS        : 1440x900 (desktop) · 768x1024 (tablet) · 390x844 (mobile) — check EACH in BOTH themes
                   (light + dark; toggle at Profile → Preferences → Theme). ≤390px is a hard rule.
                   NB content columns are max-width capped per screen (see below) — desktop = centered
                   column, not full-bleed.
TOLERANCES       : spacing ±1px · colors exact · type metrics exact · flag per-screen pixel mismatch > 0.1%
                   — EXCEPT the known-intentional deviations listed at the bottom (do not file those).
```

## ROUTES / SCREENS → design ref
Web (apps/web):
| Screen | Route / where | .dc.html ref | col max-w |
|---|---|---|---|
| Profile | `/profile` | Profile - Redesigned | 560 |
| Settings | `/settings` | Settings - Redesigned | 780 |
| Macro | `/macro` | Macro - Redesigned | 900 |
| GEX Signals | `/signals` | GEX Signals - Redesigned | 900 |
| My Portfolio · Overview | `/portfolio` (Overview tab) | Overview Tab - Redesigned | 860 |
| My Portfolio · Risk | `/portfolio` (Risk tab) | Risk Tab - Redesigned | 860 |
| My Portfolio · Tailing | `/portfolio` (Tailing tab) | Tailing Tab - Redesigned | 860 |
| My Portfolio · Positions list | `/portfolio` (Positions tab) | Listing Pages - Unified (right pane) | — |
| Stock Picks · list | `/picks` (Ticker Details) | Listing Pages - Unified (left pane) | — |
| Stock Picks · Overview & Trades | `/picks` (Overview + Transactions sub-tabs) | Picks Overview & Trades - Redesigned | — |
| Detail panes (position + pick) | click any ticker (Portfolio / Picks) | Detail Panes - Unified | ~480/pane |

Admin (apps/admin): Edit-position + Log-a-transaction modals — `/picks` → a pick's detail → **Edit position** /
the ledger's **+ Add event** — `Admin Forms - Redesigned`.

## Known-intentional deviations — DO NOT file as bugs (full list: FLAGS.md)
- **Info/blue** — the design's sky `--blue` (#0284c7) is deliberately the codebase's existing info token
  (`--c4`, indigo) per host direction ("not about color — data"). So the Tailing "you hold less" bar,
  option-leg chips, and the GEX "key target" line read INDIGO, not sky. (colors otherwise exact — the
  status pos/warn/neg tokens are byte-identical to the design values.)
- **Font px with no token snap to the nearest** — e.g. detail-pane stat 19→20; header title weight 700 vs
  mock 800; a few section radii 8 vs mock 10. (The `FONT_SIZE` scale WAS expanded to the design's ladder,
  so 9/13/15/16/20/22/26/30 are exact — only 19 and the two above have no token.)
- **Deliberate content omissions:** GEX per-setup sparkline (no intraday data); admin "Save + place real
  IBKR order" footer button (no combined handler); Picks-Overview "vs yesterday" delta (no data plumbed);
  Settings "reset to preset" banner (no client preset); Macro per-event setup prose folded into the AI recap.
- **Not visually verified by the builder** (auth-gated) — this QA pass is the first real render, so treat
  everything as unconfirmed until seen. Real data comes from the configured Supabase (PROD).
