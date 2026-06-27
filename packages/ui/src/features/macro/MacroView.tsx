import { useState, useMemo } from 'react';
import {
  environmentScore, regimeBand, trendSleeveScore, trendSleeveLabel, gexScore,
  gexBiasLabel, stressLabel, creditLabel, ratesDollarLabel,
} from '@stw/shared';
import { useCapabilities } from '../../context/AppCapabilities';
import {
  useMacroIndicators, ALL_INDICATORS,
  DEFAULT_TREND_SYMBOLS, EXPERT_TREND_SYMBOLS,
} from './useMacroIndicators';
import { useSentimentGauge } from './useSentimentGauge';
import { useVolatilityStress } from './useVolatilityStress';
import { useCreditLiquidity } from './useCreditLiquidity';
import { useRatesDollar } from './useRatesDollar';
import { useWeeklyRecap } from './useWeeklyRecap';
import { useMacroPrefs } from './useMacroPrefs';
import { useGraddox } from '../signals/useGraddox';
import { RegimeBanner } from './components/RegimeBanner';
import { ModuleScoreStrip } from './components/ModuleScoreStrip';
import { TrendStructureTable } from './components/TrendStructureTable';
import { VolatilityStressCard } from './components/VolatilityStressCard';
import { CreditLiquidityCard } from './components/CreditLiquidityCard';
import { RatesDollarCard } from './components/RatesDollarCard';
import { GexPositioningCard } from './components/GexPositioningCard';
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
  const { data: volatility, loading: volLoading } = useVolatilityStress(finnhubKey, twelveDataKey);
  const { data: credit, loading: creditLoading } = useCreditLiquidity(twelveDataKey);
  // Stress rising = VIX climbing or credit below its 50D — feeds the US10Y
  // flight-to-safety cross-check so a fast yield drop in stress isn't read bullish.
  const stressRising = (volatility?.vixDelta5 ?? 0) > 0.5 || credit?.aboveMa50 === false;
  const { data: rates, loading: ratesLoading } = useRatesDollar(twelveDataKey, stressRising);
  const { score, loading: sentLoading } = useSentimentGauge(finnhubKey, twelveDataKey);
  const { recap, loading: recapLoading, error: recapError, generate } = useWeeklyRecap();

  const visibleIndicators = indicators.filter((i) => visibleSymbols.includes(i.symbol));

  // Market Regime — weighted module scores across all five sleeves
  // (a missing sleeve redistributes its weight across the present ones).
  const trendSleeve = useMemo(
    () => trendSleeveScore(visibleIndicators.map((i) => i.bucket)),
    [visibleIndicators],
  );
  const gexSleeve = gexScore(graddox?.bias);

  const regime = useMemo(() => {
    const env = environmentScore([
      { key: 'trend', score: trendSleeve },
      { key: 'volatility', score: volatility?.sleeveScore ?? null },
      { key: 'credit', score: credit?.sleeveScore ?? null },
      { key: 'rates_dollar', score: rates?.sleeveScore ?? null },
      { key: 'gex', score: gexSleeve },
    ]);
    return env === null ? null : regimeBand(env);
  }, [trendSleeve, volatility?.sleeveScore, credit?.sleeveScore, rates?.sleeveScore, gexSleeve]);

  // Module 2: per-sleeve score strip (5D deltas arrive with the P2 trend engine).
  const stripItems = [
    { key: 'trend',       title: 'Trend',     score: trendSleeve,                 detail: trendSleeveLabel(trendSleeve) },
    { key: 'volatility',  title: 'Volatility', score: volatility?.sleeveScore ?? null, detail: stressLabel(volatility?.sleeveScore ?? null) },
    { key: 'credit',      title: 'Credit',    score: credit?.sleeveScore ?? null,  detail: creditLabel(credit?.sleeveScore ?? null) },
    { key: 'rates',       title: 'Rates/USD', score: rates?.sleeveScore ?? null,   detail: ratesDollarLabel(rates?.sleeveScore ?? null) },
    { key: 'gex',         title: 'GEX',       score: gexSleeve,                    detail: gexBiasLabel(graddox?.bias) },
  ];

  const updatedAt = useMemo(() => (indLoading ? null : new Date()), [indLoading]);

  function handleRefreshRecap() {
    if (!regime) return;
    generate({
      regime: { score: regime.score, label: regime.label, tradingMode: regime.tradingMode },
      modules: {
        trend:       { score: trendSleeve, label: trendSleeveLabel(trendSleeve) },
        volatility:  { score: volatility?.sleeveScore ?? null, label: stressLabel(volatility?.sleeveScore ?? null) },
        credit:      { score: credit?.sleeveScore ?? null, label: creditLabel(credit?.sleeveScore ?? null) },
        ratesDollar: { score: rates?.sleeveScore ?? null, label: ratesDollarLabel(rates?.sleeveScore ?? null) },
        gex:         { score: gexSleeve, label: gexBiasLabel(graddox?.bias) },
      },
      eventRisk: null,
    });
  }

  return (
    <div style={{ padding: '16px', maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Module 1: Market Regime Banner ─────────────────────────── */}
      <RegimeBanner regime={regime} updatedAt={updatedAt} />

      {/* ── Module 2: Module Score Strip ───────────────────────────── */}
      <ModuleScoreStrip items={stripItems} />

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

      {/* ── Module 5: Volatility / Stress ──────────────────────────── */}
      <section>
        <SectionHeader title="Volatility / Stress" />
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
          <VolatilityStressCard data={volatility} loading={volLoading} />
        </div>
      </section>

      {/* ── Module 6: Credit / Liquidity ───────────────────────────── */}
      <section>
        <SectionHeader title="Credit / Liquidity" />
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
          <CreditLiquidityCard data={credit} loading={creditLoading} />
        </div>
      </section>

      {/* ── Module 7: Rates + Dollar Headwinds ─────────────────────── */}
      <section>
        <SectionHeader title="Rates + Dollar Headwinds" />
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
          <RatesDollarCard data={rates} loading={ratesLoading} stressRising={stressRising} />
        </div>
      </section>

      {/* ── Module 8: GEX / Positioning ────────────────────────────── */}
      <section>
        <SectionHeader title="GEX / Positioning" />
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
          <GexPositioningCard graddox={graddox} loading={!graddox} />
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
