import { useMemo, type ReactNode } from 'react';
import {
  environmentScore, regimeBand, trendSleeveScore, trendSleeveLabel, trendSubScore,
  gexPositioningLabel, stressLabel, creditLabel, ratesDollarLabel, isTradingDay, FONT_SIZE,
} from '@stw/shared';
import { useCapabilities } from '../../context/AppCapabilities';
import { useAppConfig } from '../../hooks/useAppConfig';
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
import { useMacroTrendHistory, resolveDelta } from './useMacroTrendHistory';
import { useGexExposure } from './useGexExposure';
import { useMacroEvents } from './useMacroEvents';
import { useGraddox } from '../signals/useGraddox';
import { RegimeCard } from './components/RegimeCard';
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
// collapsible ⓘ on each module header (collapsed by default — no clutter). Each
// help blurb is structured into short lines (lead → detail → muted footer) via
// <Help>, not a wall of text — same legibility pass as the Market Internals rows.
function Help({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>;
}
const dim = { color: 'var(--t3)' } as const;

const HELP = {
  // regime help is built in the component (regimeHelp) so it shows the live,
  // admin-configured weights (migration 061) rather than a hardcoded line.
  strip: (
    <Help>
      <div>Each sleeve's 0–100 score at a glance — <strong>higher = more risk-on</strong>.</div>
      <div style={dim}>Shows what's actually driving the regime: trend, stress, credit, rates or positioning.</div>
    </Help>
  ),
  trend: (
    <Help>
      <div>Are risk assets technically intact? Each index vs its 9-, 21- and 200-day moving averages. The heaviest sleeve (30%).</div>
      <div><strong>Above all three</strong> — momentum.</div>
      <div><strong>Below the 200-day</strong> — risk-off.</div>
      <div><strong>Below the 200-day but bouncing above the short ones</strong> — a bear-market rally, not bullish.</div>
    </Help>
  ),
  internals: (
    <Help>
      <div><strong>Volatility / Stress</strong> — VIX (expected S&P volatility) + IV premium (VIX ÷ realized vol). Higher = calmer.</div>
      <div><strong>Credit / Liquidity</strong> — HY OAS spread vs its 50-day average. A widening spread warns of credit stress before stocks.</div>
      <div><strong>Rates + Dollar</strong> — 10-year yield + broad dollar. Both rising is a headwind for growth stocks (a yield drop during stress is flight-to-safety, not a tailwind).</div>
      <div style={dim}>Each sleeve is scored 0–100 — higher = more risk-on.</div>
    </Help>
  ),
  gex: (
    <Help>
      <div>Options-positioning read (dealer gamma exposure) for SPX, with the <strong>gamma flip</strong>, <strong>call wall</strong> and <strong>put wall</strong>.</div>
      <div><strong>Above the flip</strong> — positive gamma: dealers dampen moves, dips tend to hold (a grind, not a chase).</div>
      <div><strong>Below the flip</strong> — negative gamma: dealers amplify moves, breaks accelerate; keep size down.</div>
      <div style={dim}>A tactical overlay — helps time entries and spot pivots. Levels via SPX Gamma Edge.</div>
    </Help>
  ),
  riskAppetite: (
    <Help>
      <div>How much <strong>fear vs greed</strong> is priced right now (0 = extreme fear, 100 = extreme greed).</div>
      <div>Different from the regime: the regime is what the environment <em>is</em>; this is how emotional the tape is.</div>
      <div style={dim}>Built from momentum, VIX, IV premium, GEX, credit and breadth.</div>
    </Help>
  ),
  recap: (
    <Help>
      <div>An AI note that turns all the module scores into a plain-English read plus a suggested trading mode.</div>
      <div style={dim}>Auto-generates twice each weekday: pre-market at 8am ET, post-market at 4:30pm ET.</div>
    </Help>
  ),
  eventRisk: (
    <Help>
      <div>Scheduled macro events (CPI, PCE, jobs, FOMC, GDP, PPI) that could move the setup in the next day or two.</div>
      <div>A temporary <strong>overlay</strong>, not a permanent regime change — it fades a few trading days after the print unless the structure actually shifted.</div>
      <div style={dim}>Source: FRED economic-release calendar + the published FOMC schedule.</div>
    </Help>
  ),
  sectorRotation: (
    <Help>
      <div>Where money is rotating across the 11 SPDR sectors, ranked #1 (leading) → #11 (lagging) by structure + 1-month relative strength.</div>
      <div><strong>Structure</strong> — the same 9/21/200-day trend bucketing as the Trend module.</div>
      <div><strong>Radar</strong> — each sector's RS vs SPY (percentage points) across Week/1M/3M/6M/1Y.</div>
      <div><strong>Leaders / Setting Up</strong> — names from that sector with confirmed bullish structure (Leaders) or turning positive on 1M RS (Setting Up).</div>
    </Help>
  ),
};

export function MacroView() {
  const { finnhubKey, twelveDataKey, canEdit } = useCapabilities();
  const { regimeWeights } = useAppConfig();
  const { prefs, toggle } = useMacroPrefs();
  // Graddox is retained only to ground the AI recap; the visible GEX card, the
  // regime GEX sleeve and the score strip read the SPX Gamma Edge snapshot via
  // useGexExposure.
  const { data: graddox } = useGraddox();
  const { data: gex, loading: gexLoading } = useGexExposure();

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
  const { data: credit, loading: creditLoading } = useCreditLiquidity();
  // Stress rising = VIX climbing or the HY spread wide vs its 50D — feeds the
  // US10Y flight-to-safety cross-check so a fast yield drop in stress isn't read bullish.
  const stressRising = (volatility?.vixDelta5 ?? 0) > 0.5 || credit?.belowMa50 === false;
  const { data: rates, loading: ratesLoading } = useRatesDollar(stressRising);
  const { score, loading: sentLoading } = useSentimentGauge(twelveDataKey);
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
  const gexSleeve = gex?.sleeveScore ?? null;
  const gexPositioning = gexPositioningLabel({ spot: gex?.spot ?? null, gammaFlip: gex?.gammaFlip ?? null });

  const regime = useMemo(() => {
    const env = environmentScore([
      { key: 'trend', score: trendSleeve },
      { key: 'volatility', score: volatility?.sleeveScore ?? null },
      { key: 'credit', score: credit?.sleeveScore ?? null },
      { key: 'rates_dollar', score: rates?.sleeveScore ?? null },
      { key: 'gex', score: gexSleeve },
    ], regimeWeights);
    return env === null ? null : regimeBand(env);
  }, [trendSleeve, volatility?.sleeveScore, credit?.sleeveScore, rates?.sleeveScore, gexSleeve, regimeWeights]);

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

  // Module 2: per-sleeve score strip. Every sleeve shows its best-available trend
  // (5D, or 3D as a fallback while history is short) so none reads as "missing";
  // GEX stays fixed on 3D (it moves fast — spec Module 8/2).
  const trendD = resolveDelta(trendHistory.deltas.trend);
  const volD = resolveDelta(trendHistory.deltas.volatility);
  const creditD = resolveDelta(trendHistory.deltas.credit);
  const ratesD = resolveDelta(trendHistory.deltas.rates_dollar);
  const stripItems = [
    { key: 'trend',       title: 'Trend',     score: trendSleeve,                 detail: trendSleeveLabel(trendSleeve), delta: trendD.value, deltaLabel: trendD.label },
    { key: 'volatility',  title: 'Volatility', score: volatility?.sleeveScore ?? null, detail: stressLabel(volatility?.sleeveScore ?? null), delta: volD.value, deltaLabel: volD.label },
    { key: 'credit',      title: 'Credit',    score: credit?.sleeveScore ?? null,  detail: creditLabel(credit?.sleeveScore ?? null), delta: creditD.value, deltaLabel: creditD.label },
    { key: 'rates',       title: 'Rates/USD', score: rates?.sleeveScore ?? null,   detail: ratesDollarLabel(rates?.sleeveScore ?? null), delta: ratesD.value, deltaLabel: ratesD.label },
    { key: 'gex',         title: 'GEX',       score: gexSleeve,                    detail: gexPositioning, delta: trendHistory.deltas.gex.threeDayDelta, deltaLabel: '3D' as const },
  ];

  const updatedAt = useMemo(() => (indLoading ? null : new Date()), [indLoading]);

  // On a non-trading day the live recompute drifts slightly from the last persisted
  // snapshot (different sleeve reads / feed lag), so the headline (62) could disagree
  // with the trajectory's newest lamp (63). Show the last COMPLETE session's regime
  // when the market's closed, so the current-status score == the newest lamp.
  const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const lastSeriesScore = [...trendHistory.regimeSeries].reverse().find((p) => p.score !== null)?.score ?? null;
  const displayRegime = (isTradingDay(todayET) || lastSeriesScore === null) ? regime : regimeBand(lastSeriesScore);

  function handleRefreshRecap(note?: string, session?: 'am' | 'pm') {
    if (!regime) return;
    generate({
      regime: { score: regime.score, label: regime.label, tradingMode: regime.tradingMode, fiveDayDelta: trendHistory.deltas.regime.fiveDayDelta },
      modules: {
        trend:       { score: trendSleeve, label: trendSleeveLabel(trendSleeve), fiveDayDelta: trendHistory.deltas.trend.fiveDayDelta },
        volatility:  { score: volatility?.sleeveScore ?? null, label: stressLabel(volatility?.sleeveScore ?? null), fiveDayDelta: trendHistory.deltas.volatility.fiveDayDelta },
        credit:      { score: credit?.sleeveScore ?? null, label: creditLabel(credit?.sleeveScore ?? null), fiveDayDelta: trendHistory.deltas.credit.fiveDayDelta },
        ratesDollar: { score: rates?.sleeveScore ?? null, label: ratesDollarLabel(rates?.sleeveScore ?? null), fiveDayDelta: trendHistory.deltas.rates_dollar.fiveDayDelta },
        gex:         { score: gexSleeve, label: gexPositioning, fiveDayDelta: trendHistory.deltas.gex.threeDayDelta },
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
        <ModuleHeader
          title="Market Regime"
          help={(
            <Help>
              <div>The overall market read — <strong>how aggressive to be right now</strong> — from weighted sleeve scores.</div>
              <div>75–100 <strong>Risk-On</strong> · 60–74 Constructive · 45–59 Cautious · 30–44 Defensive · 0–29 <strong>Risk-Off</strong>.</div>
              <div style={dim}>Weights: Trend {regimeWeights.trend}% · Volatility {regimeWeights.volatility}% · Credit {regimeWeights.credit}% · Rates+Dollar {regimeWeights.rates_dollar}% · GEX {regimeWeights.gex}%.</div>
              <div>The <strong>arrow</strong> shows the 5-day direction — whether the regime is improving, deteriorating or mixed.</div>
              <div>
                The <strong>dots</strong> track the last 10 trading days (oldest → today):{' '}
                <span style={{ color: 'var(--c5)' }}>green</span> risk-on ·{' '}
                <span style={{ color: 'var(--c3)' }}>amber</span> neutral ·{' '}
                <span style={{ color: 'var(--c1)' }}>red</span> risk-off. Read left → right to see if the backdrop is getting better or worse.
              </div>
            </Help>
          )}
        />
        <RegimeCard regime={dataReady ? displayRegime : null} updatedAt={updatedAt} series={trendHistory.regimeSeries} />
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
              updatedAt={updatedAt}
              indicatorDeltas={trendHistory.indicatorDeltas}
            />
          )}
        </div>
      </section>

      {/* ── Modules 5–7: Market Internals (Volatility · Credit · Rates+Dollar) ── */}
      <section>
        <ModuleHeader title="Market Internals" help={HELP.internals} />
        <MarketInternalsCard volatility={volatility} credit={credit} rates={rates} />
      </section>

      {/* ── Module 8: GEX / Positioning ────────────────────────────── */}
      <section>
        <ModuleHeader title="GEX / Positioning" help={HELP.gex} />
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
          <GexPositioningCard data={gex} loading={gexLoading} threeDayDelta={trendHistory.deltas.gex.threeDayDelta} />
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
            updatedAt={updatedAt}
            constituents={sectorConstituents}
            constituentsLoading={sectorConstituentsLoading}
          />
        </div>
      </section>

    </div>
    </div>
  );
}
