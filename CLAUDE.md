# STW Companion — Claude Code Guide

## Ground Rules
- If instructions seem to conflict, **always ask before doing anything**
- Never destructively modify `staging` or `main` (no force-push, no resets) without explicit approval
- Never push to `main` for any reason — it requires explicit approval every time

## Project Overview
Stock Talk Weekly (@stocktalkweekly) has two separate apps:

| App | For | URL |
|---|---|---|
| Web admin dashboard | The STW editor (you) | `claudiachez.github.io/stw-companion` |
| Mobile web app | Subscribers | `staging--stwcompanion.netlify.app` (staging) |

These are completely independent. Changes to one never affect the other.

## Deployment

### Admin dashboard (GitHub Pages)
- Lives in `docs/index.html` on the `main` branch
- GitHub automatically serves it at `claudiachez.github.io/stw-companion`
- Update it by pushing to `main` — requires explicit approval every time

### Mobile web app (Netlify)
- Built from `mobile/` and served by Netlify
- **Staging:** `staging--stwcompanion.netlify.app` — auto-deploys on every push to `staging`
- **Production:** `stwcompanion.netlify.app` — locked, never auto-deploys (Netlify production branch is set to a nonexistent branch)

## Git Workflow
Two branches exist:
- `main` — frozen. Admin dashboard lives here. Never touch without approval.
- `staging` — all mobile app development happens here. Netlify watches this.

**Day-to-day:**
1. Make changes directly on `staging`
2. Push to `staging` when there is something worth reviewing — not on every small change
3. Netlify rebuilds automatically (~1 min). Check it at the staging URL.
4. When ready for subscribers, promote to production together with explicit approval

## Project Structure
```
docs/index.html   — web admin dashboard (HTML + CSS + JS, all inline)
mobile/           — Expo React Native app (iOS, Android, web)
  app/            — screens and routes (expo-router file-based routing)
  lib/            — supabase client, theme, types
  store/          — Zustand auth store
  components/     — shared UI components
  assets/         — icon and images
netlify.toml      — Netlify build config
CLAUDE.md         — this file
```

## Mobile App

### Running locally
```bash
cd mobile
npx expo start          # scan QR code with Expo Go on your phone
```

### Building for web locally (to preview before pushing to staging)
```bash
cd mobile
EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1 npm run build:web   # outputs to mobile/dist
npx serve dist                                          # opens at localhost:3000
```
`EXPO_OFFLINE=1` is needed in this cloud environment because the Expo CLI tries to call Expo's servers. Remove it on a local machine.

### Key constraints
- `package.json` lives inside `mobile/` — all npm commands must `cd mobile` first
- `metro.config.js` must NOT use `withNativeWind` — it causes the Expo CLI to crash on Node 20+ with a TypeScript stripping error. The app uses `StyleSheet.create()` not `className` props, so NativeWind's metro plugin is not needed.
- `mobile/dist/` is gitignored — it is built by Netlify, never committed

### Auth (Supabase)
- Supabase project: `usmqbohcjcyszjxxvnqu.supabase.co`
- Credentials are in `mobile/lib/supabase.ts`
- On **web**: uses `localStorage` and `detectSessionInUrl: true` (PKCE code auto-exchanged on redirect)
- On **native**: uses `AsyncStorage` and manual code exchange via `WebBrowser`
- Google OAuth on web does a full-page redirect — the callback URL (`window.location.origin`) must be whitelisted in Supabase dashboard under **Auth → URL Configuration → Redirect URLs**. Add each new deployment URL there.

### Routes (expo-router)
```
app/index.tsx           — root route (required); auth guard in _layout.tsx handles redirect
app/_layout.tsx         — root layout; redirects to login or picks based on session
app/(auth)/login.tsx    — login screen (email + Google OAuth)
app/(tabs)/_layout.tsx  — tab bar (Picks, Signals, Profile, Settings)
app/(tabs)/picks.tsx
app/(tabs)/signals.tsx
app/(tabs)/profile.tsx
app/(tabs)/settings.tsx
app/pick/[ticker].tsx   — individual pick detail screen
```

## Admin Dashboard (`docs/index.html`)

### Code Rules
- Do not change any JS logic, data structures, or API calls
- Do not restructure the HTML
- Do not rename or remove CSS classes/IDs — only change property values
- Portfolio data lives in `<script id="stw-data-block">` — do not edit manually

### Theme System
- **Default:** Dark mode
- **Toggle:** Hamburger menu → sun/moon icon switches between Light and Dark Mode
- Theme is persisted to `localStorage` (`stwTheme` key) and restored on `init()`
- Light theme is applied via `[data-theme="light"]` on `<html>`
- Charts (LightweightCharts) are re-themed live via `chart.applyOptions()` on toggle
- Do not hardcode colors outside of `:root` or `[data-theme="light"]` — always use CSS variables

### Design System
- **Font:** Barlow Condensed (700/800) for logo, headers, and login page; system sans-serif for body
- **Logo:** STW mic + green arrow SVG — used in header (34px, transparent bg) and login page (90px)
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
| `--acc` | `#22c55e` | STW green — buttons, active states, highlights |

#### Tier Colors
| Tier | Color | Meaning |
|---|---|---|
| `--c5` | `#22c55e` (green) | Highest conviction |
| `--c4` | `#3b82f6` (blue) | High conviction |
| `--c3` | `#f59e0b` (amber) | Moderate |
| `--c2` | `#6b7280` (gray) | Waning interest |
| `--c1` | `#ef4444` (red) | Concern |
| `--c0` | `#52525b` (dark gray) | Legacy positions |
