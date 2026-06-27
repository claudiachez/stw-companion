import { useState, useMemo } from 'react';
import { environmentScore, regimeBand, trendSleeveScore } from '@stw/shared';
import { useCapabilities } from '../../context/AppCapabilities';
import {
  useMacroIndicators, ALL_INDICATORS,
  DEFAULT_TREND_SYMBOLS, EXPERT_TREND_SYMBOLS,
} from './useMacroIndicators';
import { useSentimentGauge } from './useSentimentGauge';
import { useWeeklyRecap } from './useWeeklyRecap';
import { useMacroPrefs } from './useMacroPrefs';
import { useGraddox } from '../signals/useGraddox';
import { RegimeBanner } from './components/RegimeBanner';
import { TrendStructureTable } from './components/TrendStructureTable';
import { SentimentGauge } from './components/SentimentGauge';
import { MacroRecapCard } from './components/MacroRecapCard';

// Section header (title outside the card; matches PortfolioDashboard pattern).
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

  // Trend symbols: defaults + any expert symbols toggled on, in canonical order.
  const visibleSymbols = useMemo(() => {
    const base = [...DEFAULT_TREND_SYMBOLS];
    EXPERT_TREND_SYMBOLS.forEach((s) => { if (prefs.visibleIndicators.includes(s)) base.push(s); });
    return ALL_INDICATORS.map((i) => i.symbol).filter((s) => base.includes(s));
  }, [prefs.visibleIndicators]);

  const { indicators, loading: indLoading } = useMacroIndicators(visibleSymbols, finnhubKey, twelveDataKey);
  const { score, loading: sentLoading } = useSentimentGauge(finnhubKey, twelveDataKey);
  const { recap, loading: recapLoading, error: recapError, generate } = useWeeklyRecap();

  const visibleIndicators = indicators.filter((i) => visibleSymbols.includes(i.symbol));

  // Market Regime — weighted module scores. Only the Trend sleeve is live so far;
  // the other sleeves fill in as Modules 5–8 are built (missing weight redistributes).
  const regime = useMemo(() => {
    const trend = trendSleeveScore(visibleIndicators.map((i) => i.bucket));
    const env = environmentScore([
      { key: 'trend', score: trend },
      { key: 'volatility', score: null },
      { key: 'credit', score: null },
      { key: 'rates_dollar', score: null },
      { key: 'gex', score: null },
    ]);
    return env === null ? null : regimeBand(env);
  }, [visibleIndicators]);

  const updatedAt = useMemo(() => (indLoading ? null : new Date()), [indLoading]);

  function handleRefreshRecap() {
    generate(visibleIndicators, graddox?.bias ?? '', graddox?.bias_note ?? '');
  }

  return (
    <div style={{ padding: '16px', maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Module 1: Market Regime Banner ─────────────────────────── */}
      <RegimeBanner regime={regime} updatedAt={updatedAt} />

      {/* ── Module 4: Trend / Market Structure ─────────────────────── */}
      <section>
        <SectionHeader title="Trend / Market Structure" />
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
          {indLoading && indicators.length === 0 ? (
            <div style={{ color: 'var(--t3)', fontSize: 12 }}>Loading market structure…</div>
          ) : (
            <TrendStructureTable
              indicators={indicators}
              visibleSymbols={visibleSymbols}
              onToggle={toggle}
              showExpert={showExpert}
              onToggleExpert={() => setShowExpert((v) => !v)}
            />
          )}
        </div>
      </section>

      {/* ── Module 9: Risk Appetite (gauge) ────────────────────────── */}
      <section>
        <SectionHeader title="Risk Appetite" />
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
          <SentimentGauge score={score} loading={sentLoading} />
        </div>
      </section>

      {/* ── Module 10: AI Recap ────────────────────────────────────── */}
      <section>
        <SectionHeader title="Market Recap" />
        <MacroRecapCard
          recap={recap}
          loading={recapLoading}
          error={recapError}
          onRefresh={handleRefreshRecap}
        />
      </section>

    </div>
  );
}
