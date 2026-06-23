import type { Holding } from '../api';
import { TIERS, ACTION_VARS, bColor, holdingPnlPct } from '@stw/shared';
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
  isUserHeld?: boolean;
  /** Narrow list pane (split dragged small): drop the secondary badges so nothing overlaps. */
  compact?: boolean;
}

export function HoldingRow({ holding: h, isSelected, maxWeight, onClick, isUserHeld, compact = false }: Props) {
  const quote = useQuote(h.ticker);
  const tier = TIERS[h.conviction] ?? TIERS[0];
  const basketColor = bColor(h.basket);
  const action = ACTION_VARS[h.last_action];

  // Row P&L: weight-weighted across the holding's legs. Shares legs price off the live quote;
  // option legs use their stored IBKR mark.
  const pnlPct = holdingPnlPct(h.legs, quote?.c ?? null);
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
          {/* Secondary badges drop out when the list pane is too narrow to fit them (compact). */}
          {!compact && (
            <span style={{
              fontSize: 10, padding: '1px 5px', borderRadius: 4, flexShrink: 0, whiteSpace: 'nowrap',
              background: basketColor + '18', color: basketColor, border: `1px solid ${basketColor}28`,
            }}>
              {h.basket}
            </span>
          )}
          {!compact && action && (
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '1px 5px', borderRadius: 4, flexShrink: 0, whiteSpace: 'nowrap',
              color: action.color, background: action.bg,
            }}>
              {h.last_action}
            </span>
          )}
          {/* User holds this ticker */}
          {isUserHeld && (
            <span style={{
              fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 4,
              color: 'var(--acc)', background: 'var(--c5bg)', border: '1px solid var(--c5b)',
            }}>
              Held
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
          <div style={{ width: `${Math.max(0, wPct)}%`, height: '100%', borderRadius: 2, background: tier.color }} />
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
        {/* Weight readout — always shown for CASH (incl. negative = margin/leverage) */}
        {!quote && (h.ticker === 'CASH' || w !== 0) && (
          <span style={{ fontSize: 10, color: w < 0 ? '#DC2626' : 'var(--t3)', fontVariantNumeric: 'tabular-nums' }}>
            {w.toFixed(1)}%
          </span>
        )}
        <span style={{ fontSize: 9, color: 'var(--t3)' }}>{fmtDate(h.action_date)}</span>
      </div>
    </button>
  );
}
