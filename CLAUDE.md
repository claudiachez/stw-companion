# STW Companion — Claude Code Guide

## Project Overview
Single-file portfolio dashboard for Stock Talk Weekly (@stocktalkweekly).
All HTML, CSS, and JS lives in `docs/index.html`. No build step.

## Deployment
- **Staging URL:** https://staging--stwcompanion.netlify.app
- **Production URL:** https://stwcompanion.netlify.app (locked — do not touch)
- Netlify auto-deploys from the `staging` branch to the staging URL
- `main` is production — Netlify's production branch is set to a nonexistent branch so it never auto-deploys
- Feature branches get temporary Deploy Preview URLs via PRs

## Git Workflow
1. Create a feature branch from `staging`: `git checkout -b claude/feature-name origin/staging`
2. Do all work on that branch — push only to the feature branch during iteration
3. To test on Netlify staging: push to staging once the work is ready: `git push origin claude/feature-name:staging`
4. Also push to the remote feature branch to keep it in sync: `git push origin claude/feature-name`
5. Do NOT push to staging on every commit — only when you want a staging deploy
6. Never push directly to `main`

## Project Structure
```
docs/index.html   — web admin dashboard (HTML + CSS + JS, all inline)
mobile/           — Expo React Native app (iOS, Android, web)
netlify.toml      — Netlify build config (serves mobile web export)
CLAUDE.md         — this file
```

## Code Rules
- Do not change any JS logic, data structures, or API calls
- Do not restructure the HTML
- Do not rename or remove CSS classes/IDs — only change property values
- All changes must be in `docs/index.html` only
- Portfolio data lives in `<script id="stw-data-block">` — do not edit manually

## Theme System
- **Default:** Dark mode
- **Toggle:** Hamburger menu → sun/moon icon switches between Light and Dark Mode
- Theme is persisted to `localStorage` (`stwTheme` key) and restored on `init()`
- Light theme is applied via `[data-theme="light"]` on `<html>` — all color vars and hardcoded overrides live in that block in the CSS
- Charts (LightweightCharts) are re-themed live via `chart.applyOptions()` on toggle
- Do not hardcode colors outside of `:root` or `[data-theme="light"]` — always use CSS variables

## Design System
- **Font:** Barlow Condensed (700/800) for logo, headers, and login page; system sans-serif for body
- **Logo:** STW mic + green arrow SVG — used in header (34px, transparent bg) and login page (90px)
- **Favicon:** SVG data-URI in `<head>`

### Color Variables (`:root`)
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

### Tier Colors
| Tier | Color | Meaning |
|---|---|---|
| `--c5` | `#22c55e` (green) | Highest conviction |
| `--c4` | `#3b82f6` (blue) | High conviction |
| `--c3` | `#f59e0b` (amber) | Moderate |
| `--c2` | `#6b7280` (gray) | Waning interest |
| `--c1` | `#ef4444` (red) | Concern |
| `--c0` | `#52525b` (dark gray) | Legacy positions |
