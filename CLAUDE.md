# STW Companion — Claude Code Guide

## Ground Rules
- If instructions seem to conflict, **always ask before doing anything**
- Never force-push or reset `staging` or `main`
- Never push to `main` without explicit approval — that is production
- Write shared styling/logic/data **once** in the shared packages, never twice across apps

---

## One Monorepo, Two App Shells

This is a single pnpm workspace. Two thin app shells consume the same shared
packages and differ only by **capability**, never by forked components.

| App | Audience | Folder | Capabilities |
|---|---|---|---|
| Subscriber web | Subscribers | `apps/web` | Supabase auth + tier paywall (`AccessGate`) |
| Admin dashboard | STW editor | `apps/admin` | No paywall; Edit form, Users tab, IBKR badge + proxy writer |

Each deploys to its own Netlify site from the **same branch** (base dir differs).

---

## Repo Structure

```
pnpm-workspace.yaml          → packages/*, apps/*
package.json                 → workspace scripts (dev:web, dev:admin, build, typecheck, test)
packages/
  shared/  (@stw/shared)     pure framework-agnostic logic: types, tiers, baskets,
                             format, options, pnl, filters (+ unit tests)
  ui/      (@stw/ui)         shared React: feature pages/components, data hooks,
                             supabase/query-client factories, AppCapabilities context
apps/
  web/                       subscriber shell: router, Layout, auth, AccessGate
    netlify.toml             (Netlify base dir = apps/web)
  admin/                     admin shell: no paywall, Edit + Users + IBKR
    ibkr_proxy.py            local IBKR writer (run on your machine, not deployed)
    netlify.toml             (Netlify base dir = apps/admin)
supabase/migrations/         001..006 — single source of truth for DB schema/RLS
CLAUDE.md                    this file
```

### Layer rules (keep them honest)
- `@stw/ui` takes everything via **props/context** — no app-specific imports, no env,
  no routes. The Supabase client + `VITE_*` env are created in each app and injected.
- Admin/subscriber differences flow through **one `AppCapabilities` context**
  (`isAdmin`, `canEdit`, `onEditHolding`, `showIbkrBadge`) — never scatter `isAdmin`
  checks deep in shared components.
- `@stw/shared` is the only home for derived-number logic (P&L, weights, sector %).
  Don't re-implement it in an app. (End state: move the math into Supabase views/RPC.)

---

## Branch Strategy

| Branch | Purpose | Deploys to |
|---|---|---|
| `main` | Production | both Netlify sites — prod |
| `staging` | Trunk / staging | both Netlify sites — staging |

Feature branches: `claude/<feature>` → branch from `staging` → PR to `staging` →
PR `staging` → `main` when approved.

```bash
git checkout -b claude/my-feature origin/staging
# work across packages/* and apps/*; shared change is written once
git push -u origin claude/my-feature
# PR → staging for review, then staging → main when approved
```

---

## Local Development

```bash
pnpm install            # installs the whole workspace
pnpm dev:web            # subscriber app (Vite)
pnpm dev:admin          # admin app (Vite)
pnpm build              # pnpm -r build across packages + apps
pnpm typecheck          # pnpm -r typecheck
pnpm test               # unit tests (@stw/shared)
```

Env: each app needs `VITE_FINNHUB_KEY` (live prices) and the Supabase URL + anon
key (in `.env`, gitignored; see `apps/web/.env.example`).

---

## Deployment (Netlify)

Two sites, one repo, same branch — distinguished by **base directory**:
- Web site: base dir `apps/web`, build `pnpm install && pnpm --filter web build`, publish `dist`
- Admin site: base dir `apps/admin`, build `pnpm install && pnpm --filter admin build`, publish `dist`

`staging` branch → staging deploy; `main` → production (requires approval). Build
config lives in each app's `netlify.toml`; base dir + env vars are set in the
Netlify dashboard.

Add each Netlify URL to Supabase Auth → URL Configuration → Redirect URLs (Google
OAuth on web does a full-page redirect).

---

## Database (Supabase)

- Project: `usmqbohcjcyszjxxvnqu.supabase.co`; client created per-app and injected into `@stw/ui`.
- `supabase/migrations/` is the single source of truth (001 base schema, 002 user
  access, 003 price/pnl columns, 004 holdings admin-write RLS, 005 run_log, 006
  exit-pnl + digest). **Claude authors migrations; you apply them** via the Supabase
  SQL editor / `supabase db push`.
- Tables: `holdings`, `graddox`, `graddox_levels`, `profiles`, `tiers`, `run_log`.
  RLS restricts all writes to `cc@claudiachez.com`; admin app must log in as that
  account. The IBKR proxy is the only writer of `last_pnl_*` / `ibkr_legs`.

---

## IBKR Pipeline (admin only)

`apps/admin/ibkr_proxy.py` is a **local** Flask server (`localhost:8765`, self-signed
TLS) that talks to IB Gateway (`127.0.0.1:4001`) via `ib_insync`. The admin browser
calls it to price option legs, then writes `last_pnl_pct` / `last_pnl_at` /
`ibkr_legs` to Supabase. Web only **reads** those columns (with a last-synced
fallback when the proxy is down). Run it locally with IB Gateway connected; it is
never deployed.

---

## Design System

- **Font:** Barlow Condensed (700/800) for logo, headers, login; system sans-serif for body
- **Logo:** STW mic + green arrow SVG
- **Default theme:** Dark. Toggle persists to `localStorage` (`stwTheme`); light
  theme applied via `[data-theme="light"]`. Never hardcode colors outside `:root` /
  `[data-theme="light"]` — always use CSS variables.

#### Color Variables (`:root`)
| Variable | Value | Usage |
|---|---|---|
| `--bg` | `#0a0a0a` | Page background |
| `--surface` | `#111111` | Cards, header |
| `--s2` | `#1a1a1a` | Secondary surfaces |
| `--border` | `#2a2a2a` | Borders |
| `--bsub` | `#1f1f1f` | Subtle dividers |
| `--text` | `#f0f0f0` | Primary text |
| `--t2` | `#a0a0a0` | Secondary text |
| `--t3` | `#525252` | Muted text |
| `--acc` | `#22c55e` | STW green |

#### Tier Colors
| Tier | Color | Meaning |
|---|---|---|
| `--c5` | `#22c55e` | Highest conviction |
| `--c4` | `#3b82f6` | High conviction |
| `--c3` | `#f59e0b` | Moderate |
| `--c2` | `#6b7280` | Waning interest |
| `--c1` | `#ef4444` | Concern |
| `--c0` | `#52525b` | Legacy |

---

## Tech Stack
| Concern | Choice |
|---|---|
| Framework | React 18 + Vite 5 + TypeScript |
| Workspace | pnpm workspace (no Turborepo/Nx) |
| Routing | react-router-dom 6 |
| Data | TanStack Query 5 (60s staleTime) |
| State | Zustand 5 |
| Backend | Supabase (auth + Postgres + RLS) |
| Prices | Finnhub (live), IBKR proxy (options legs) |
| Styling | Tailwind 3 + CSS variables |
