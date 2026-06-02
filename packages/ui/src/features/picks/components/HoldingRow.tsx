import type { Holding } from '../api';
import { TIERS, ACTION_VARS, bColor, parseCostBasis, positionType, resolvePnl } from '@stw/shared';
import { useQuote } from '../../../hooks/useLivePrice';

function fmtDate(s: string | null): string {
  if (!s) return '–';
  const d = new Date(s + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

interface Props {
  holding: Holding;
  isSelected: boolean;
  maxWeight: number;
  onClick: () => void;
}

export function HoldingRow({ holding: h, isSelected, maxWeight, onClick }: Props) {
  const quote = useQuote(h.ticker);
  const tier = TIERS[h.conviction] ?? TIERS[0];
  const basketColor = bColor(h.basket);
  const action = ACTION_VARS[h.last_action];

  // Row P&L: live quote only (no last_price fallback). Shared resolver keeps the
  // shares/options/mixed math identical to the detail pane.
  const { pnlPct } = resolvePnl({
    positionType: positionType(h.position_detail),
    price: quote?.c ?? null,
    costBasis: parseCostBasis(h.position_detail),
    optionsPnlPct: h.last_pnl_pct,
  });
  const pnlColor = pnlPct != null ? (pnlPct >= 0 ? '#16A34A' : '#DC2626') : undefined;

  const w = h.current_weight ?? h.initial_weight ?? 0;
  const wPct = maxWeight > 0 ? (w / maxWeight) * 100 : 0;

  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center gap-2 border-b transition-colors"
      style={{
        padding: '10px 14px',
        borderColor: 'var(--bsub)',
        background: isSelected ? 'var(--c5bg)' : undefined,
      }}
      onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--s2)'; }}
      onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = ''; }}
    >
      {/* Rank */}
      <span style={{ color: 'var(--t3)', fontSize: 10, minWidth: 16, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {h.rank}
      </span>

      {/* Tier color bar */}
      <div style={{ width: 3, height: 32, borderRadius: 2, flexShrink: 0, background: tier.color }} />

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 1 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{h.ticker}</span>
          {/* Basket tag */}
          <span style={{
            fontSize: 10, padding: '1px 5px', borderRadius: 4,
            background: basketColor + '18', color: basketColor, border: `1px solid ${basketColor}28`,
          }}>
            {h.basket}
          </span>
          {/* Action badge */}
          {action && (
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '1px 5px', borderRadius: 4,
              color: action.color, background: action.bg,
            }}>
              {h.last_action}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {h.name}
        </div>
      </div>

      {/* Right side: weight bar + P&L + weight */}
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, minWidth: 60 }}>
        {/* Weight bar */}
        <div style={{ width: 48, height: 3, borderRadius: 2, background: 'var(--border)' }}>
          <div style={{ width: `${wPct}%`, height: '100%', borderRadius: 2, background: tier.color }} />
        </div>

        {pnlPct != null && (
          <span style={{ fontSize: 11, fontWeight: 600, color: pnlColor, fontVariantNumeric: 'tabular-nums' }}>
            {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
          </span>
        )}
        {quote?.c != null && (
          <span style={{ fontSize: 10, color: 'var(--t3)', fontVariantNumeric: 'tabular-nums' }}>
            ${quote.c.toFixed(2)}
          </span>
        )}
        {!quote && w > 0 && (
          <span style={{ fontSize: 10, color: 'var(--t3)' }}>{w.toFixed(1)}%</span>
        )}
        <span style={{ fontSize: 9, color: 'var(--t3)' }}>{fmtDate(h.action_date)}</span>
      </div>
    </button>
  );
}
