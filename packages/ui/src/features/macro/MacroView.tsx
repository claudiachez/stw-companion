import { useMemo } from 'react';
import {
  environmentScore, regimeBand, trendSleeveScore, trendSleeveLabel, trendSubScore, gexScore,
  gexBiasLabel, stressLabel, creditLabel, ratesDollarLabel, regimeDirectionLabel, FONT_SIZE,
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
import { useDailyRecap } from './useDailyRecap';
import { useSectorRotation } from './useSectorRotation';
import { useMacroPrefs } from './useMacroPrefs';
import { useMacroTrendHistory } from './useMacroTrendHistory';
import { useMacroEvents } from './useMacroEvents';
import { useGraddox } from '../signals/useGraddox';
import { RegimeBanner } from './components/RegimeBanner';
import { ModuleScoreStrip } from './components/ModuleScoreStrip';
import { MacroEventRiskCard } from './components/MacroEventRiskCard';
import { TrendStructureTable } from './components/TrendStructureTable';
import { MarketInternalsCard } from './components/MarketInternalsCard';
import { GexPositioningCard } from './components/GexPositioningCard';
import { SentimentGauge } from './components/SentimentGauge';
import { MacroRecapCard } from './components/MacroRecapCard';
import { SectorRotationCard } from './components/SectorRotationCard';
import { ModuleHeader } from './components/macroVisuals';

// Concise "what is this / why it matters / how to read it" blurbs, shown via the
// collapsible ⓘ on each module header (collapsed by default — no clutter).
const HELP = {
  regime: 'The overall market read, computed from weighted sleeve scores — Trend 30%, Volatility 20%, Credit 15%, Rates+Dollar 15%, GEX 20%. 75–100 = Risk-On, 60–74 = Constructive, 45–59 = Cautious, 30–44 = Defensive, 0–29 = Risk-Off. It answers: how aggressive should I be right now?',
  strip: "Each sleeve's 0–100 score at a glance (higher = more risk-on). Shows what's actually driving the regime — whether it's trend, stress, credit, rates, or positioning.",
  trend: 'Are risk assets technically intact? Each index vs its 9-, 21- and 200-day moving averages. Above all three = momentum; below the 200-day = risk-off; below the 200-day but bouncing above the short ones = a bear-market rally (not bullish). The heaviest sleeve (30%).',
  internals: 'Three cross-check sleeves in one place — tap a row to expand. Volatility/Stress: is fear rising? (VIX = expected S&P volatility; IV Premium = VIX ÷ realized vol). Credit/Liquidity: is credit confirming the equity move? (HYG vs its 50-day average — an early warning; a proxy until true HY spreads land). Rates+Dollar: are macro headwinds building? (rising 10-year yields + a strengthening dollar pressure growth stocks; yields falling while stress rises is a flight to safety, not a tailwind). Higher score = more risk-on.',
  gex: "STW Graddox's options-positioning read (dealer gamma exposure) — Bullish / Flat / Conflicted / Bearish, with key SPY and QQQ levels. A tactical overlay: it helps time entries and spot pivots, but doesn't set the whole macro picture on its own.",
  riskAppetite: 'How much fear vs greed is priced right now (0 = extreme fear, 100 = extreme greed). A different question from the regime: the regime is what the environment IS; this is how emotional the tape is. Built from momentum, VIX, IV premium, tail risk, GEX, credit and breadth.',
  recap: 'An AI note that turns all the module scores into a plain-English read plus a suggested trading mode. Auto-generates twice daily: a pre-market note at 8am ET and a post-market recap at 4:30pm ET.',
  eventRisk: "What scheduled macro events (CPI, FOMC, jobs, etc.) could change the setup in the next 1-2 days. This is a temporary OVERLAY, not a permanent change to the regime score — it fades a few trading days after the print unless the structure actually shifted. MVP data source: MarketWatch's economic calendar; cross-check FXStreet for confirmation.",
  sectorRotation: "Where money is rotating across the 11 SPDR sectors, ranked #1 (leading) to #11 (lagging) by structure + 1-month RS. Structure = the same 9/21/200-day trend bucketing used in the Trend module; the radar plots each sector's RS vs SPY (percentage points) across Week/1M/3M/6M/1Y. Leaders/Setting Up below each radar are names from that sector with confirmed bullish structure (Leaders) or turning positive on 1M RS (Setting Up) — useful context for understanding where the sector is headed.",
};

export function MacroView() {
  const { finnhubKey, twelveDataKey, canEdit } = useCapabilities();
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
  const { data: volatility, loading: volLoading } = useVolatilityStress(twelveDataKey);
  const { data: credit, loading: creditLoading } = useCreditLiquidity(twelveDataKey);
  // Stress rising = VIX climbing or credit below its 50D — feeds the US10Y
  // flight-to-safety cross-check so a fast yield drop in stress isn't read bullish.
  const stressRising = (volatility?.vixDelta5 ?? 0) > 0.5 || credit?.aboveMa50 === false;
  const { data: rates, loading: ratesLoading } = useRatesDollar(stressRising);
  const { score, loading: sentLoading } = useSentimentGauge(finnhubKey, twelveDataKey);
  const { recap, recapDate, recapSession, loading: recapLoading, error: recapError, generate } = useDailyRecap();
  const { read: eventsRead, loading: eventsLoading, error: eventsError, warning: eventsWarning } = useMacroEvents();
  const { rows: sectorRows, loading: sectorLoading, asOf: sectorAsOf, constituents: sectorConstituents, constituentsLoading: sectorConstituentsLoading } = useSectorRotation(twelveDataKey);

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

  function handleRefreshRecap(note?: string, session?: 'am' | 'pm') {
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
        volatility: volatility ? { vix: volatility.vix, ivPremium: volatility.ivPremium } : null,
        riskAppetite: score ? { total: score.total, inputs: score.inputs.map((x) => ({ label: x.label, score: x.score })) } : null,
        gex: graddox ? { bias: graddox.bias, biasNote: graddox.bias_note, lastUpdated: graddox.last_updated, spx: graddox.spx, qqq: graddox.qqq } : null,
      },
      eventRisk: null,
    }, note, session);
  }

  // Auto-generate today's PM recap on first load once the sleeves have settled.
  // Only fires if there's no recap for TODAY yet (date check). Subscribers just
  // wait for the cross-device row to come back; only the editor auto-triggers it.
  // No auto-generate for daily recaps — the AM and PM scheduled Netlify functions
  // own generation. Admin uses the Regenerate button for intentional rewrites only.

  return (
    // Layout's <main> is overflow:hidden inside a 100dvh shell — this view owns its scroll.
    <div style={{ height: '100%', overflowY: 'auto' }}>
    <div style={{ padding: '16px', maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Module 1: Market Regime Banner ─────────────────────────── */}
      <section>
        <ModuleHeader title="Market Regime" help={HELP.regime} />
        <RegimeBanner regime={dataReady ? regime : null} updatedAt={updatedAt} direction={regimeDirection} />
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
            <div style={{ color: 'var(--t3)', fontSize: FONT_SIZE.sm }}>Loading market structure…</div>
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

      {/* ── Modules 5–7: Market Internals (Volatility · Credit · Rates+Dollar) ── */}
      <section>
        <ModuleHeader title="Market Internals" help={HELP.internals} />
        <MarketInternalsCard
          volatility={volatility} volLoading={volLoading}
          credit={credit} creditLoading={creditLoading}
          rates={rates} ratesLoading={ratesLoading}
          stressRising={stressRising}
        />
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
          recapDate={recapDate}
          recapSession={recapSession}
          loading={recapLoading}
          error={recapError}
          canEdit={canEdit}
          onRefresh={handleRefreshRecap}
        />
      </section>

      {/* ── Module 11: Sector Rotation ──────────────────────────────── */}
      <section>
        <ModuleHeader title="Sector Rotation" help={HELP.sectorRotation} />
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
          <SectorRotationCard
            rows={sectorRows}
            loading={sectorLoading}
            asOf={sectorAsOf}
            constituents={sectorConstituents}
            constituentsLoading={sectorConstituentsLoading}
          />
        </div>
      </section>

    </div>
    </div>
  );
}
