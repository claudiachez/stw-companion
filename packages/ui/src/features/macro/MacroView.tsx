import { useMemo, useState, type ReactNode } from 'react';
import {
  environmentScore, regimeBand, trendSleeveScore, trendSleeveLabel, trendSubScore,
  gexPositioningLabel, stressLabel, creditLabel, ratesDollarLabel, isTradingDay, MARKET_MOVERS,
  RISK_APPETITE_WEIGHTS, formatPct,
} from '@stw/shared';
import { useCapabilities } from '../../context/AppCapabilities';
import { useAppConfig } from '../../hooks/useAppConfig';
import { useIsMobile } from '../../hooks/useIsMobile';
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
import { useEarningsCalendar } from '../earnings/useEarningsCalendar';
import { useHoldings } from '../picks/useHoldings';
import { useUserPositions } from '../portfolio/useUserPositions';
import { useGraddox } from '../signals/useGraddox';
import { RegimeCard } from './components/RegimeCard';
import { SleeveDriversCard, type SleeveItem } from './components/SleeveDriversCard';
import { MacroRecapCard } from './components/MacroRecapCard';
import { ComingUpCard } from './components/ComingUpCard';
import { TrendStructureTable } from './components/TrendStructureTable';
import { MarketInternalsCard } from './components/MarketInternalsCard';
import { GexPositioningCard } from './components/GexPositioningCard';
import { SentimentGauge } from './components/SentimentGauge';
import { SectorRotationCard } from './components/SectorRotationCard';

// The webapp redesign lays Macro out as a single 900px column of surface cards
// (gap 12). This view is a RE-LAYOUT only — every number still comes from the
// existing macro hooks + shared scorers (environmentScore / regimeBand /
// trendSleeveScore / the sleeve hooks / relativeStrength / gexSleeveScore /
// sentiment composite / useMacroTrendHistory). The regime gate is frozen (engine
// 1.1.0) and read-only; the gate and the Macro composite never blend.

const dim = { color: 'var(--t3)' } as const;

export function MacroView() {
  const { finnhubKey, twelveDataKey, canEdit } = useCapabilities();
  const { regimeWeights } = useAppConfig();
  const { prefs, toggle } = useMacroPrefs();
  // Ref collapses the internals/GEX/fear 3-up from 3 columns straight to 1 at ≤860px
  // (no intermediate 2-col stage that auto-fit would produce).
  const threeUpNarrow = useIsMobile(860);

  // One-open-at-a-time ⓘ: a single section id in state, toggled per card header.
  const [help, setHelp] = useState<string | null>(null);
  const toggleHelp = (id: string) => setHelp((h) => (h === id ? null : id));

  // Graddox is retained only to ground the AI recap; the visible GEX card + the GEX
  // sleeve read the SPX Gamma Edge snapshot via useGexExposure.
  const { data: graddox } = useGraddox();
  const { data: gex, loading: gexLoading } = useGexExposure();

  // Fetch the FULL trend set always (so the recap can speak to small-caps/equal-
  // weight rotation even when those rows are hidden); the table + the regime sleeve
  // use only the visible subset.
  const allSymbols = useMemo(() => ALL_INDICATORS.map((i) => i.symbol), []);
  const visibleSymbols = useMemo(() => {
    const base = [...DEFAULT_TREND_SYMBOLS];
    EXPERT_TREND_SYMBOLS.forEach((s) => { if (prefs.visibleIndicators.includes(s)) base.push(s); });
    return allSymbols.filter((s) => base.includes(s));
  }, [prefs.visibleIndicators, allSymbols]);

  const { indicators, loading: indLoading, asOf: trendAsOf } = useMacroIndicators(allSymbols, finnhubKey, twelveDataKey);
  const { data: volatility, loading: volLoading } = useVolatilityStress(twelveDataKey);
  const { data: credit, loading: creditLoading } = useCreditLiquidity();
  const stressRising = (volatility?.vixDelta5 ?? 0) > 0.5 || credit?.belowMa50 === false;
  const { data: rates, loading: ratesLoading } = useRatesDollar(stressRising);
  const { score, loading: sentLoading } = useSentimentGauge(twelveDataKey);
  const { recap, recapDate, recapSession, loading: recapLoading, error: recapError, generate } = useDailyRecap();
  const { events: eventsList, read: eventsRead, loading: eventsLoading, error: eventsError, warning: eventsWarning } = useMacroEvents();
  const { data: holdings } = useHoldings();
  const { data: userPositions } = useUserPositions();

  // Earnings covers the user's OWN positions ∪ STW holdings ∪ mega-cap movers.
  const ownTickers = useMemo(
    () => Array.from(new Set(
      (userPositions ?? [])
        .filter((p) => (p.quantity ?? 0) !== 0)
        .map((p) => p.underlying?.toUpperCase())
        .filter((t): t is string => !!t && t !== 'CASH'),
    )),
    [userPositions],
  );
  const stwTickers = useMemo(
    () => (holdings ?? [])
      .filter((h) => h.last_action !== 'Closed' && (h.current_weight ?? 0) > 0)
      .map((h) => h.ticker)
      .filter((t): t is string => !!t && t !== 'CASH'),
    [holdings],
  );
  // Fetch earnings per-symbol for the tracked union (own book ∪ STW ∪ movers) — the bulk
  // Finnhub calendar hides the nearest ~3 weeks, so we fan out over exactly these names.
  const earningsTickers = useMemo(
    () => Array.from(new Set([...ownTickers, ...stwTickers, ...MARKET_MOVERS])),
    [ownTickers, stwTickers],
  );
  const { upcomingFor: upcomingEarningsFor, loading: earningsLoading, error: earningsError } = useEarningsCalendar(earningsTickers);
  const upcomingEarnings = useMemo(
    () => upcomingEarningsFor(earningsTickers),
    [upcomingEarningsFor, earningsTickers],
  );
  const { rows: sectorRows, loading: sectorLoading, asOf: sectorAsOf, constituents: sectorConstituents, constituentsLoading: sectorConstituentsLoading } = useSectorRotation(twelveDataKey);

  const visibleIndicators = indicators.filter((i) => visibleSymbols.includes(i.symbol));

  // Market Regime — weighted module scores across all five sleeves.
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

  const trendD = resolveDelta(trendHistory.deltas.trend);
  const volD = resolveDelta(trendHistory.deltas.volatility);
  const creditD = resolveDelta(trendHistory.deltas.credit);
  const ratesD = resolveDelta(trendHistory.deltas.rates_dollar);
  const sleeveItems: SleeveItem[] = [
    { key: 'trend',      name: 'Trend',      weight: `${regimeWeights.trend}%`,        score: trendSleeve,                    note: trendSleeveLabel(trendSleeve),                    delta: trendD.value,  deltaLabel: trendD.label },
    { key: 'volatility', name: 'Volatility', weight: `${regimeWeights.volatility}%`,   score: volatility?.sleeveScore ?? null, note: stressLabel(volatility?.sleeveScore ?? null),     delta: volD.value,    deltaLabel: volD.label },
    { key: 'credit',     name: 'Credit',     weight: `${regimeWeights.credit}%`,       score: credit?.sleeveScore ?? null,     note: creditLabel(credit?.sleeveScore ?? null),         delta: creditD.value, deltaLabel: creditD.label },
    { key: 'rates',      name: 'Rates / USD', weight: `${regimeWeights.rates_dollar}%`, score: rates?.sleeveScore ?? null,      note: ratesDollarLabel(rates?.sleeveScore ?? null),     delta: ratesD.value,  deltaLabel: ratesD.label },
    { key: 'gex',        name: 'GEX',        weight: `${regimeWeights.gex}%`,          score: gexSleeve,                       note: gexPositioning,                                   delta: trendHistory.deltas.gex.threeDayDelta, deltaLabel: '3D' },
  ];

  const updatedAt = useMemo(() => (indLoading ? null : new Date()), [indLoading]);

  // On a non-trading day the live recompute drifts slightly from the last persisted
  // snapshot, so show the last COMPLETE session's regime when the market's closed.
  const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const lastSeriesScore = [...trendHistory.regimeSeries].reverse().find((p) => p.score !== null)?.score ?? null;
  const displayRegime = (isTradingDay(todayET) || lastSeriesScore === null) ? regime : regimeBand(lastSeriesScore);

  // True only during the RTH session (9:30–16:00 ET on a trading day) — the drift line only
  // claims "Live" while the tape is actually moving; after the close it reads "at today's close".
  const marketLive = useMemo(() => {
    if (!isTradingDay(todayET)) return false;
    const nowEt = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const mins = nowEt.getHours() * 60 + nowEt.getMinutes();
    return mins >= 570 && mins < 960;
  }, [todayET]);

  // Honest live-price CONTEXT for the regime card: the composite score is the daily-close
  // read (structure = price vs the daily MAs — see #151), but this shows how the headline
  // indexes are moving intraday so the card reflects today without faking a recompute. The
  // "refreshes daily after the close" cadence lives in the card footer — not restated here.
  const liveDrift = useMemo(() => {
    const spy = indicators.find((i) => i.symbol === 'SPY');
    const qqq = indicators.find((i) => i.symbol === 'QQQ');
    const parts: string[] = [];
    if (spy?.chgPct != null) parts.push(`S&P ${formatPct(spy.chgPct)}`);
    if (qqq?.chgPct != null) parts.push(`Nasdaq ${formatPct(qqq.chgPct)}`);
    if (parts.length === 0) return null;
    // If the S&P's live price is hugging one of its daily MA lines, name it — that's where a
    // structure change would show up at the close.
    let maNote = '';
    if (spy && spy.close != null) {
      const spyClose = spy.close;
      const mas: Array<[string, number | null | undefined]> = [['9-day', spy.ma9], ['21-day', spy.ma21], ['200-day', spy.ma200]];
      const present = mas.filter((m): m is [string, number] => typeof m[1] === 'number');
      if (present.length) {
        const nearest = present.reduce((b, m) => (Math.abs(m[1] - spyClose) < Math.abs(b[1] - spyClose) ? m : b));
        if (Math.abs((spyClose - nearest[1]) / nearest[1]) * 100 <= 0.6) maNote = ` · testing the ${nearest[0]} line`;
      }
    }
    return `${parts.join(' · ')} ${marketLive ? 'today' : "at today's close"}${maNote}`;
  }, [indicators, marketLive]);

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
      context: {
        indicators: indicators.map((i) => ({ symbol: i.symbol, name: i.name, bucket: i.bucket, close: i.close, chgPct: i.chgPct })),
        volatility: volatility ? { vix: volatility.vix, ivPremium: volatility.ivPremium } : null,
        riskAppetite: score ? { total: score.total, inputs: score.inputs.map((x) => ({ label: x.label, score: x.score })) } : null,
        gex: graddox ? { bias: graddox.bias, biasNote: graddox.bias_note, lastUpdated: graddox.last_updated, spx: graddox.spx, qqq: graddox.qqq } : null,
      },
      eventRisk: eventsRead.event ? {
        level: eventsRead.riskLevel,
        event: eventsRead.event.eventName,
        time: eventsRead.event.releaseTimeEt,
        consensus: eventsRead.event.consensus ?? undefined,
        previous: eventsRead.event.previous ?? undefined,
        overlay: eventsRead.overlay,
      } : null,
    }, note, session);
  }

  return (
    // Layout's <main> is overflow:hidden inside a 100dvh shell — this view owns its scroll.
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '16px 16px 32px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* 1 — Regime verdict banner */}
        <RegimeCard
          regime={dataReady ? displayRegime : null}
          updatedAt={updatedAt}
          series={trendHistory.regimeSeries}
          liveDrift={liveDrift}
          driftLive={marketLive}
          helpOpen={help === 'verdict'}
          onToggleHelp={() => toggleHelp('verdict')}
          help={HELP.verdict(regimeWeights)}
        />

        {/* 2 — What's driving it (5 weighted sleeves) */}
        <SleeveDriversCard
          items={sleeveItems}
          updatedAt={updatedAt}
          helpOpen={help === 'sleeves'}
          onToggleHelp={() => toggleHelp('sleeves')}
          help={HELP.sleeves}
        />

        {/* 3 — Coming up (macro prints + earnings, next 7 days) */}
        <ComingUpCard
          events={eventsList}
          earnings={upcomingEarnings}
          ownTickers={ownTickers}
          stwTickers={stwTickers}
          loading={eventsLoading || earningsLoading}
          error={eventsError}
          earningsError={earningsError}
          warning={eventsWarning}
          updatedAt={updatedAt}
          helpOpen={help === 'coming'}
          onToggleHelp={() => toggleHelp('coming')}
          help={HELP.coming}
        />

        {/* 5 — Trend / market structure */}
        <TrendStructureTable
          indicators={indicators}
          visibleSymbols={visibleSymbols}
          onToggle={toggle}
          asOf={trendAsOf}
          updatedAt={updatedAt}
          indicatorDeltas={trendHistory.indicatorDeltas}
          helpOpen={help === 'trend'}
          onToggleHelp={() => toggleHelp('trend')}
          help={HELP.trend}
        />

        {/* 6 — Under the hood · Dealer positioning · Fear vs greed */}
        <div style={{ display: 'grid', gridTemplateColumns: threeUpNarrow ? '1fr' : '1fr 1fr 1fr', gap: 12, alignItems: 'stretch' }}>
          <MarketInternalsCard
            volatility={volatility}
            credit={credit}
            rates={rates}
            helpOpen={help === 'internals'}
            onToggleHelp={() => toggleHelp('internals')}
            help={HELP.internals}
          />
          <GexPositioningCard
            data={gex}
            loading={gexLoading}
            helpOpen={help === 'gex'}
            onToggleHelp={() => toggleHelp('gex')}
            help={HELP.gex}
          />
          <SentimentGauge
            score={score}
            loading={sentLoading}
            fiveDayDelta={trendHistory.deltas.risk_appetite.fiveDayDelta}
            helpOpen={help === 'fear'}
            onToggleHelp={() => toggleHelp('fear')}
            help={HELP.fear}
          />
        </div>

        {/* AI recap — the plain-English summary, placed just before sector rotation */}
        <MacroRecapCard
          recap={recap}
          recapDate={recapDate}
          recapSession={recapSession}
          loading={recapLoading}
          error={recapError}
          canEdit={canEdit}
          onRefresh={handleRefreshRecap}
          helpOpen={help === 'recap'}
          onToggleHelp={() => toggleHelp('recap')}
          help={HELP.recap}
        />

        {/* Where money is rotating */}
        <SectorRotationCard
          rows={sectorRows}
          loading={sectorLoading}
          asOf={sectorAsOf}
          updatedAt={updatedAt}
          constituents={sectorConstituents}
          constituentsLoading={sectorConstituentsLoading}
          helpOpen={help === 'sectors'}
          onToggleHelp={() => toggleHelp('sectors')}
          help={HELP.sectors}
        />

      </div>
    </div>
  );
}

// Risk-appetite input weights (one source: RISK_APPETITE_WEIGHTS) → a readable
// "Momentum 21% · VIX 18% · …" line for the Fear-vs-greed explainer.
const RISK_APPETITE_WEIGHT_LABELS: Record<keyof typeof RISK_APPETITE_WEIGHTS, string> = {
  momentum: 'Momentum', vix: 'VIX', ivPremium: 'IV premium', gex: 'GEX', credit: 'Credit', breadth: 'Breadth',
};
const RISK_APPETITE_WEIGHT_LINE = (Object.keys(RISK_APPETITE_WEIGHTS) as (keyof typeof RISK_APPETITE_WEIGHTS)[])
  .map((k) => `${RISK_APPETITE_WEIGHT_LABELS[k]} ${Math.round(RISK_APPETITE_WEIGHTS[k] * 100)}%`)
  .join(' · ');

// Concise "what / why / how to read it" blurbs, shown inline via each card's ⓘ.
type Weights = { trend: number; volatility: number; credit: number; rates_dollar: number; gex: number };
const HELP = {
  verdict: (w: Weights): ReactNode => (
    <>
      <div>STW's daily market-health score (0–100), a weighted blend of the five inputs below: trend {w.trend}%, volatility {w.volatility}%, credit {w.credit}%, rates/USD {w.rates_dollar}%, GEX {w.gex}%.</div>
      <div style={dim}><b style={{ color: 'var(--status-positive-text)' }}>Green ≥ 60</b> risk-on · <b style={{ color: 'var(--status-warning-text)' }}>amber 45–59</b> selective · <b style={{ color: 'var(--status-negative-text)' }}>red &lt; 45</b> defensive.</div>
      <div style={dim}>The pill is today's label + score; the chip is the change vs the prior session; the dots are the last 9 sessions — hover one for that day's score. Refreshes daily after the close.</div>
    </>
  ),
  sleeves: (
    <>
      <div>Each of the five inputs is scored 0–100 against its own multi-year history — 50 is typical, higher is more risk-on.</div>
      <div style={dim}>The percentage by each name is its weight in the verdict; the bar + number are today's score; the note is what's driving it; the arrow is the lookback change.</div>
      <div style={dim}>When the verdict moves, whichever input moved most is usually the story of the day.</div>
    </>
  ),
  recap: (
    <>
      <div>Written fresh each session by AI from the numbers on this page only — it never sees headlines.</div>
      <div style={dim}>The preview is the one-paragraph read plus the suggested mode; expand it for scenarios, the playbook and the one thing to watch.</div>
      <div style={dim}>Treat it as a briefing, not a signal — your guardrails in Settings are the actual rules.</div>
    </>
  ),
  coming: (
    <>
      <div>Every scheduled catalyst in the next 7 days: macro prints (CPI, FOMC, claims…) plus earnings for names you hold, STW holds, or broad market movers (context).</div>
      <div style={dim}>The Risk pill is the expected impact on the indexes, not on any single stock. Once a print is out, its row shows the actual vs the prior print.</div>
      <div style={dim}>These are temporary overlays — they fade within days unless the market's structure actually shifts.</div>
    </>
  ),
  trend: (
    <>
      <div><b>Structure</b> is the bucket from each index's position vs its 9-, 21- and 200-day averages — the group headers spell out the combination.</div>
      <div style={dim}><b>Trend</b> is the change in that structure score: ↓ deterioration, → flat, ↑ improvement. IWM (small caps), RSP (breadth) and VEA (international) ride alongside SPY/QQQ as early-warning indicators.</div>
      <div style={dim}>Quotes are live (Finnhub, ≤15m); moving averages update daily (TwelveData).</div>
    </>
  ),
  internals: (
    <>
      <div>Stress usually shows here before it shows in prices — the early-warning layer behind the verdict.</div>
      <div style={dim}><b>Volatility</b>: the VIX level + how options are priced vs realized moves. <b>Credit</b>: junk-bond spreads vs their 50-day. <b>Rates + $</b>: a rising 10Y yield and dollar squeeze growth valuations.</div>
      <div style={dim}>Dot colors: green calm · amber a building headwind · red active stress.</div>
    </>
  ),
  gex: (
    <>
      <div>Dealers who sell options hedge mechanically, and that hedging moves the market.</div>
      <div style={dim}>Above the <b style={{ color: 'var(--status-warning-text)' }}>gamma flip</b> they trade against moves (calmer tape, dips hold); below it they trade with moves (faster swings). The <b style={{ color: 'var(--status-positive-text)' }}>put wall</b> and <b style={{ color: 'var(--status-negative-text)' }}>call wall</b> act like a floor and a ceiling until options expire.</div>
      <div style={dim}>The black marker is SPX right now — hover any marker for its level.</div>
    </>
  ),
  fear: (
    <>
      <div>A 0–100 blend of momentum, options pricing and breadth — what the tape is <i>feeling</i>, not what it should feel.</div>
      <div style={dim}>Below ~25 = extreme fear (historically a contrarian buy zone); above ~75 = extreme greed (where chasing gets punished); the middle is just weather.</div>
      <div style={dim}>Weights: {RISK_APPETITE_WEIGHT_LINE}. (An input drops out when its feed is missing; the rest re-weight to keep the total at 100%.)</div>
      <div style={dim}>"Loudest" shows what's driving today's number — a big split between drivers is itself a warning.</div>
    </>
  ),
  sectors: (
    <>
      <div>Where money is rotating across the 11 SPDR sectors, ranked #1 (leading) → #11 (lagging) by structure + 1-month relative strength.</div>
      <div style={dim}><b>Structure</b> — the same 9/21/200-day bucketing as the Trend module. <b>W / 1M / 3M</b> — each sector's RS vs SPY in percentage points; the bar shows the size of the move.</div>
      <div style={dim}><b>On the radar</b> — a solid badge is a leader (confirmed bullish structure), a dashed badge is setting up (turning positive on 1M RS). Refreshed daily after the close.</div>
    </>
  ),
};
