# STW Companion — Clean Architecture Plan

**Author:** Claude (senior architect pass)  
**Status:** Proposal — no code has been changed  
**Scope:** Admin dashboard refactor plan + Mobile app architecture from scratch  

> **Ground rule:** Product behavior does not change. This document is a blueprint.
> Admin code changes require explicit approval per CLAUDE.md rules.

---

## 1. Diagnosis: What's Wrong Now

### Admin (`admin/index.html`) — 2,642 lines, zero modules

| Problem | Impact |
|---|---|
| Auth, state, data, rendering, charts, IBKR all in one file | Any change risks breaking unrelated behavior |
| Global variables as state (`selectedTicker`, `_priceCache`, `_ibkrCache`) | Mutation is invisible; impossible to trace state changes |
| Inline `<script id="stw-data-block">` baked into HTML | Data and view are coupled; editing one risks breaking the other |
| Supabase credentials in plain JS in a public file | Credential exposure risk if repo ever becomes public |
| Tier colors and basket colors defined once inline | Will be copy-pasted into mobile — two sources of truth |
| Chart setup, EMA calculation, Finnhub polling all interleaved | Feature work requires reading the whole file to understand any part |
| No TypeScript | Bugs caught at runtime instead of edit time |
| No tests | Refactors are unverifiable |

### Mobile (`mobile/`) — Does not exist yet

This is an opportunity: build it right the first time.

**Risk if built naively** (mirroring admin structure into Expo):
- All data logic ends up in screen files (`picks.tsx` becomes 800 lines)
- No reusability: Picks screen and detail screen re-implement the same fetch logic
- Adding RevenueCat, Alpaca, journal later requires excavating existing screens
- No clear boundary between "what the app knows" (domain) and "how it talks to Supabase" (infra)

---

## 2. Architectural North Star

```
┌─────────────────────────────────────────────────────────┐
│                    PRESENTATION                         │
│         (React Native screens, admin HTML UI)           │
├─────────────────────────────────────────────────────────┤
│                    APPLICATION                          │
│       (use-case hooks, feature stores, queries)         │
├─────────────────────────────────────────────────────────┤
│                      DOMAIN                             │
│        (entities, value objects, repo interfaces)       │
├─────────────────────────────────────────────────────────┤
│                  INFRASTRUCTURE                         │
│       (Supabase client, Finnhub, Alpaca, IBKR)          │
└─────────────────────────────────────────────────────────┘
```

Key rules:
- **Domain knows nothing** about Supabase, React, or Expo
- **Application layer** depends on domain interfaces, not concrete clients
- **Infrastructure** implements domain interfaces (dependency inversion)
- **Shared package** owns all types and constants — admin and mobile import from it

---

## 3. New Repository Structure

```
stw-companion/
│
├── packages/
│   └── shared/                    # ← NEW: canonical types + constants
│       ├── package.json
│       ├── tsconfig.json
│       ├── types/
│       │   ├── holding.ts         # Holding, ConvictionLevel, BasketName
│       │   ├── graddox.ts         # GraddoxData, Signal, LevelSet
│       │   ├── portfolio.ts       # Position, JournalEntry
│       │   └── index.ts
│       ├── constants/
│       │   ├── tiers.ts           # TIERS map (label, color vars)
│       │   ├── baskets.ts         # BASKET_COLORS map
│       │   └── theme.ts           # CSS variable names
│       └── utils/
│           ├── format.ts          # formatPct, formatDate, formatWeight
│           └── options.ts         # parseOptionLeg (extracted from admin)
│
├── admin/
│   ├── index.html                 # Thin shell: loads bundle, no inline JS
│   ├── vite.config.ts             # Vite bundler (no framework, just TS→JS)
│   ├── tsconfig.json
│   ├── package.json
│   ├── ibkr_proxy.py              # Unchanged
│   ├── migrate.js                 # Unchanged
│   └── src/
│       ├── main.ts                # Entry point; calls init()
│       ├── auth/
│       │   └── auth.ts            # signIn, signOut, onAuthStateChange
│       ├── data/
│       │   ├── client.ts          # supabase.createClient (one place)
│       │   ├── holdings.ts        # fetchHoldings(), saveHolding()
│       │   └── graddox.ts         # fetchGraddox()
│       ├── state/
│       │   └── store.ts           # AppState class; typed, event-emitting
│       ├── charts/
│       │   ├── manager.ts         # _lwCharts map, create/destroy lifecycle
│       │   ├── theme.ts           # getChartOptions(theme: 'dark'|'light')
│       │   ├── finnhub.ts         # subscribePrice(), pollPrice()
│       │   └── ema.ts             # calcEMA(data, period)
│       ├── ibkr/
│       │   └── client.ts          # fetchOptionPrices(), status check
│       └── ui/
│           ├── header.ts          # renderHeader(), bindHdrMenu()
│           ├── theme.ts           # applyTheme(), toggleTheme()
│           ├── stw/
│           │   ├── basket-bar.ts  # renderBasketBar()
│           │   ├── filters.ts     # bindFilters(), applyFilters()
│           │   ├── ticker-list.ts # renderTickerList(), selectTicker()
│           │   └── detail.ts      # renderDetail(), bindEditMode()
│           └── graddox/
│               ├── levels.ts      # renderLevels()
│               ├── signals.ts     # renderSignalsTable()
│               ├── log.ts         # renderDayLog()
│               └── charts.ts      # initGraddoxCharts()
│
├── mobile/
│   ├── app/                       # expo-router file-based routes
│   │   ├── _layout.tsx            # Root layout + auth guard
│   │   ├── (auth)/
│   │   │   └── login.tsx
│   │   ├── (tabs)/
│   │   │   ├── _layout.tsx        # Bottom tab navigator
│   │   │   ├── picks.tsx          # Thin screen — delegates to feature
│   │   │   ├── signals.tsx
│   │   │   ├── portfolio.tsx
│   │   │   ├── feed.tsx
│   │   │   └── journal.tsx
│   │   ├── pick/
│   │   │   └── [ticker].tsx       # Pick detail
│   │   └── settings/
│   │       ├── index.tsx
│   │       └── broker.tsx
│   │
│   ├── features/                  # ← Feature-first modules
│   │   ├── picks/
│   │   │   ├── api.ts             # fetchHoldings() — Supabase query
│   │   │   ├── useHoldings.ts     # TanStack Query hook
│   │   │   ├── useFilters.ts      # Filter/sort state (Zustand slice)
│   │   │   ├── components/
│   │   │   │   ├── HoldingCard.tsx
│   │   │   │   ├── ConvictionBadge.tsx
│   │   │   │   ├── BasketChip.tsx
│   │   │   │   ├── FilterBar.tsx
│   │   │   │   └── PickDetail.tsx
│   │   │   └── index.ts           # Barrel export
│   │   ├── signals/
│   │   │   ├── api.ts             # fetchGraddox()
│   │   │   ├── useGraddox.ts
│   │   │   ├── components/
│   │   │   │   ├── BiasChip.tsx
│   │   │   │   ├── LevelCard.tsx
│   │   │   │   ├── SignalsTable.tsx
│   │   │   │   ├── DayLog.tsx
│   │   │   │   └── GraddoxChart.tsx
│   │   │   └── index.ts
│   │   ├── portfolio/
│   │   │   ├── api.ts             # fetchPositions(), syncAlpaca()
│   │   │   ├── usePortfolio.ts
│   │   │   ├── components/
│   │   │   │   ├── PositionRow.tsx
│   │   │   │   └── PnlSummary.tsx
│   │   │   └── index.ts
│   │   ├── journal/
│   │   │   ├── api.ts
│   │   │   ├── useJournal.ts
│   │   │   ├── components/
│   │   │   │   ├── JournalEntry.tsx
│   │   │   │   └── EntryForm.tsx
│   │   │   └── index.ts
│   │   └── auth/
│   │       ├── useSession.ts      # Wraps Supabase auth state
│   │       ├── components/
│   │       │   ├── LoginForm.tsx
│   │       │   └── GoogleButton.tsx
│   │       └── index.ts
│   │
│   ├── shared/                    # Cross-feature UI + hooks
│   │   ├── components/
│   │   │   ├── Screen.tsx         # Safe area + scroll wrapper
│   │   │   ├── EmptyState.tsx
│   │   │   ├── ErrorBoundary.tsx
│   │   │   ├── LoadingSpinner.tsx
│   │   │   └── PriceTag.tsx       # Live Finnhub price display
│   │   └── hooks/
│   │       ├── useLivePrice.ts    # Finnhub WebSocket per ticker
│   │       └── useRevenueCat.ts   # Entitlement check
│   │
│   ├── lib/
│   │   ├── supabase.ts            # One supabase client instance
│   │   ├── query-client.ts        # TanStack QueryClient config
│   │   └── alpaca.ts              # Alpaca OAuth + order API
│   │
│   ├── store/
│   │   └── auth.ts                # Zustand auth store (session, user)
│   │
│   ├── assets/
│   ├── app.json
│   ├── package.json
│   ├── tsconfig.json
│   ├── metro.config.js
│   ├── babel.config.js
│   ├── tailwind.config.js
│   └── global.css
│
├── supabase/
│   └── migrations/
│       ├── 001_initial.sql        # holdings, graddox (document existing)
│       └── 002_user_tables.sql    # profiles, broker_connections, etc.
│
├── plans/
│   ├── mobile-transition.md
│   └── clean-architecture.md     # ← this file
│
├── CLAUDE.md
├── netlify.toml
└── pnpm-workspace.yaml            # ← NEW: ties packages/ together
```

---

## 4. Shared Package — `packages/shared`

This is the most important architectural change. It prevents the same type from being
defined differently in admin JS and mobile TypeScript.

### `packages/shared/types/holding.ts`

```typescript
export type ConvictionLevel = 0 | 1 | 2 | 3 | 4 | 5;

export type BasketName =
  | 'Robotics & Edge AI'
  | 'Power Infrastructure'
  | 'Data Center'
  | 'Telecom & Voice AI'
  | 'Chips'
  | 'Defense'
  | 'Other';

export type ActionType = 'New' | 'Upsized' | 'Trimmed' | 'Hold' | 'Closed';

export interface Holding {
  rank: number;
  ticker: string;
  name: string;
  conviction: ConvictionLevel;
  basket: BasketName;
  last_action: ActionType | null;
  action_date: string | null;        // ISO date string
  initial_weight: number | null;
  current_weight: number;
  position_detail: string | null;
  summary: string;
  bullets: string[];
  updated_at?: string;
}
```

### `packages/shared/types/graddox.ts`

```typescript
export type SignalVerdict = 'green' | 'yellow' | 'red';
export type BiasLabel = 'bullish' | 'bearish' | 'flat' | 'flat-to-up' | 'flat-to-down';

export interface LevelSet {
  resistance: number;
  gex1: number;
  put_support: number;
  key_target?: number;
  downside_risk?: number;
  note?: string;
}

export interface Signal {
  trigger: string;
  trade: string;
  exp: string;
  logic: string;
  verdict: SignalVerdict;
}

export interface LogEntry {
  time: string;
  content: string;
}

export interface GraddoxData {
  date: string;
  last_updated: string;
  bias: BiasLabel;
  bias_note: string;
  spx_price: number | null;
  qqq_price: number | null;
  spx: LevelSet;
  qqq: LevelSet;
  signals: Signal[];
  log: LogEntry[];
}
```

### `packages/shared/constants/tiers.ts`

```typescript
import type { ConvictionLevel } from '../types/holding';

export interface TierMeta {
  label: string;
  short: string;
  cssColor: string;   // CSS variable name, e.g. 'var(--c5)'
  tailwind: string;   // Tailwind color class for mobile, e.g. 'text-green-500'
  hex: string;        // Raw hex for non-CSS contexts
}

export const TIERS: Record<ConvictionLevel, TierMeta> = {
  5: { label: 'Tier 1 — Highest Conviction', short: 'HIGHEST',  cssColor: 'var(--c5)', tailwind: 'text-green-500',  hex: '#22c55e' },
  4: { label: 'Tier 2 — High Conviction',    short: 'HIGH',     cssColor: 'var(--c4)', tailwind: 'text-blue-500',   hex: '#3b82f6' },
  3: { label: 'Tier 3 — Moderate',           short: 'MODERATE', cssColor: 'var(--c3)', tailwind: 'text-amber-500',  hex: '#f59e0b' },
  2: { label: 'Tier 4 — Waning Interest',    short: 'WANING',   cssColor: 'var(--c2)', tailwind: 'text-gray-500',   hex: '#6b7280' },
  1: { label: 'Tier 5 — Concern',            short: 'CONCERN',  cssColor: 'var(--c1)', tailwind: 'text-red-500',    hex: '#ef4444' },
  0: { label: 'Tier 6 — Legacy Positions',   short: 'LEGACY',   cssColor: 'var(--c0)', tailwind: 'text-zinc-500',   hex: '#52525b' },
};
```

### `packages/shared/constants/baskets.ts`

```typescript
import type { BasketName } from '../types/holding';

export const BASKET_COLORS: Record<BasketName, string> = {
  'Robotics & Edge AI':   '#7C3AED',
  'Power Infrastructure': '#16A34A',
  'Data Center':          '#2563EB',
  'Telecom & Voice AI':   '#D97706',
  'Chips':                '#DC2626',
  'Defense':              '#a78bfa',
  'Other':                '#6b7280',
};
```

### `packages/shared/utils/options.ts`

```typescript
// Extracted from admin/index.html parseOptionLegs() — now testable
export interface OptionLeg {
  symbol: string;
  strike: number;
  right: 'C' | 'P';
  expiry: string;   // "Oct '26" → normalized to "2026-10" for IBKR
  entry: number;
}

// "$22.5C Oct '26 @ $2.67" → OptionLeg
export function parseOptionLeg(raw: string, ticker: string): OptionLeg | null {
  const m = raw.match(/\$?([\d.]+)([CP])\s+(\w+\s+'?\d+)\s+@\s+\$?([\d.]+)/i);
  if (!m) return null;
  return {
    symbol: ticker,
    strike: parseFloat(m[1]),
    right:  m[2].toUpperCase() as 'C' | 'P',
    expiry: m[3],
    entry:  parseFloat(m[4]),
  };
}

export function parseAllLegs(positionDetail: string, ticker: string): OptionLeg[] {
  return positionDetail
    .split('+')
    .map(s => s.trim())
    .map(s => parseOptionLeg(s, ticker))
    .filter((l): l is OptionLeg => l !== null);
}
```

---

## 5. Admin Refactor Plan

> **Important:** No behavior changes. The refactor extracts logic into modules
> without altering any function signatures, data structures, or API calls.
> Requires adding Vite as a dev-only bundler.

### `admin/src/data/client.ts`

```typescript
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY as string;

export const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { flowType: 'implicit', detectSessionInUrl: true, persistSession: true },
});
```

Move credentials to `admin/.env.local` (gitignored). The publishable anon key is not a
secret, but this pattern is correct: credentials belong in env files, not source.

### `admin/src/data/holdings.ts`

```typescript
import { db } from './client';
import type { Holding } from '@stw/shared/types';

export async function fetchHoldings(): Promise<Holding[]> {
  const { data, error } = await db.from('holdings').select('*').order('rank');
  if (error) throw error;
  return data as Holding[];
}

export async function saveHolding(ticker: string, updates: Partial<Holding>): Promise<void> {
  const { error } = await db
    .from('holdings')
    .upsert({ ticker, ...updates, updated_at: new Date().toISOString() }, { onConflict: 'ticker' });
  if (error) throw error;
}
```

### `admin/src/state/store.ts`

Replace six global `let` variables with a single typed store:

```typescript
import type { Holding } from '@stw/shared/types';

type SortMode = 'conviction' | 'az' | 'za' | 'newest' | 'oldest' | 'pnl-desc' | 'pnl-asc' | 'weight';

interface AppState {
  selectedTicker: string | null;
  filteredHoldings: Holding[];
  sortMode: SortMode;
  priceCache: Record<string, { c: number; pc: number; dp: number; h: number; l: number; o: number }>;
  ibkrCache: Record<string, { legs: unknown[]; pnlPct: number; ts: number }>;
  ibkrLive: boolean;
}

type Listener = () => void;

class Store {
  private state: AppState = {
    selectedTicker: null,
    filteredHoldings: [],
    sortMode: 'conviction',
    priceCache: {},
    ibkrCache: {},
    ibkrLive: false,
  };

  private listeners = new Set<Listener>();

  get<K extends keyof AppState>(key: K): AppState[K] {
    return this.state[key];
  }

  set<K extends keyof AppState>(key: K, value: AppState[K]): void {
    this.state[key] = value;
    this.listeners.forEach(l => l());
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const store = new Store();
```

### `admin/src/charts/theme.ts`

```typescript
type Theme = 'dark' | 'light';

export function getChartOptions(theme: Theme) {
  const isDark = theme === 'dark';
  return {
    layout: {
      background: { type: 'solid', color: isDark ? '#111111' : '#ffffff' },
      textColor: isDark ? '#a0a0a0' : '#2d4a2d',
    },
    grid: {
      vertLines: { color: isDark ? 'rgba(42,42,42,0.8)' : 'rgba(204,229,204,0.8)' },
      horzLines: { color: isDark ? 'rgba(42,42,42,0.8)' : 'rgba(204,229,204,0.8)' },
    },
    rightPriceScale: { borderColor: isDark ? '#2a2a2a' : '#cce5cc' },
    timeScale:       { borderColor: isDark ? '#2a2a2a' : '#cce5cc' },
  };
}
```

### `admin/src/ibkr/client.ts`

```typescript
import { parseAllLegs } from '@stw/shared/utils/options';
import type { Holding } from '@stw/shared/types';

const PROXY = 'https://localhost:8765';

export interface IBKRResult {
  legs: Array<{ strike: number; right: string; price: number; bid: number; ask: number; mid: number; pnl_pct: number; pnl_dol: number }>;
  pnlPct: number;
  ts: number;
}

export async function fetchOptionPrices(holding: Holding): Promise<IBKRResult | null> {
  if (!holding.position_detail) return null;
  const legs = parseAllLegs(holding.position_detail, holding.ticker);
  if (!legs.length) return null;

  const res = await fetch(`${PROXY}/option_prices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contracts: legs }),
  });
  if (!res.ok) throw new Error(`IBKR proxy error ${res.status}`);
  const data = await res.json();
  return { legs: data.results, pnlPct: data.aggregate_pnl_pct, ts: Date.now() };
}

export async function checkStatus(): Promise<boolean> {
  try {
    const res = await fetch(`${PROXY}/status`);
    return res.ok;
  } catch {
    return false;
  }
}
```

---

## 6. Mobile Architecture — Production-Grade Code

### `mobile/lib/supabase.ts`

```typescript
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});
```

### `mobile/lib/query-client.ts`

```typescript
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,   // 5 min — data is editorial, not real-time
      gcTime:    30 * 60 * 1000,  // 30 min in cache
      retry: 2,
    },
  },
});
```

### `mobile/store/auth.ts`

```typescript
import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';

interface AuthState {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  setSession: (session: Session | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  isLoading: true,
  setSession: (session) => set({ session, user: session?.user ?? null }),
  setLoading: (isLoading) => set({ isLoading }),
}));
```

### `mobile/features/picks/api.ts`

```typescript
import { supabase } from '../../lib/supabase';
import type { Holding } from '@stw/shared/types';

export async function fetchHoldings(): Promise<Holding[]> {
  const { data, error } = await supabase
    .from('holdings')
    .select('*')
    .order('rank');
  if (error) throw error;
  return data as Holding[];
}
```

### `mobile/features/picks/useHoldings.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import { fetchHoldings } from './api';

export function useHoldings() {
  return useQuery({
    queryKey: ['holdings'],
    queryFn: fetchHoldings,
  });
}
```

### `mobile/features/picks/useFilters.ts`

```typescript
import { create } from 'zustand';
import type { Holding, BasketName, ConvictionLevel, ActionType } from '@stw/shared/types';

interface FilterState {
  search: string;
  basket: BasketName | null;
  tier: ConvictionLevel | null;
  status: ActionType | null;
  sortMode: 'conviction' | 'az' | 'za' | 'newest' | 'weight';
  setSearch: (s: string) => void;
  setBasket: (b: BasketName | null) => void;
  setTier: (t: ConvictionLevel | null) => void;
  setStatus: (s: ActionType | null) => void;
  setSortMode: (m: FilterState['sortMode']) => void;
  apply: (holdings: Holding[]) => Holding[];
}

export const useFilters = create<FilterState>((set, get) => ({
  search: '',
  basket: null,
  tier: null,
  status: null,
  sortMode: 'conviction',
  setSearch:   (search)   => set({ search }),
  setBasket:   (basket)   => set({ basket }),
  setTier:     (tier)     => set({ tier }),
  setStatus:   (status)   => set({ status }),
  setSortMode: (sortMode) => set({ sortMode }),

  apply(holdings) {
    const { search, basket, tier, status, sortMode } = get();
    let result = holdings.filter(h => {
      if (search && !h.ticker.toLowerCase().includes(search.toLowerCase()) &&
                    !h.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (basket && h.basket !== basket) return false;
      if (tier !== null && h.conviction !== tier) return false;
      if (status && h.last_action !== status) return false;
      return true;
    });

    result = [...result].sort((a, b) => {
      switch (sortMode) {
        case 'az':         return a.ticker.localeCompare(b.ticker);
        case 'za':         return b.ticker.localeCompare(a.ticker);
        case 'newest':     return (b.action_date ?? '').localeCompare(a.action_date ?? '');
        case 'weight':     return b.current_weight - a.current_weight;
        case 'conviction': return b.conviction - a.conviction || a.rank - b.rank;
      }
    });

    return result;
  },
}));
```

### `mobile/features/picks/components/HoldingCard.tsx`

```tsx
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { TIERS } from '@stw/shared/constants/tiers';
import { BASKET_COLORS } from '@stw/shared/constants/baskets';
import type { Holding } from '@stw/shared/types';

interface Props {
  holding: Holding;
  onPress: (ticker: string) => void;
}

export function HoldingCard({ holding, onPress }: Props) {
  const tier = TIERS[holding.conviction];
  const basketColor = BASKET_COLORS[holding.basket] ?? '#6b7280';

  return (
    <Pressable
      className="flex-row items-center px-4 py-3 border-b border-zinc-800 active:bg-zinc-900"
      onPress={() => onPress(holding.ticker)}
    >
      <View className="w-1 self-stretch rounded-full mr-3" style={{ backgroundColor: tier.hex }} />
      <View className="flex-1 min-w-0">
        <View className="flex-row items-center gap-2 mb-0.5">
          <Text className="text-white font-bold text-base">{holding.ticker}</Text>
          <View className="px-1.5 py-0.5 rounded" style={{ backgroundColor: `${basketColor}22` }}>
            <Text className="text-xs font-medium" style={{ color: basketColor }}>
              {holding.basket}
            </Text>
          </View>
        </View>
        <Text className="text-zinc-400 text-sm" numberOfLines={1}>{holding.name}</Text>
      </View>
      <View className="items-end ml-3">
        <Text className="text-white text-sm font-medium">
          {holding.current_weight > 0 ? `${holding.current_weight.toFixed(1)}%` : '—'}
        </Text>
        <Text className="text-xs" style={{ color: tier.hex }}>{tier.short}</Text>
      </View>
    </Pressable>
  );
}
```

### `mobile/app/(tabs)/picks.tsx` — thin screen

```tsx
import React from 'react';
import { FlatList, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useHoldings } from '../../features/picks/useHoldings';
import { useFilters } from '../../features/picks/useFilters';
import { HoldingCard } from '../../features/picks/components/HoldingCard';
import { FilterBar } from '../../features/picks/components/FilterBar';
import { LoadingSpinner } from '../../shared/components/LoadingSpinner';
import { EmptyState } from '../../shared/components/EmptyState';

export default function PicksScreen() {
  const router = useRouter();
  const { data: holdings = [], isLoading } = useHoldings();
  const apply = useFilters(s => s.apply);
  const filtered = apply(holdings);

  if (isLoading) return <LoadingSpinner />;

  return (
    <View className="flex-1 bg-black">
      <FilterBar />
      <FlatList
        data={filtered}
        keyExtractor={h => h.ticker}
        renderItem={({ item }) => (
          <HoldingCard
            holding={item}
            onPress={ticker => router.push(`/pick/${ticker}`)}
          />
        )}
        ListEmptyComponent={<EmptyState message="No picks match your filters" />}
      />
    </View>
  );
}
```

### `mobile/app/_layout.tsx` — auth guard

```tsx
import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/auth';
import { queryClient } from '../lib/query-client';
import { QueryClientProvider } from '@tanstack/react-query';

function AuthGuard() {
  const router = useRouter();
  const segments = useSegments();
  const { session, isLoading, setSession, setLoading } = useAuthStore();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (isLoading) return;
    const inAuth = segments[0] === '(auth)';
    if (!session && !inAuth) router.replace('/(auth)/login');
    if (session && inAuth) router.replace('/(tabs)/picks');
  }, [session, segments, isLoading]);

  return null;
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthGuard />
      <Stack screenOptions={{ headerShown: false }} />
    </QueryClientProvider>
  );
}
```

---

## 7. Supabase Migrations

### `supabase/migrations/002_user_tables.sql`

```sql
-- Profiles (one per user)
create table public.profiles (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  display_name  text,
  avatar_url    text,
  subscription_tier text not null default 'free',
  created_at    timestamptz default now(),
  unique (user_id)
);

-- Broker connections (encrypted tokens at app level before insert)
create table public.broker_connections (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  broker              text not null,
  access_token_enc    text not null,
  refresh_token_enc   text,
  connected_at        timestamptz default now(),
  unique (user_id, broker)
);

-- Portfolio positions
create table public.portfolio_positions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  ticker      text not null,
  side        text not null check (side in ('long', 'short')),
  quantity    numeric not null,
  entry_price numeric not null,
  exit_price  numeric,
  status      text not null default 'open' check (status in ('open', 'closed')),
  opened_at   timestamptz default now(),
  closed_at   timestamptz
);

-- Trade journal
create table public.journal_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  ticker      text not null,
  entry_date  date not null,
  why         text,
  objective   text,
  outcome     text,
  notes       text,
  created_at  timestamptz default now()
);

-- RLS: users see only their own rows
alter table public.profiles          enable row level security;
alter table public.broker_connections enable row level security;
alter table public.portfolio_positions enable row level security;
alter table public.journal_entries   enable row level security;

create policy "own rows only" on public.profiles
  for all using (auth.uid() = user_id);
create policy "own rows only" on public.broker_connections
  for all using (auth.uid() = user_id);
create policy "own rows only" on public.portfolio_positions
  for all using (auth.uid() = user_id);
create policy "own rows only" on public.journal_entries
  for all using (auth.uid() = user_id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

---

## 8. Workspace Config

### `pnpm-workspace.yaml`

```yaml
packages:
  - 'packages/*'
  - 'admin'
  - 'mobile'
```

### `packages/shared/package.json`

```json
{
  "name": "@stw/shared",
  "version": "0.0.1",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

### `packages/shared/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "declaration": true,
    "outDir": "./dist"
  },
  "include": ["src"]
}
```

---

## 9. Architectural Improvements — Summary Table

| Concern | Before | After |
|---|---|---|
| **Types** | None (vanilla JS) | Shared TypeScript types in `packages/shared` — admin and mobile both import the same `Holding`, `GraddoxData`, etc. |
| **Constants** | `TIERS`, `BASKET_COLORS` defined inline in admin HTML | `packages/shared/constants` — one source of truth; `hex` for charts, `tailwind` for mobile, `cssColor` for admin |
| **State** | 6 global `let` variables, mutated anywhere | `store.ts` typed class (admin) + Zustand slices per feature (mobile) |
| **Data fetching** | Direct Supabase calls inline wherever needed | `features/*/api.ts` isolated; `useHoldings()` / `useGraddox()` hooks own caching |
| **Credentials** | Hardcoded in HTML source | `.env.local` → `import.meta.env.VITE_*` (admin) / `process.env.EXPO_PUBLIC_*` (mobile) |
| **Option parsing** | `parseOptionLegs()` buried inside admin JS, un-testable | `packages/shared/utils/options.ts` — pure function, testable in isolation |
| **Chart theme** | `chartOpts` object duplicated in `applyTheme()` | `getChartOptions(theme)` pure function → pass to `chart.applyOptions()` |
| **Screen size** | `picks.tsx` will become 600+ lines without structure | Screens are 30–50 lines max; all logic lives in `features/picks/` |
| **Feature isolation** | N/A (mobile doesn't exist) | Adding RevenueCat paywall means editing `useRevenueCat.ts` and wrapping `useHoldings` — zero screen changes |
| **DB schema** | Profiles/broker_connections exist only in planning doc | Versioned SQL migrations in `supabase/migrations/` |
| **Auth guard** | Hardcoded `AUTHORIZED_EMAILS` array | Admin: keeps whitelist (by design). Mobile: Supabase RLS + RevenueCat entitlement check |

---

## 10. Implementation Sequence

**Step 1 — shared package** (zero risk, no existing code touched)
- Create `packages/shared/` with types, constants, utils
- Wire `pnpm-workspace.yaml`

**Step 2 — mobile app scaffold** (new code, no existing code touched)
- Init Expo project in `mobile/`
- Wire Supabase, TanStack Query, Zustand
- Implement auth flow
- Implement picks feature (api → hook → components → screen)
- Implement signals feature

**Step 3 — admin modularization** (requires explicit approval per CLAUDE.md)
- Add Vite to `admin/`
- Move credentials to `.env.local`
- Extract each logical block into `admin/src/` modules
- Replace index.html inline `<script>` with `<script type="module" src="/src/main.ts">`
- Behavior unchanged, file sizes dramatically reduced

**Step 4 — Supabase migrations**
- Add `supabase/migrations/002_user_tables.sql`
- Run on staging Supabase first

---

## 11. What This Does NOT Change

- Any rendering behavior in the admin dashboard
- Supabase table schemas for `holdings` and `graddox`
- The admin's data flow: STW editor writes → Supabase → mobile users read
- The IBKR proxy (stays admin-only)
- Branch strategy and deployment pipeline
