import { useState } from 'react';
import { stressLabel, creditLabel, ratesDollarLabel, FONT_SIZE, FONT_WEIGHT } from '@stw/shared';
import type { VolatilityStress } from '../useVolatilityStress';
import type { CreditLiquidity } from '../useCreditLiquidity';
import type { RatesDollar } from '../useRatesDollar';
import { AccordionList } from '../../../primitives/AccordionList';
import { scoreColor } from './macroVisuals';
import { VolatilityStressCard } from './VolatilityStressCard';
import { CreditLiquidityCard } from './CreditLiquidityCard';
import { RatesDollarCard } from './RatesDollarCard';

// Module 5–7 consolidated. Volatility/Stress, Credit/Liquidity and Rates+Dollar
// were three near-identical full-width cards (sleeve score + StatTiles + source)
// that stacked into ~3 screens of scroll on mobile and duplicated the scores the
// Module Scores strip already shows. This folds them into ONE "Market Internals"
// module: each sleeve is a collapsed accordion row (score chip + one-line read),
// expandable into its existing tile detail. Bodies are the same three card
// components (with their standalone SleeveSummary removed — the row header carries
// the score now), so per-sleeve tile logic + source notes stay in their own files.

interface Props {
  volatility: VolatilityStress | null;
  volLoading: boolean;
  credit: CreditLiquidity | null;
  creditLoading: boolean;
  rates: RatesDollar | null;
  ratesLoading: boolean;
  /** True when vol/credit stress is rising — colors the rates flight-to-safety note. */
  stressRising: boolean;
}

interface Sleeve {
  key: string;
  name: string;
  score: number | null;
  label: string;
  read: string;
  body: React.ReactNode;
}

export function MarketInternalsCard({
  volatility, volLoading, credit, creditLoading, rates, ratesLoading, stressRising,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (k: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });

  const volScore = volatility?.sleeveScore ?? null;
  const creditScore = credit?.sleeveScore ?? null;
  const ratesScore = rates?.sleeveScore ?? null;

  const read = (loading: boolean, has: boolean, text: string): string =>
    has ? text : loading ? 'loading…' : 'unavailable';

  const sleeves: Sleeve[] = [
    {
      key: 'volatility',
      name: 'Volatility / Stress',
      score: volScore,
      label: stressLabel(volScore),
      read: read(volLoading, !!volatility,
        `VIX ${volatility?.vix != null ? volatility.vix.toFixed(1) : '—'} · IV ${volatility?.ivPremium != null ? volatility.ivPremium.toFixed(2) : '—'}`),
      body: <VolatilityStressCard data={volatility} loading={volLoading} />,
    },
    {
      key: 'credit',
      name: 'Credit / Liquidity',
      score: creditScore,
      label: creditLabel(creditScore),
      read: read(creditLoading, !!credit,
        `HY OAS ${credit?.oas != null ? `${credit.oas.toFixed(2)}%` : '—'} · ${credit?.belowMa50 == null ? '—' : credit.belowMa50 ? 'tight' : 'wide'}`),
      body: <CreditLiquidityCard data={credit} loading={creditLoading} />,
    },
    {
      key: 'rates',
      name: 'Rates + Dollar',
      score: ratesScore,
      label: ratesDollarLabel(ratesScore),
      read: read(ratesLoading, !!rates,
        `US10Y ${rates?.us10y != null ? `${rates.us10y.toFixed(2)}%` : '—'} · $ ${rates?.dollarAbove9 == null ? '—' : rates.dollarAbove9 && rates.dollarAbove21 ? 'strengthening' : 'soft'}`),
      body: <RatesDollarCard data={rates} loading={ratesLoading} stressRising={stressRising} />,
    },
  ];

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <AccordionList
        items={sleeves}
        rowKey={(s) => s.key}
        expandedKeys={expanded}
        onToggle={toggle}
        accentColor={(s) => scoreColor(s.score)}
        renderHeader={(s) => (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
            <span style={{ fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: scoreColor(s.score), width: 30, flexShrink: 0 }}>{s.score ?? '—'}</span>
            <span style={{ fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold, color: 'var(--text)' }}>{s.name}</span>
            <span style={{ fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: scoreColor(s.score) }}>{s.label}</span>
            <span style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)' }}>{s.read}</span>
          </div>
        )}
        renderExpanded={(s) => <div style={{ padding: '4px 14px 16px 40px' }}>{s.body}</div>}
      />
    </div>
  );
}
