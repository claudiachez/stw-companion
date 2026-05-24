# STW Companion: Web → Commercial Mobile App

## Context

The current app is a single-file vanilla JS/HTML dashboard (`docs/index.html`, 2,147 lines) used privately by the developer. The goal is to productize it as a commercial mobile app for iOS and Android stores — pitching to Stock Talk Weekly (STW) as a revenue-share venture. The app surfaces STW's stock picks and GEX signals, and will grow to include broker integration, portfolios, a trade journal, community feeds, and subscriptions.

The existing `docs/index.html` admin dashboard stays as-is and becomes the **content management tool** for the STW editor — it's already wired to Supabase, so all data the admin publishes automatically flows to mobile users.

---

## Architecture Decisions

| Concern | Decision | Reason |
|---|---|---|
| Mobile framework | **Expo (React Native)** with TypeScript | Best ecosystem for future features (notifications, broker OAuth, biometrics); EAS handles App Store/Play Store builds |
| Navigation | **expo-router** (file-based) | Typed routes, deep linking, easy tab + stack composition |
| Backend | **Supabase** (extend existing) | Already in use; add RLS for multi-user, new tables for portfolio/journal |
| Auth | Supabase Auth + Google OAuth | Remove single-email whitelist; any user can sign up |
| Subscriptions | **RevenueCat** | Single SDK for iOS + Android; entitlement-based gating |
| Broker | **Alpaca OAuth** (start) → Webull next | Robinhood has no public API; Alpaca is the standard for fintech apps |
| Discord feed | **Supabase Edge Function relay** + Expo Push Notifications | Discord Gateway runs server-side; pushes to mobile clients |
| X feed | **Backend proxy** (Supabase Edge Function) via X API v2 pay-per-use | Keeps API key server-side; pay-per-use tier is affordable for a curated feed |
| Styling | **NativeWind v4** (Tailwind for React Native) | Fastest path from design tokens to native components; matches existing color system |
| State | **Zustand** + **TanStack Query** | Zustand for UI state; React Query for server state/caching |

---

## Project Structure

The Expo app lives alongside the existing admin dashboard:

```
stw-companion/
├── docs/                          # Existing web admin dashboard (keep as-is)
│   └── index.html
├── mobile/                        # New Expo app (React Native)
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login.tsx
│   │   │   └── signup.tsx
│   │   ├── (tabs)/
│   │   │   ├── _layout.tsx        # Bottom tab navigator
│   │   │   ├── picks.tsx          # STW Stock Picks (ported from HTML)
│   │   │   ├── signals.tsx        # Graddox GEX Signals
│   │   │   ├── portfolio.tsx      # My Portfolio (P&L, positions)
│   │   │   ├── feed.tsx           # X + Discord feed
│   │   │   └── journal.tsx        # Trade journal
│   │   ├── pick/[ticker].tsx      # Detail screen for a single pick
│   │   ├── profile.tsx
│   │   ├── settings/
│   │   │   ├── index.tsx
│   │   │   └── broker.tsx         # Connect Alpaca/Webull
│   │   └── _layout.tsx            # Root layout (auth guard)
│   ├── components/
│   ├── hooks/
│   ├── lib/
│   │   ├── supabase.ts
│   │   ├── revenuecat.ts
│   │   └── alpaca.ts
│   ├── store/
│   ├── app.json                   # Expo config
│   └── package.json
├── supabase/                      # Supabase migrations (new)
│   └── migrations/
├── plans/                         # Project planning docs
├── ibkr_proxy.py                  # Keep for admin use
└── migrate.js
```

---

## Supabase Changes

New tables needed (RLS on all):

```sql
-- Already exists (admin-managed, read-only for users):
-- holdings, graddox

-- New:
profiles (id, user_id, display_name, avatar_url, subscription_tier)
broker_connections (id, user_id, broker, access_token_enc, refresh_token_enc)
portfolio_positions (id, user_id, ticker, side, quantity, entry_price, exit_price, status, opened_at, closed_at)
journal_entries (id, user_id, ticker, entry_date, why, objective, outcome, notes)
```

Auth change: Remove `authorizedEmails` whitelist from `docs/index.html`. Any authenticated user can read `holdings` and `graddox` (gated by RevenueCat entitlement check on mobile).

---

## Phased Implementation

### Phase 1 — Foundation + Pitch MVP
Goal: A working app to demo the STW picks and signals on mobile, with auth wired up.

1. **Init Expo project** in `mobile/` — TypeScript, expo-router, NativeWind
2. **Auth screens** — Supabase Google OAuth + email login; auth guard in root layout
3. **STW Picks tab** — Port holdings list + detail screen from `docs/index.html`
   - Reuse the tier/basket/filter/sort logic
   - Conviction meter, key bullets, live price via Finnhub
4. **Graddox Signals tab** — Port SPX/QQQ levels and signals table
   - Lightweight Charts → `react-native-wagmi-charts` or Victory Native for candles
5. **Profile tab** — Display name, avatar, subscription status
6. **Settings screen** — Stub broker connect for Phase 4

### Phase 2 — Community + Retention
7. **Trade Journal** — CRUD journal entries linked to tickers
8. **X feed** — Supabase Edge Function proxies X API v2; fetch tweets from STW Twitter account

### Phase 3 — Subscriptions
9. **RevenueCat integration** — Paywall on Picks/Signals tabs for non-subscribers
10. **Subscription tiers** — Free (limited picks) vs. Premium (full access + live data)

### Phase 4 — Trading Features
11. **Alpaca OAuth flow** — Settings → Connect Alpaca → OAuth redirect → store token in `broker_connections`
12. **Portfolio tab** — Fetch open/closed positions from Alpaca + `portfolio_positions` table
13. **One-click trade** — Buy/sell button on pick detail screen → Alpaca order API

### Phase 5 — Advanced Community
14. **Discord feed + push notifications** — Edge Function maintains Discord bot connection; broadcasts to Expo Notifications on new messages in STW channel
15. **Webull** as second broker option

---

## Key Reuse: `docs/index.html` Data Layer

The mobile app reads the same Supabase tables (`holdings`, `graddox`) the admin dashboard writes to. No data migration needed. The admin workflow stays unchanged — STW editor updates picks/signals on the web, all mobile users see it instantly.

---

## Notable Decisions

- **Robinhood**: No official public API. Starting with **Alpaca** instead — it's the industry standard for fintech apps. Can frame it as "trade commission-free via Alpaca" which is actually a feature.
- **IBKR proxy** (`ibkr_proxy.py`): Stays as an admin-only tool (runs on the editor's local machine). Not exposed to mobile users.
- **Discord relay**: Must run server-side (Supabase Edge Function or a small Node.js worker). Discord's Gateway WebSocket can't connect directly from a React Native app.

---

## Verification

- `cd mobile && npx expo start` — confirm app boots on iOS simulator and Android emulator
- Sign up with a new email → confirm Supabase creates profile row
- Confirm STW picks + Graddox signals load from Supabase
- Alpaca OAuth flow: connect account → verify `broker_connections` row created
