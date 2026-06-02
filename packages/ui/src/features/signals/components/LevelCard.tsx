import type { GraddoxLevel } from '../api';

const TYPE_COLORS: Record<string, string> = {
  support: '#22c55e',
  resistance: '#ef4444',
  target: '#3b82f6',
  pivot: '#f59e0b',
};

interface Props {
  ticker: string;
  levels: GraddoxLevel[];
}

export function LevelCard({ ticker, levels }: Props) {
  return (
    <div className="bg-s2 border border-border rounded-xl p-4">
      <h3 className="font-display font-bold text-lg text-text mb-3">{ticker}</h3>
      <div className="flex flex-col gap-1.5">
        {levels.map((l) => (
          <div key={l.id} className="flex items-center justify-between text-sm">
            <span className="text-t2">{l.label}</span>
            <div className="flex items-center gap-2">
              <span
                className="text-xs px-1.5 py-0.5 rounded"
                style={{
                  color: TYPE_COLORS[l.type.toLowerCase()] ?? '#6b7280',
                  background: `${TYPE_COLORS[l.type.toLowerCase()] ?? '#6b7280'}15`,
                }}
              >
                {l.type}
              </span>
              <span className="font-mono font-semibold text-text">{l.price.toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
