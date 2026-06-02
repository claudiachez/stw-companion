import type { Signal } from '../api';
import { BiasChip } from './BiasChip';

interface Props {
  signals: Signal[];
}

export function SignalsTable({ signals }: Props) {
  if (signals.length === 0) {
    return <p className="text-t3 text-sm px-2 py-4">No signals recorded yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {['Date', 'Ticker', 'Bias', 'Verdict', 'Note'].map((h) => (
              <th key={h} className="text-left text-t3 text-xs font-medium py-2 px-3">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {signals.map((s) => (
            <tr key={s.id} className="border-b border-bsub hover:bg-s2 transition-colors">
              <td className="py-2.5 px-3 text-t2 text-xs whitespace-nowrap">
                {new Date(s.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </td>
              <td className="py-2.5 px-3 font-bold text-text">{s.ticker}</td>
              <td className="py-2.5 px-3"><BiasChip bias={s.bias} /></td>
              <td className="py-2.5 px-3 text-t2">{s.verdict ?? '—'}</td>
              <td className="py-2.5 px-3 text-t2 max-w-xs truncate">{s.note ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
