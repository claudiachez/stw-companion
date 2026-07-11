import { create } from 'zustand';

// Which index drives the viewer's regime light (My Portfolio → Risk). A per-user
// preference — the STW default is IWM (its regime_proxy), but a subscriber can
// prefer SPY or QQQ. Only these three have `regime_daily` history (backfilled);
// other Trend/Structure symbols (RSP/VEA) have no regime rows to gate on.
export interface RegimeInstrumentOption { value: string; label: string }
export const REGIME_INSTRUMENTS: RegimeInstrumentOption[] = [
  { value: 'IWM', label: 'Russell 2000 (IWM)' },
  { value: 'SPY', label: 'S&P 500 (SPY)' },
  { value: 'QQQ', label: 'Nasdaq 100 (QQQ)' },
];
export const DEFAULT_REGIME_INSTRUMENT = 'IWM';

const KEY = 'regimeInstrument';
const stored = (typeof localStorage !== 'undefined' && localStorage.getItem(KEY)) || DEFAULT_REGIME_INSTRUMENT;
// Guard against a stale localStorage value no longer in the option set.
const initial = REGIME_INSTRUMENTS.some((o) => o.value === stored) ? stored : DEFAULT_REGIME_INSTRUMENT;

interface RegimeInstrumentState {
  instrument: string;
  setInstrument: (i: string) => void;
}

export const useRegimeInstrumentStore = create<RegimeInstrumentState>((set) => ({
  instrument: initial,
  setInstrument: (instrument) =>
    set(() => {
      try { localStorage.setItem(KEY, instrument); } catch { /* private mode */ }
      return { instrument };
    }),
}));
