import type { SentimentScore } from '@stw/shared';
import { FONT_SIZE, FONT_WEIGHT } from '@stw/shared';
import { Card, CardHeader, HelpPanel } from './macroVisuals';

interface Props {
  score: SentimentScore | null;
  loading: boolean;
  /** 5D delta on the total risk-appetite score; null until ~5 days of history accrue. */
  fiveDayDelta?: number | null;
  helpOpen: boolean;
  onToggleHelp: () => void;
  help: React.ReactNode;
}

// 0 = extreme fear … 100 = extreme greed. The 5 band colors mirror the prior
// SentimentGauge zones exactly (red / elevated-orange / neutral / greed-teal /
// green) so the fear-greed palette stays consistent across the redesign.
function zone(s: number): { label: string; color: string } {
  if (s < 25) return { label: 'extreme fear', color: 'var(--status-negative-text)' };
  if (s < 45) return { label: 'fear', color: 'var(--status-elevated)' };
  if (s < 55) return { label: 'neutral', color: 'var(--c2l)' };
  if (s < 75) return { label: 'greed', color: 'var(--sentiment-greed)' };
  return { label: 'extreme greed', color: 'var(--acc)' };
}

// The ref gauge uses literal hexes (warn / bsub / #a3c76d olive) with no matching design
// tokens, and the no-literal-color rule forbids them — so we keep the app's tokenized
// sentiment palette, which also stays consistent with zone()'s sentence-text colors above.
const GRADIENT =
  'linear-gradient(90deg,'
  + ' var(--status-negative-text) 0 25%,'
  + ' var(--status-elevated) 25% 45%,'
  + ' var(--c2l) 45% 55%,'
  + ' var(--sentiment-greed) 55% 75%,'
  + ' var(--acc) 75% 100%)';

// "Fear vs greed" — a one-sentence read, a 5-band gradient gauge with a marker at
// the composite score, and FEAR / NEUTRAL / GREED anchors. The composite total +
// its input breakdown come from useSentimentGauge unchanged (pure re-layout).
export function SentimentGauge({ score, loading, fiveDayDelta, helpOpen, onToggleHelp, help }: Props) {
  const header = <CardHeader title="Fear vs greed" helpOpen={helpOpen} onToggleHelp={onToggleHelp} />;

  if ((loading && !score) || !score || score.total === null) {
    return (
      <Card style={{ display: 'flex', flexDirection: 'column' }}>
        {header}
        {helpOpen && <HelpPanel>{help}</HelpPanel>}
        <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t3)', marginTop: 6 }}>
          {loading && !score ? 'Computing risk appetite…' : 'Risk-appetite data unavailable.'}
        </div>
      </Card>
    );
  }

  const total = score.total;
  const z = zone(total);
  const deltaText = fiveDayDelta === null || fiveDayDelta === undefined ? '' : ` (5D ${fiveDayDelta >= 0 ? '+' : ''}${Math.round(fiveDayDelta)})`;
  const loudest = [...score.inputs]
    .filter((i) => i.score !== null)
    .sort((a, b) => (b.score as number) - (a.score as number))
    .slice(0, 3)
    .map((i) => `${i.label} ${Math.round(i.score as number)}`)
    .join(' · ');

  return (
    <Card style={{ display: 'flex', flexDirection: 'column' }}>
      {header}
      {helpOpen && <HelpPanel>{help}</HelpPanel>}

      <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)', lineHeight: 1.55, marginTop: 6 }}>
        Pricing <b style={{ color: z.color }}>{z.label} — {Math.round(total)} of 100</b>
        <span style={{ color: 'var(--t3)' }}>{deltaText}</span>.
        {loudest && <> Loudest: {loudest}.</>}
      </div>

      <div style={{ position: 'relative', height: 14, borderRadius: 7, marginTop: 10, background: GRADIENT }}>
        <span style={{ position: 'absolute', left: `${Math.max(0, Math.min(100, total))}%`, top: -4, width: 3, height: 22, background: 'var(--text)', borderRadius: 2, transform: 'translateX(-1px)' }} title={`${Math.round(total)} — ${z.label}`} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: FONT_SIZE['3xs'], fontWeight: FONT_WEIGHT.bold, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--t3)', marginTop: 4 }}>
        <span>Fear</span><span>Neutral</span><span>Greed</span>
      </div>

      <div style={{ marginTop: 'auto', paddingTop: 8, fontSize: FONT_SIZE['2xs'], color: 'var(--t3)' }}>
        Source: <a href="https://finnhub.io" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--t3)', textDecoration: 'underline' }}>STW composite</a> · momentum · IV premium · breadth
      </div>
    </Card>
  );
}
