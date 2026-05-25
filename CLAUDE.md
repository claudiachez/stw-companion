# STW Companion — Claude Code Guide

## Ground Rules
- If instructions seem to conflict, **always ask before doing anything**
- Never force-push or reset `admin-staging`, `admin-main`, `mobile-staging`, or `mobile-main`
- Never push to `admin-main` or `mobile-main` without explicit approval — those are production

---

## Two Apps, One Repo

| App | Audience | Folder | Staging URL | Production URL |
|---|---|---|---|---|
| Admin dashboard | STW editor | `admin/` | `stw-admin-staging.netlify.app` | `stw-admin.netlify.app` |
| Mobile web app | Subscribers | `mobile/` | `stw-mobile-staging.netlify.app` | `stw-mobile.netlify.app` |

Changes to one app never affect the other. Each has its own Netlify site, staging branch, and production branch.

---

## Repo Structure

```
admin/
  index.html              — entire admin dashboard (HTML + CSS + JS, inline)
  ibkr_proxy.py           — IBKR local proxy (admin use only)
  migrate.js              — data migration helper
  requirements-ibkr.txt
mobile/
  app/                    — screens and routes (expo-router)
  components/             — shared UI components
  lib/                    — supabase client, theme, types
  store/                  — Zustand auth store
  assets/                 — icon and images
  app.json  package.json  babel.config.js  metro.config.js
  tailwind.config.js  tsconfig.json  global.css
plans/
  mobile-transition.md    — architecture decisions and phased roadmap
CLAUDE.md                 — this file (common)
netlify.toml              — Netlify build config for mobile only
.gitignore
```

---

## Branch Strategy

| Branch | Contains | Deploys to |
|---|---|---|
| `admin-main` | `admin/` + root | Netlify "STW Admin" — prod |
| `admin-staging` | `admin/` + root | Netlify "STW Admin" — staging |
| `mobile-main` | `mobile/` + root | Netlify "STW Mobile" — prod |
| `mobile-staging` | `mobile/` + root | Netlify "STW Mobile" — staging |

Feature branches:
- `claude/admin-*` → branch from `admin-staging` → PR to `admin-staging` → PR to `admin-main`
- `claude/mobile-*` → branch from `mobile-staging` → PR to `mobile-staging` → PR to `mobile-main`

---

## Git Workflow

### Admin changes
```bash
git checkout -b claude/admin-my-feature origin/admin-staging
# make changes inside admin/ only
git push -u origin claude/admin-my-feature
# PR → admin-staging for review, then admin-staging → admin-main when approved
```

### Mobile changes
```bash
git checkout -b claude/mobile-my-feature origin/mobile-staging
# make changes inside mobile/ only
git push -u origin claude/mobile-my-feature
# PR → mobile-staging for review, then mobile-staging → mobile-main when approved
```

---

## Admin Dashboard (`admin/index.html`)

### Deployment
- No build step — static file served directly from `admin/` folder
- Netlify "STW Admin": publish dir = `admin`, no build command
- Staging: auto-deploys on push to `admin-staging`
- Production: auto-deploys on push to `admin-main` (requires approval)

### Code Rules
- Do not change any JS logic, data structures, or API calls
- Do not restructure the HTML
- Do not rename or remove CSS classes/IDs — only change property values
- Portfolio data lives in `<script id="stw-data-block">` — do not edit manually

### Theme System
- **Default:** Dark mode
- **Toggle:** Hamburger menu → sun/moon icon switches between Light and Dark Mode
- Theme persisted to `localStorage` (`stwTheme` key), restored on `init()`
- Light theme applied via `[data-theme="light"]` on `<html>`
- Charts (LightweightCharts) re-themed live via `chart.applyOptions()` on toggle
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

## Mobile App (`mobile/`)

### Deployment
- Built with Expo for web; served by Netlify
- Netlify "STW Mobile": publish dir = `mobile/dist`, build = `cd mobile && npm ci && npm run build:web`
- Staging: auto-deploys on push to `mobile-staging`
- Production: auto-deploys on push to `mobile-main` (requires approval)

### Running locally
```bash
cd mobile
npx expo start          # scan QR with Expo Go on your phone
```

### Building for web locally
```bash
cd mobile
EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1 npm run build:web   # outputs to mobile/dist
npx serve dist                                          # preview at localhost:3000
```
`EXPO_OFFLINE=1` is needed in this cloud environment. Remove it on a local machine.

### Key Constraints
- All npm commands must `cd mobile` first — `package.json` lives inside `mobile/`
- `metro.config.js` must NOT use `withNativeWind` — crashes on Node 20+ with TS stripping error
- `mobile/dist/` is gitignored — built by Netlify, never committed

### Auth (Supabase)
- Supabase project: `usmqbohcjcyszjxxvnqu.supabase.co`
- Credentials in `mobile/lib/supabase.ts`
- **Web:** `localStorage` + `detectSessionInUrl: true` (PKCE auto-exchanged on redirect)
- **Native:** `AsyncStorage` + manual code exchange via `WebBrowser`
- Google OAuth on web does a full-page redirect — add each Netlify URL to Supabase Auth → URL Configuration → Redirect URLs

### Routes (expo-router)
```
app/index.tsx             — root route; auth guard in _layout.tsx handles redirect
app/_layout.tsx           — root layout; redirects to login or picks based on session
app/(auth)/login.tsx      — login screen (email + Google OAuth)
app/(tabs)/_layout.tsx    — tab bar (Picks, Signals, Profile, Settings)
app/(tabs)/picks.tsx
app/(tabs)/signals.tsx
app/(tabs)/profile.tsx
app/(tabs)/settings.tsx
app/pick/[ticker].tsx     — individual pick detail screen
```

### Tech Stack
| Concern | Choice |
|---|---|
| Framework | Expo (React Native) + TypeScript |
| Navigation | expo-router (file-based) |
| Styling | NativeWind v4 (Tailwind for RN) |
| Backend | Supabase (extend existing) |
| Auth | Supabase Auth + Google OAuth |
| State | Zustand + TanStack Query |
| Subscriptions | RevenueCat (Phase 3) |
| Broker | Alpaca OAuth (Phase 4) |
