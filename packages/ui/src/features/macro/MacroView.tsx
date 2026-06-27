import { useState, useMemo } from 'react';
import { useCapabilities } from '../../context/AppCapabilities';
import { useMacroIndicators, ALL_INDICATORS } from './useMacroIndicators';
import { useSentimentGauge } from './useSentimentGauge';
import { useWeeklyRecap } from './useWeeklyRecap';
import { useMacroPrefs } from './useMacroPrefs';
import { useGraddox } from '../signals/useGraddox';
import { EnvironmentBanner } from './components/EnvironmentBanner';
import { IndicatorTable } from './components/IndicatorTable';
import { SentimentGauge } from './components/SentimentGauge';
import { MacroRecapCard } from './components/MacroRecapCard';
import type { MacroRegime, MacroIndicator } from '@stw/shared';

const DEFAULT_VISIBLE = ['SPY', 'QQQ', 'VIX', 'US10Y'];
const EXPERT_SYMBOLS = ['IWM', 'RSP', 'TLT', 'HYG', 'VEA'];

// Compute overall regime from visible indicators
function computeRegime(indicators: MacroIndicator[]): { regime: MacroRegime; phrase: string } {
  if (indicators.length === 0) return { regime: 'LOADING', phrase: '' };
  const counts = { bullish: 0, caution: 0, bearish: 0 };
  indicators.forEach((i) => { if (i.signal !== 'na') counts[i.signal]++; });
  const total = counts.bullish + counts.caution + counts.bearish;
  if (total === 0) return { regime: 'LOADING', phrase: '' };

  const gPct = counts.bullish / total;
  const rPct = counts.bearish / total;

  let regime: MacroRegime;
  let phrase: string;

  if (gPct >= 0.6) {
    regime = 'RISK-ON';
    phrase = counts.caution > 0 ? 'broadly constructive' : 'all systems aligned';
  } else if (rPct >= 0.6) {
    regime = 'RISK-OFF';
    phrase = counts.bullish > 0 ? 'deteriorating' : 'fully defensive';
  } else {
    regime = 'CAUTIOUS / NEUTRAL';
    if (gPct > rPct) phrase = 'weakening from risk-on';
    else if (rPct > gPct) phrase = 'recovering from risk-off';
    else phrase = 'mixed signals';
  }

  return { regime, phrase };
}

// Section header (matches PortfolioDashboard pattern)
function SectionHeader({ title, color = 'var(--t3)' }: { title: string; color?: string }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color, marginBottom: 10 }}>
      {title}
    </div>
  );
}

export function MacroView() {
  const { finnhubKey, twelveDataKey } = useCapabilities();
  const { prefs, toggle } = useMacroPrefs();
  const [showExpert, setShowExpert] = useState(false);
  const { data: graddox } = useGraddox();

  // Determine which symbols to fetch: defaults + any expert symbols the user has toggled on
  const visibleSymbols = useMemo(() => {
    const base = [...DEFAULT_VISIBLE];
    EXPERT_SYMBOLS.forEach((s) => {
      if (prefs.visibleIndicators.includes(s)) base.push(s);
    });
    // Maintain canonical order
    return ALL_INDICATORS.map((i) => i.symbol).filter((s) => base.includes(s));
  }, [prefs.visibleIndicators]);

  const { indicators, loading: indLoading } = useMacroIndicators(visibleSymbols, finnhubKey, twelveDataKey);
  const { score, loading: sentLoading } = useSentimentGauge(finnhubKey, twelveDataKey);
  const { recap, loading: recapLoading, error: recapError, generate } = useWeeklyRecap();

  const visibleIndicators = indicators.filter((i) => visibleSymbols.includes(i.symbol));
  const { regime, phrase } = computeRegime(visibleIndicators);

  const updatedAt = useMemo(() => (indLoading ? null : new Date()), [indLoading]);

  function handleRefreshRecap() {
    generate(
      visibleIndicators,
      graddox?.bias ?? '',
      graddox?.bias_note ?? '',
    );
  }

  function handleExpertToggle() {
    setShowExpert((v) => {
      if (!v) {
        // When enabling expert, ensure defaults stay + potentially show all expert
      }
      return !v;
    });
  }

  function handleIndicatorToggle(symbol: string) {
    toggle(symbol);
  }

  return (
    <div style={{ padding: '16px', maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Environment block ─────────────────────────────── */}
      <section>
        <SectionHeader title="Market Environment" />

        <EnvironmentBanner
          regime={regime}
          phrase={phrase}
          updatedAt={updatedAt}
          indicators={visibleIndicators}
        />

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
          {indLoading && indicators.length === 0 ? (
            <div style={{ color: 'var(--t3)', fontSize: 12 }}>Loading indicators…</div>
          ) : (
            <IndicatorTable
              indicators={indicators}
              visibleSymbols={visibleSymbols}
              onToggle={handleIndicatorToggle}
              showExpert={showExpert}
              onToggleExpert={handleExpertToggle}
            />
          )}
        </div>
      </section>

      {/* ── AI Recap card ────────────────────────────────── */}
      <section>
        <SectionHeader title="Market Recap" />
        <MacroRecapCard
          recap={recap}
          loading={recapLoading}
          error={recapError}
          onRefresh={handleRefreshRecap}
        />
      </section>

      {/* ── Sentiment Gauge ──────────────────────────────── */}
      <section>
        <SectionHeader title="Sentiment Gauge" />
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
          <SentimentGauge score={score} loading={sentLoading} />
        </div>
      </section>

    </div>
  );
}
