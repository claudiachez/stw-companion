import { useMemo, useEffect, useRef } from 'react';
import {
  environmentScore, regimeBand, trendSleeveScore, trendSleeveLabel, trendSubScore, gexScore,
  gexBiasLabel, stressLabel, creditLabel, ratesDollarLabel, regimeDirectionLabel,
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
import { useMacroTrendHistory } from './useMacroTrendHistory';
import { useMacroEvents } from './useMacroEvents';
import { useGraddox } from '../signals/useGraddox';
import { RegimeBanner } from './components/RegimeBanner';
import { ModuleScoreStrip } from './components/ModuleScoreStrip';
import { MacroEventRiskCard } from './components/MacroEventRiskCard';
import { TrendStructureTable } from './components/TrendStructureTable';
import { VolatilityStressCard } from './components/VolatilityStressCard';
import { CreditLiquidityCard } from './components/CreditLiquidityCard';
import { RatesDollarCard } from './components/RatesDollarCard';
import { GexPositioningCard } from './components/GexPositioningCard';
import { SentimentGauge } from './components/SentimentGauge';
import { MacroRecapCard } from './components/MacroRecapCard';
import { ModuleHeader } from './components/macroVisuals';

// Concise "what is this / why it matters / how to read it" blurbs, shown via the
// collapsible ⓘ on each module header (collapsed by default — no clutter).
const HELP = {
  regime: 'The overall market read, computed from weighted sleeve scores — Trend 30%, Volatility 20%, Credit 15%, Rates+Dollar 15%, GEX 20%. 75–100 = Risk-On, 60–74 = Constructive, 45–59 = Cautious, 30–44 = Defensive, 0–29 = Risk-Off. It answers: how aggressive should I be right now?',
  strip: "Each sleeve's 0–100 score at a glance (higher = more risk-on). Shows what's actually driving the regime — whether it's trend, stress, credit, rates, or positioning.",
  trend: 'Are risk assets technically intact? Each index vs its 9-, 21- and 200-day moving averages. Above all three = momentum; below the 200-day = risk-off; below the 200-day but bouncing above the short ones = a bear-market rally (not bullish). The heaviest sleeve (30%).',
  volatility: 'Is fear rising? VIX = expected S&P volatility; VVIX = volatility-of-volatility (tail risk); IV Premium = VIX ÷ realized vol (how expensive hedges are vs how much the market is actually moving). Higher score = calmer.',
  credit: 'Is credit confirming the equity move? HYG (high-yield bond ETF) vs its 50-day average — credit usually weakens before stocks do, so it acts as an early warning. A proxy for now; true high-yield spreads come later.',
  rates: 'Are macro headwinds building? Rising 10-year yields and a strengthening dollar pressure growth and speculative stocks. Key nuance: yields falling while stress rises is a flight to safety, not a growth tailwind.',
  gex: "STW's options-positioning read (dealer gamma exposure) — Bullish / Flat / Conflicted / Bearish, with key SPY and QQQ levels. A tactical overlay: it helps time entries and spot pivots, but doesn't set the whole macro picture on its own.",
  riskAppetite: 'How much fear vs greed is priced right now (0 = extreme fear, 100 = extreme greed). A different question from the regime: the regime is what the environment IS; this is how emotional the tape is. Built from momentum, VIX, IV premium, tail risk, GEX, credit and breadth.',
  recap: 'An AI summary that turns all the module scores into a plain-English read plus a suggested trading mode. Generates automatically and refreshes weekly.',
  eventRisk: "What scheduled macro events (CPI, FOMC, jobs, etc.) could change the setup in the next 1-2 days. This is a temporary OVERLAY, not a permanent change to the regime score — it fades a few trading days after the print unless the structure actually shifted. MVP data source: MarketWatch's economic calendar; cross-check FXStreet for confirmation.",
};

export function MacroView() {
  const { finnhubKey, twelveDataKey } = useCapabilities();
  const { prefs, toggle } = useMacroPrefs();
  const { data: graddox } = useGraddox();

  // Fetch the FULL trend set always (so the recap can speak to small-caps/
  // equal-weight rotation even when those rows are toggled off); the table and the
  // regime sleeve use only the visible subset.
  const allSymbols = useMemo(() => ALL_INDICATORS.map((i) => i.symbol), []);
  const visibleSymbols = useMemo(() => {
    const base = [...DEFAULT_TREND_SYMBOLS];
    EXPERT_TREND_SYMBOLS.forEach((s) => { if (prefs.visibleIndicators.includes(s)) base.push(s); });
    return allSymbols.filter((s) => base.includes(s));
  }, [prefs.visibleIndicators, allSymbols]);

  const { indicators, loading: indLoading, asOf: trendAsOf } = useMacroIndicators(allSymbols, finnhubKey, twelveDataKey);
  const { data: volatility, loading: volLoading } = useVolatilityStress(finnhubKey, twelveDataKey);
  const { data: credit, loading: creditLoading } = useCreditLiquidity(twelveDataKey);
  // Stress rising = VIX climbing or credit below its 50D — feeds the US10Y
  // flight-to-safety cross-check so a fast yield drop in stress isn't read bullish.
  const stressRising = (volatility?.vixDelta5 ?? 0) > 0.5 || credit?.aboveMa50 === false;
  const { data: rates, loading: ratesLoading } = useRatesDollar(twelveDataKey, stressRising);
  const { score, loading: sentLoading } = useSentimentGauge(finnhubKey, twelveDataKey);
  const { recap, loading: recapLoading, error: recapError, generate } = useWeeklyRecap();
  const { read: eventsRead, loading: eventsLoading, error: eventsError, warning: eventsWarning } = useMacroEvents();

  const visibleIndicators = indicators.filter((i) => visibleSymbols.includes(i.symbol));
  const qqqBucket = indicators.find((i) => i.symbol === 'QQQ')?.bucket ?? null;

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

  // P2: 5D trend engine — one localStorage snapshot/day, read back as 5D/20D
  // deltas + a direction classification. Deltas stay null until ~5 trading
  // days of history accrue (expected, not a bug).
  const dataReady = !indLoading && !volLoading && !creditLoading && !ratesLoading;
  const trendHistory = useMacroTrendHistory({
    ready: dataReady,
    regime: regime?.score ?? null,
    trend: trendSleeve,
    volatility: volatility?.sleeveScore ?? null,
    credit: credit?.sleeveScore ?? null,
    ratesDollar: rates?.sleeveScore ?? null,
    gex: gexSleeve,
    riskAppetite: score?.total ?? null,
    indicators: indicators.map((i) => ({ symbol: i.symbol, score: trendSubScore(i.bucket) })),
  });
  const regimeDirection = dataReady ? regimeDirectionLabel(trendHistory.deltas.regime.direction) : null;

  // Module 2: per-sleeve score strip. GEX uses a 3D delta (it moves fast); the
  // rest use the standard 5D delta.
  const stripItems = [
    { key: 'trend',       title: 'Trend',     score: trendSleeve,                 detail: trendSleeveLabel(trendSleeve), fiveDayDelta: trendHistory.deltas.trend.fiveDayDelta },
    { key: 'volatility',  title: 'Volatility', score: volatility?.sleeveScore ?? null, detail: stressLabel(volatility?.sleeveScore ?? null), fiveDayDelta: trendHistory.deltas.volatility.fiveDayDelta },
    { key: 'credit',      title: 'Credit',    score: credit?.sleeveScore ?? null,  detail: creditLabel(credit?.sleeveScore ?? null), fiveDayDelta: trendHistory.deltas.credit.fiveDayDelta },
    { key: 'rates',       title: 'Rates/USD', score: rates?.sleeveScore ?? null,   detail: ratesDollarLabel(rates?.sleeveScore ?? null), fiveDayDelta: trendHistory.deltas.rates_dollar.fiveDayDelta },
    { key: 'gex',         title: 'GEX',       score: gexSleeve,                    detail: gexBiasLabel(graddox?.bias), fiveDayDelta: trendHistory.deltas.gex.threeDayDelta, deltaLabel: '3D' as const },
  ];

  const updatedAt = useMemo(() => (indLoading ? null : new Date()), [indLoading]);

  function handleRefreshRecap() {
    if (!regime) return;
    generate({
      regime: { score: regime.score, label: regime.label, tradingMode: regime.tradingMode, fiveDayDelta: trendHistory.deltas.regime.fiveDayDelta },
      modules: {
        trend:       { score: trendSleeve, label: trendSleeveLabel(trendSleeve), fiveDayDelta: trendHistory.deltas.trend.fiveDayDelta },
        volatility:  { score: volatility?.sleeveScore ?? null, label: stressLabel(volatility?.sleeveScore ?? null), fiveDayDelta: trendHistory.deltas.volatility.fiveDayDelta },
        credit:      { score: credit?.sleeveScore ?? null, label: creditLabel(credit?.sleeveScore ?? null), fiveDayDelta: trendHistory.deltas.credit.fiveDayDelta },
        ratesDollar: { score: rates?.sleeveScore ?? null, label: ratesDollarLabel(rates?.sleeveScore ?? null), fiveDayDelta: trendHistory.deltas.rates_dollar.fiveDayDelta },
        gex:         { score: gexSleeve, label: gexBiasLabel(graddox?.bias), fiveDayDelta: trendHistory.deltas.gex.threeDayDelta },
      },
      // Grounding context for a richer, non-fabricated weekly narrative.
      // Always pass the full trend set (incl. IWM/RSP/VEA) so the rotation/breadth
      // story is grounded even when those rows are hidden in the table.
      context: {
        indicators: indicators.map((i) => ({ symbol: i.symbol, name: i.name, bucket: i.bucket, close: i.close, chgPct: i.chgPct })),
        volatility: volatility ? { vix: volatility.vix, vvix: volatility.vvix, ivPremium: volatility.ivPremium } : null,
        riskAppetite: score ? { total: score.total, inputs: score.inputs.map((x) => ({ label: x.label, score: x.score })) } : null,
        gex: graddox ? { bias: graddox.bias, biasNote: graddox.bias_note, lastUpdated: graddox.last_updated, spx: graddox.spx, qqq: graddox.qqq } : null,
      },
      eventRisk: null,
    });
  }

  // Auto-generate the recap on first load once the sleeves have settled — no
  // manual Refresh needed (cached per ISO week, so this fires at most once/week).
  const autoTriedRef = useRef(false);
  useEffect(() => {
    if (autoTriedRef.current || recap || recapLoading || !regime || !dataReady) return;
    autoTriedRef.current = true;
    handleRefreshRecap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataReady, regime, recap, recapLoading]);

  return (
    // Layout's <main> is overflow:hidden inside a 100dvh shell — this view owns its scroll.
    <div style={{ height: '100%', overflowY: 'auto' }}>
    <div style={{ padding: '16px', maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Module 1: Market Regime Banner ─────────────────────────── */}
      <section>
        <ModuleHeader title="Market Regime" help={HELP.regime} />
        <RegimeBanner regime={regime} updatedAt={updatedAt} direction={regimeDirection} />
      </section>

      {/* ── Module 2: Module Score Strip ───────────────────────────── */}
      <section>
        <ModuleHeader title="Module Scores" help={HELP.strip} />
        <ModuleScoreStrip items={stripItems} />
      </section>

      {/* ── Module 3: Macro Event Risk ─────────────────────────────── */}
      <section>
        <ModuleHeader title="Event Risk" help={HELP.eventRisk} />
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
          <MacroEventRiskCard
            read={eventsRead}
            loading={eventsLoading}
            error={eventsError}
            warning={eventsWarning}
            qqqBucket={qqqBucket}
            vix={volatility?.vix ?? null}
            vixDelta5={volatility?.vixDelta5 ?? null}
            us10yDelta5={rates?.us10yDelta5 ?? null}
          />
        </div>
      </section>

      {/* ── Module 4: Trend / Market Structure ─────────────────────── */}
      <section>
        <ModuleHeader title="Trend / Market Structure" help={HELP.trend} />
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
          {indLoading && indicators.length === 0 ? (
            <div style={{ color: 'var(--t3)', fontSize: 12 }}>Loading market structure…</div>
          ) : (
            <TrendStructureTable
              indicators={indicators}
              visibleSymbols={visibleSymbols}
              onToggle={toggle}
              asOf={trendAsOf}
              indicatorDeltas={trendHistory.indicatorDeltas}
            />
          )}
        </div>
      </section>

      {/* ── Module 5: Volatility / Stress ──────────────────────────── */}
      <section>
        <ModuleHeader title="Volatility / Stress" help={HELP.volatility} />
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
          <VolatilityStressCard data={volatility} loading={volLoading} />
        </div>
      </section>

      {/* ── Module 6: Credit / Liquidity ───────────────────────────── */}
      <section>
        <ModuleHeader title="Credit / Liquidity" help={HELP.credit} />
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
          <CreditLiquidityCard data={credit} loading={creditLoading} />
        </div>
      </section>

      {/* ── Module 7: Rates + Dollar Headwinds ─────────────────────── */}
      <section>
        <ModuleHeader title="Rates + Dollar Headwinds" help={HELP.rates} />
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
          <RatesDollarCard data={rates} loading={ratesLoading} stressRising={stressRising} />
        </div>
      </section>

      {/* ── Module 8: GEX / Positioning ────────────────────────────── */}
      <section>
        <ModuleHeader title="GEX / Positioning" help={HELP.gex} />
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
          <GexPositioningCard graddox={graddox} loading={!graddox} threeDayDelta={trendHistory.deltas.gex.threeDayDelta} />
        </div>
      </section>

      {/* ── Module 9: Risk Appetite (gauge) ────────────────────────── */}
      <section>
        <ModuleHeader title="Risk Appetite" help={HELP.riskAppetite} />
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
          <SentimentGauge score={score} loading={sentLoading} fiveDayDelta={trendHistory.deltas.risk_appetite.fiveDayDelta} />
        </div>
      </section>

      {/* ── Module 10: AI Recap ────────────────────────────────────── */}
      <section>
        <ModuleHeader title="Market Recap" help={HELP.recap} />
        <MacroRecapCard
          recap={recap}
          loading={recapLoading}
          error={recapError}
          onRefresh={handleRefreshRecap}
        />
      </section>

    </div>
    </div>
  );
}
