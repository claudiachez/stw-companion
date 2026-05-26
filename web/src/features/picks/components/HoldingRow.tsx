import type { Holding } from '../api';
import { ConvictionBadge } from './ConvictionBadge';
import { useLivePrice } from '../../../shared/hooks/useLivePrice';

const BASKET_COLORS: Record<string, string> = {
  'Robotics & Edge AI': '#7C3AED',
  'Power Infrastructure': '#16A34A',
  'Data Center': '#2563EB',
  'Telecom & Voice AI': '#D97706',
  'Chips': '#DC2626',
  'Defense': '#a78bfa',
  'Other': '#6b7280',
};

const ACTION_COLORS: Record<string, string> = {
  New: '#22c55e',
  Upsized: '#3b82f6',
  Hold: '#6b7280',
  Trimmed: '#f59e0b',
  Closed: '#ef4444',
};

interface Props {
  holding: Holding;
  isSelected: boolean;
  onClick: () => void;
}

export function HoldingRow({ holding: h, isSelected, onClick }: Props) {
  const livePrice = useLivePrice(h.ticker);
  const basketColor = BASKET_COLORS[h.basket] ?? '#6b7280';
  const actionColor = ACTION_COLORS[h.last_action] ?? '#6b7280';

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b border-bsub hover:bg-s2 transition-colors flex items-center gap-3 ${
        isSelected ? 'bg-s2 border-l-2 border-l-acc' : ''
      }`}
    >
      <span className="text-t3 text-xs w-5 text-right shrink-0">{h.rank}</span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-text text-sm">{h.ticker}</span>
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: basketColor }}
            title={h.basket}
          />
          <span
            className="text-xs font-medium shrink-0"
            style={{ color: actionColor }}
          >
            {h.last_action}
          </span>
        </div>
        <div className="text-t2 text-xs truncate">{h.name}</div>
      </div>

      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <ConvictionBadge level={h.conviction} />
        {livePrice !== null && (
          <span className="text-xs text-t2">${livePrice.toFixed(2)}</span>
        )}
        {h.current_weight != null && (
          <span className="text-xs text-t3">{h.current_weight.toFixed(1)}%</span>
        )}
      </div>
    </button>
  );
}
