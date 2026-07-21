import { FONT_SIZE, FONT_WEIGHT, gexPositioningImplication, gexPositioningLabel } from '@stw/shared';
import type { LevelSet } from '../api';

// One symbol's price map: a 240px vertical ladder of today's GEX levels with the live
// price marked, background zones (above gamma-flat = supportive / flat→support = caution /
// below support = fragile), and a one-line positioning read from the shared scorer. All
// numbers come straight from the reused GEX read + live quote — no new data logic.

const LADDER_H = 240;
const PAD = 12; // interior top/bottom padding so edge labels aren't clipped
const NUDGE = 18; // ~7.5% of the ladder — keep a level's row this far from the price marker

type Role = 'positive' | 'negative' | 'warning' | 'info';
interface Level { price: number; label: string; role: Role; dashed: boolean }

const fmtPrice = (v: number) => (v % 1 === 0 ? String(v) : v.toFixed(2));

interface Props {
  symbol: string;               // "SPY" / "QQQ" — index/ETF TickerLink exception (plain text)
  levels: LevelSet;             // already scaled (SPY = SPX ÷ 10)
  currentPrice: number | null;
  priceTime?: string;           // as-of stamp for the price ("@ 9:40 AM live")
  onOpenChart?: () => void;     // scroll to the existing GexChart
}

export function LevelCard({ symbol, levels, currentPrice, priceTime, onOpenChart }: Props) {
  const defined: Level[] = ([
    levels.key_target    != null ? { price: levels.key_target,    label: 'Key target',        role: 'info' as Role,     dashed: true }  : null,
    levels.resistance    != null ? { price: levels.resistance,    label: 'Call resistance',   role: 'negative' as Role, dashed: false } : null,
    levels.gex1          != null ? { price: levels.gex1,          label: 'Gamma flat (GEX1)', role: 'warning' as Role,  dashed: false } : null,
    levels.put_support   != null ? { price: levels.put_support,   label: 'Put support',       role: 'positive' as Role, dashed: false } : null,
    levels.downside_risk != null ? { price: levels.downside_risk, label: 'Downside risk',     role: 'negative' as Role, dashed: true }  : null,
  ] as (Level | null)[]).filter((l): l is Level => l !== null);

  const pts = [...defined.map((l) => l.price), ...(currentPrice != null ? [currentPrice] : [])];
  const hasLadder = pts.length > 0;
  const lo = hasLadder ? Math.min(...pts) : 0;
  const hi = hasLadder ? Math.max(...pts) : 1;
  const span = hi - lo || 1;
  const dMin = lo - span * 0.1;
  const dMax = hi + span * 0.1;
  const y = (p: number) => PAD + ((dMax - p) / (dMax - dMin)) * (LADDER_H - 2 * PAD);

  const markerY = currentPrice != null ? y(currentPrice) : null;
  const yGex1 = levels.gex1 != null ? y(levels.gex1) : null;
  const yPut = levels.put_support != null ? y(levels.put_support) : null;

  // Nudge a level's row away from the price marker so labels aren't struck through.
  const rowTop = (levelY: number) => {
    if (markerY == null) return levelY;
    const dy = levelY - markerY;
    if (dy >= 0 && dy < NUDGE) return levelY + (NUDGE - dy);
    if (dy < 0 && dy > -NUDGE) return levelY - (NUDGE + dy);
    return levelY;
  };

  const read = currentPrice != null && levels.gex1 != null
    ? gexPositioningImplication({ spot: currentPrice, gammaFlip: levels.gex1 })
    : 'No live positioning read.';
  const readLabel = currentPrice != null && levels.gex1 != null
    ? gexPositioningLabel({ spot: currentPrice, gammaFlip: levels.gex1 })
    : null;

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '9px 12px', borderBottom: '1px solid var(--bsub)', background: 'var(--s2)' }}>
        <span style={{ fontSize: FONT_SIZE.sms, fontWeight: FONT_WEIGHT.bold, color: 'var(--text)' }}>{symbol}</span>
        {currentPrice != null && (
          <span style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)', fontVariantNumeric: 'tabular-nums' }}>now {fmtPrice(currentPrice)}</span>
        )}
        {priceTime && <span style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', whiteSpace: 'nowrap' }}>{priceTime}</span>}
        {onOpenChart && (
          <button
            onClick={onOpenChart}
            style={{ marginLeft: 'auto', fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.semibold, color: 'var(--acc)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, whiteSpace: 'nowrap', fontFamily: 'inherit' }}
          >
            Open the live chart ↗
          </button>
        )}
      </div>

      {/* ladder */}
      {hasLadder ? (
        <div style={{ position: 'relative', height: LADDER_H }}>
          {/* background zones */}
          {yGex1 != null && (
            <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: yGex1, background: 'var(--status-positive-bg)', opacity: 0.5 }} />
          )}
          {yGex1 != null && (
            <div style={{ position: 'absolute', left: 0, right: 0, top: yGex1, height: (yPut ?? LADDER_H) - yGex1, background: 'var(--status-warning-bg)', opacity: 0.5 }} />
          )}
          {yPut != null && (
            <div style={{ position: 'absolute', left: 0, right: 0, top: yPut, height: LADDER_H - yPut, background: 'var(--status-negative-bg)', opacity: 0.5 }} />
          )}

          {/* level lines */}
          {defined.map((l, i) => {
            const t = rowTop(y(l.price)) - 8;
            const pd = currentPrice != null ? l.price - currentPrice : null;
            const ptsStr = pd != null ? ` · ${pd >= 0 ? '+' : ''}${fmtPrice(+pd.toFixed(2))} pts` : '';
            return (
              <div key={i} style={{ position: 'absolute', top: t, left: 6, right: 6, height: 16, display: 'flex', alignItems: 'center', gap: 6, pointerEvents: 'none' }}>
                <span style={{ width: 44, textAlign: 'right', flexShrink: 0, fontSize: FONT_SIZE['3xs'], fontWeight: FONT_WEIGHT.bold, color: `var(--status-${l.role}-text)`, fontVariantNumeric: 'tabular-nums' }}>{fmtPrice(l.price)}</span>
                <span style={{ flex: 1, borderTop: `1.5px ${l.dashed ? 'dashed' : 'solid'} var(--status-${l.role}-text)` }} />
                <span style={{ fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.semibold, color: `var(--status-${l.role}-text)`, background: 'var(--surface)', padding: '0 4px', whiteSpace: 'nowrap' }}>{l.label}{ptsStr}</span>
              </div>
            );
          })}

          {/* current-price marker */}
          {markerY != null && currentPrice != null && (
            <div style={{ position: 'absolute', top: markerY - 8, left: 6, right: 6, height: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 44, textAlign: 'right', flexShrink: 0, fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{fmtPrice(currentPrice)}</span>
              <span style={{ flex: 1, borderTop: '2px solid var(--text)' }} />
              <span style={{ fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.bold, color: 'var(--text)', background: 'var(--surface)', padding: '0 4px', whiteSpace: 'nowrap' }}>◀ price now</span>
            </div>
          )}
        </div>
      ) : (
        <p style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', padding: '16px 12px' }}>No levels published for {symbol}.</p>
      )}

      {/* one-line read */}
      <div style={{ padding: '8px 12px', borderTop: '1px solid var(--bsub)', fontSize: FONT_SIZE.xs, color: 'var(--t2)', lineHeight: 1.4 }}>
        {readLabel && <span style={{ fontWeight: FONT_WEIGHT.bold, color: 'var(--text)' }}>{readLabel} · </span>}
        {read}
      </div>
    </div>
  );
}
