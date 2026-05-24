# STW Companion — Claude Code Guide

## Project Overview
Single-file portfolio dashboard for Stock Talk Weekly (@stocktalkweekly).
All HTML, CSS, and JS lives in `docs/index.html`. No build step.

## Deployment
- **Live URL:** https://stw-companion.netlify.app
- Netlify auto-deploys from the `staging` branch
- `main` is production — only updated via PR from `staging`

## Git Workflow
1. Create a feature branch from `staging`: `git checkout -b claude/feature-name origin/staging`
2. Do all work on that branch
3. Push to the feature branch only: `git push origin claude/feature-name`
4. Open a PR into `staging` for review
5. Never push directly to `main` or `staging`

## Project Structure
```
docs/index.html   — entire app (HTML + CSS + JS, all inline)
CLAUDE.md         — this file
```

## Code Rules
- Do not change any JS logic, data structures, or API calls
- Do not restructure the HTML
- Do not rename or remove CSS classes/IDs — only change property values
- All changes must be in `docs/index.html` only
- Portfolio data lives in `<script id="stw-data-block">` — do not edit manually

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
