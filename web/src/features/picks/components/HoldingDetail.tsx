import type { Holding } from '../api';
import { ConvictionBadge } from './ConvictionBadge';
import { useLivePrice } from '../../../shared/hooks/useLivePrice';

interface Props {
  holding: Holding;
  onClose?: () => void;
}

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function HoldingDetail({ holding: h, onClose }: Props) {
  const livePrice = useLivePrice(h.ticker);

  return (
    <div className="h-full overflow-y-auto p-6">
      {onClose && (
        <button onClick={onClose} className="text-t3 text-xs mb-4 hover:text-t2 transition-colors">
          ← Back
        </button>
      )}

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="font-display font-extrabold text-3xl text-text tracking-wide">{h.ticker}</h2>
            <ConvictionBadge level={h.conviction} />
          </div>
          <p className="text-t2 text-sm">{h.name}</p>
        </div>
        {livePrice !== null && (
          <div className="text-right">
            <div className="text-2xl font-bold text-text">${livePrice.toFixed(2)}</div>
            <div className="text-t3 text-xs">Live</div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        {[
          { label: 'Basket', value: h.basket },
          { label: 'Status', value: h.last_action },
          { label: 'Action Date', value: formatDate(h.action_date) },
          { label: 'Current Weight', value: h.current_weight != null ? `${h.current_weight.toFixed(1)}%` : '—' },
          { label: 'Initial Weight', value: h.initial_weight != null ? `${h.initial_weight.toFixed(1)}%` : '—' },
          { label: 'Rank', value: `#${h.rank}` },
        ].map(({ label, value }) => (
          <div key={label} className="bg-s2 rounded-lg p-3">
            <div className="text-t3 text-xs mb-0.5">{label}</div>
            <div className="text-text text-sm font-medium">{value}</div>
          </div>
        ))}
      </div>

      {h.summary && (
        <div className="mb-4">
          <h3 className="text-t3 text-xs uppercase tracking-wider mb-2">Summary</h3>
          <p className="text-t2 text-sm leading-relaxed">{h.summary}</p>
        </div>
      )}

      {h.bullets && h.bullets.length > 0 && (
        <div className="mb-4">
          <h3 className="text-t3 text-xs uppercase tracking-wider mb-2">Key Points</h3>
          <ul className="flex flex-col gap-1.5">
            {h.bullets.map((b, i) => (
              <li key={i} className="flex gap-2 text-t2 text-sm">
                <span className="text-acc shrink-0 mt-0.5">▸</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {h.position_detail && (
        <div className="mb-4">
          <h3 className="text-t3 text-xs uppercase tracking-wider mb-2">Position Detail</h3>
          <p className="text-t2 text-sm font-mono bg-s2 rounded-lg p-3 leading-relaxed whitespace-pre-wrap">{h.position_detail}</p>
        </div>
      )}

      {h.updated_at && (
        <p className="text-t3 text-xs mt-6">Updated {formatDate(h.updated_at)}</p>
      )}
    </div>
  );
}
