# STW Companion — Claude Code Guide

## Ground Rules
- If instructions seem to conflict, **always ask before doing anything**
- Never force-push or reset `admin-staging`, `admin-main`, `web-staging`, or `web-main`
- Never push to `admin-main` or `web-main` without explicit approval — those are production

---

## Two Apps, One Repo

| App | Audience | Folder | Staging URL | Production URL |
|---|---|---|---|---|
| Admin dashboard | STW editor | `admin/` | `stw-admin-staging.netlify.app` | `stw-admin.netlify.app` |
| Subscriber web app | Subscribers | `web/` | `stw-app-staging.netlify.app` | `stw-app.netlify.app` |

Changes to one app never affect the other. Each has its own Netlify site, staging branch, and production branch.

---

## Repo Structure

```
admin/
  index.html              — entire admin dashboard (HTML + CSS + JS, inline)
  ibkr_proxy.py           — IBKR local proxy (admin use only)
  migrate.js              — data migration helper
  requirements-ibkr.txt
web/                      — subscriber web app (React + Vite + TypeScript)
  index.html
  vite.config.ts
  tsconfig.json
  package.json
  tailwind.config.ts
  postcss.config.js
  .env.example
  src/
    main.tsx
    App.tsx
    index.css
    lib/
      supabase.ts         — Supabase client (anon key, env vars)
      query-client.ts     — TanStack QueryClient
    store/
      auth.ts             — Zustand: session, user, isLoading
    features/
      auth/               — LoginPage, AuthGuard, useSession
      picks/              — PicksPage, api, useHoldings, useFilters, components
      signals/            — SignalsPage, api, useGraddox, components
    shared/
      components/         — Layout, LoadingSpinner, EmptyState
      hooks/              — useTierAccess, useLivePrice
    pages/
      ProfilePage.tsx
packages/
  shared/                 — canonical TypeScript types + constants (shared package)
    src/
      types/              — Holding, GraddoxData, Profile, Tier
      constants/          — TIERS, BASKET_COLORS
      utils/              — format.ts, options.ts
supabase/
  migrations/
    001_existing.sql      — document existing holdings + graddox tables
    002_user_access.sql   — tiers + profiles tables with RLS + trigger
plans/
  clean-architecture.md   — architecture decisions and phased roadmap
CLAUDE.md                 — this file (common)
netlify.toml              — Netlify build config for subscriber web app
pnpm-workspace.yaml       — pnpm monorepo config
.gitignore
```

---

## Branch Strategy

| Branch | Contains | Deploys to |
|---|---|---|
| `admin-main` | `admin/` + root | Netlify "STW Admin" — prod |
| `admin-staging` | `admin/` + root | Netlify "STW Admin" — staging |
| `web-main` | `web/` + root | Netlify "STW App" — prod |
| `web-staging` | `web/` + root | Netlify "STW App" — staging |

Feature branches:
- `claude/admin-*` → branch from `admin-staging` → PR to `admin-staging` → PR to `admin-main`
- `claude/web-*` → branch from `web-staging` → PR to `web-staging` → PR to `web-main`

---

## Git Workflow

### Admin changes
```bash
git checkout -b claude/admin-my-feature origin/admin-staging
# make changes inside admin/ only
git push -u origin claude/admin-my-feature
# PR → admin-staging for review, then admin-staging → admin-main when approved
```

### Web app changes
```bash
git checkout -b claude/web-my-feature origin/web-staging
# make changes inside web/ only
git push -u origin claude/web-my-feature
# PR → web-staging for review, then web-staging → web-main when approved
```

---

## Admin Dashboard (`admin/index.html`)

### Deployment
- No build step — static file served directly from `admin/` folder
- Netlify "STW Admin": publish dir = `admin`, no build command
- Staging: auto-deploys on push to `admin-staging`
- Production: auto-deploys on push to `admin-main` (requires approval)

### Tabs
- **STW Stock Picks** — inline-editable holdings table (rank, ticker, name, conviction, basket, status, date, weight, price, position detail)
- **Users** — manage subscriber profiles (approve/reject, change tier); reads `profiles` table
- **Permissions** — define which modules each tier unlocks; reads/writes `tiers` table

### Code Rules
- Static HTML/JS/CSS — no build step, no framework
- All Supabase access uses the **anon key** + RLS (admin full access granted via `auth.email() = 'cc@claudiachez.com'`)
- Never put the service role key in admin/index.html

### Theme System
- **Default:** Dark mode
- **Toggle:** Hamburger menu → sun/moon icon switches between Light and Dark Mode
- Theme persisted to `localStorage` (`stwTheme` key), restored on `init()`
- Light theme applied via `[data-theme="light"]` on `<html>`
- Do not hardcode colors outside of `:root` or `[data-theme="light"]` — always use CSS variables

### Design System
- **Font:** Barlow Condensed (700/800) for logo, headers, login; system sans-serif for body
- **Logo:** STW mic + green arrow SVG — header (34px) and login page (90px)
- **Favicon:** SVG data-URI in `<head>`

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

## Subscriber Web App (`web/`)

### Deployment
- Built with Vite; served by Netlify
- Netlify "STW App": base = `web`, build = `npm ci && npm run build`, publish = `web/dist`
- Staging: auto-deploys on push to `web-staging`
- Production: auto-deploys on push to `web-main` (requires approval)

### Running locally
```bash
cd web
cp .env.example .env      # fill in Supabase + Finnhub keys
npm install
npm run dev               # http://localhost:5173
```

### Building locally
```bash
cd web
npm run build             # outputs to web/dist
npm run preview           # preview at localhost:4173
```

### Key Constraints
- `web/dist/` is gitignored — built by Netlify, never committed
- All env vars must be prefixed `VITE_` to be exposed to the browser
- Supabase anon key only — never a service role key in web/

### Auth (Supabase)
- Supabase project: `usmqbohcjcyszjxxvnqu.supabase.co`
- Credentials via `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` env vars
- `detectSessionInUrl: true` — PKCE auto-exchanged on OAuth redirect
- Google OAuth does a full-page redirect — add each Netlify URL to Supabase Auth → URL Configuration → Redirect URLs

### Routes (React Router v6)
```
/login        — LoginPage (email + Google OAuth)
/picks        — PicksPage (gated: approved users only, all tiers)
/signals      — SignalsPage (gated: basic/premium tier)
/profile      — ProfilePage (shows status + subscription tier)
```

### Tech Stack
| Concern | Choice |
|---|---|
| Framework | React 18 + TypeScript |
| Build | Vite |
| Navigation | React Router v6 |
| Styling | Tailwind CSS v3 |
| Server state | TanStack Query v5 |
| UI state | Zustand v5 |
| Backend | Supabase JS v2 |
| Auth | Supabase Auth + Google OAuth |
| Live prices | Finnhub WebSocket (VITE_FINNHUB_KEY) |

### Tier Access
- `useTierAccess(module)` hook checks `profiles.status === 'approved'` and `tiers.modules.includes(module)`
- Tiers defined in Supabase `tiers` table (managed by admin Permissions tab)
- Default tiers: `free` → picks only; `basic` → picks + signals; `premium` → picks + signals + portfolio + journal
