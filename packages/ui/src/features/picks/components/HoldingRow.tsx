import type { Holding } from '../api';
import { TIERS, holdingPnlPct, FONT_SIZE, FONT_WEIGHT } from '@stw/shared';
import { useQuote } from '../../../hooks/useLivePrice';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { RegimeBadge } from './RegimeBadge';
import { Badge } from '../../../primitives/Badge';
import type { TickerRegime } from '../useTickerRegime';

interface Props {
  holding: Holding;
  isSelected: boolean;
  maxWeight: number;
  onClick: () => void;
  isUserHeld?: boolean;
  /** Narrow list pane (split dragged small): drop the secondary badges so nothing overlaps. */
  compact?: boolean;
  /** This ticker's own trend structure + sector standing (undefined while still loading). */
  regime?: TickerRegime;
}

export function HoldingRow({ holding: h, isSelected, maxWeight, onClick, isUserHeld, compact = false, regime }: Props) {
  const quote = useQuote(h.ticker);
  const isMobile = useIsMobile();
  const tier = TIERS[h.conviction] ?? TIERS[0];
  // The long basket/action badges don't fit a narrow row alongside the right-hand metric
  // column — they overran it (e.g. "DATACENTER + AI INFRASTRUCTURE" + Held colliding with
  // the weight). Drop them when the row is tight (split dragged narrow OR mobile); the full
  // category/action are still on the detail pane. Same treatment `compact` already applied.
  const hideSecondary = compact || isMobile;

  // Row P&L: weight-weighted across the holding's legs. Shares legs price off the live quote;
  // option legs use their stored IBKR mark.
  const pnlPct = holdingPnlPct(h.legs, quote?.c ?? null);
  const pnlColor = pnlPct != null ? (pnlPct >= 0 ? 'var(--pnl-gain)' : 'var(--pnl-loss)') : undefined;

  const w = h.current_weight ?? h.initial_weight ?? 0;
  const wPct = maxWeight > 0 ? (w / maxWeight) * 100 : 0;

  // Secondary metric line — the design's "price · weight%". Price from the live quote (when
  // present); weight always shown for CASH and any non-zero position. A negative weight with
  // no price is margin/leverage, so it reads red (same distinction as HoldingDetail's CASH card).
  const priceStr = quote?.c != null ? `$${quote.c.toFixed(2)}` : null;
  const showWeight = h.ticker === 'CASH' || w !== 0;
  const m2Parts = [priceStr, showWeight ? `${w.toFixed(1)}%` : null].filter(Boolean);
  const m2Color = !priceStr && showWeight && w < 0 ? 'var(--status-negative-text)' : 'var(--t3)';

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
      <span style={{ color: 'var(--t3)', fontSize: FONT_SIZE['2xs'], minWidth: 16, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {h.rank}
      </span>

      {/* Tier color bar */}
      <div style={{ width: 3, height: 32, borderRadius: 2, flexShrink: 0, background: tier.color }} />

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 1, minWidth: 0, overflow: 'hidden' }}>
          <span style={{ fontWeight: FONT_WEIGHT.bold, fontSize: FONT_SIZE.base, color: 'var(--text)', flexShrink: 0 }}>{h.ticker}</span>
          {/* Secondary badges drop out when the row is too narrow to fit them (compact/mobile). */}
          {!hideSecondary && <Badge kind="category" category={h.basket} />}
          {!hideSecondary && <Badge kind="action" action={h.last_action} />}
          {/* User holds this ticker — not a Badge kind: none of source/category/tier/flag/
              action represent "this is your own position", even though its colors happen
              to coincide with kind="source"'s (picking a kind by color, not meaning, is
              exactly what CONTRIBUTING.md warns against). */}
          {isUserHeld && (
            <span style={{
              fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.semibold, padding: '1px 5px', borderRadius: 4,
              color: 'var(--acc)', background: 'var(--c5bg)', border: '1px solid var(--c5b)',
            }}>
              Held
            </span>
          )}
          {!compact && <RegimeBadge regime={regime} compact />}
        </div>
        <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {h.name}
        </div>
      </div>

      {/* Right side: weight bar + P&L + weight */}
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, minWidth: 60 }}>
        {/* Weight bar */}
        <div style={{ width: 48, height: 3, borderRadius: 2, background: 'var(--bsub)' }}>
          <div style={{ width: `${Math.max(0, wPct)}%`, height: '100%', borderRadius: 2, background: tier.color }} />
        </div>

        {pnlPct != null && (
          <span style={{ fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: pnlColor, fontVariantNumeric: 'tabular-nums' }}>
            {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
          </span>
        )}
        {m2Parts.length > 0 && (
          <span style={{ fontSize: FONT_SIZE['2xs'], color: m2Color, fontVariantNumeric: 'tabular-nums' }}>
            {m2Parts.join(' · ')}
          </span>
        )}
      </div>
    </button>
  );
}
