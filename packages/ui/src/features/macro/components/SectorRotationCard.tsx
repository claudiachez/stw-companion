import type { SectorRotationRow, TrendBucket } from '@stw/shared';
import { TREND_BUCKET_META } from '@stw/shared';
import { SourceNote } from './macroVisuals';

interface Props {
  rows: SectorRotationRow[];
  loading: boolean;
  asOf: string | null;
}

const BUCKET_COLOR: Record<TrendBucket, string> = {
  momentum:         'var(--c5)',
  healthy_pullback: 'var(--c5)',
  mid_caution:      'var(--c3)',
  bear_rally:       'var(--c3)',
  risk_off:         'var(--c1)',
};

function fmtRs(v: number | null): string {
  if (v === null) return '—';
  return (v >= 0 ? '+' : '') + v.toFixed(1);
}

function rsColor(v: number | null): string {
  if (v === null) return 'var(--t3)';
  return v > 0 ? 'var(--c5)' : v < 0 ? 'var(--c1)' : 'var(--t2)';
}

function SectorRow({ row }: { row: SectorRotationRow }) {
  const bucketColor = row.bucket ? BUCKET_COLOR[row.bucket] : 'var(--t3)';
  const bucketLabel = row.bucket ? TREND_BUCKET_META[row.bucket].label : 'N/A';
  return (
    <tr style={{ borderBottom: '1px solid var(--bsub)' }}>
      <td style={{ padding: '6px 8px', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap', color: 'var(--text)' }}>{row.symbol}</td>
      <td style={{ padding: '6px 8px', fontSize: 12, color: 'var(--t2)', whiteSpace: 'nowrap' }}>{row.name}</td>
      <td style={{ padding: '6px 8px', fontSize: 12, fontWeight: 600, color: bucketColor, whiteSpace: 'nowrap' }}>{bucketLabel}</td>
      <td style={{ padding: '6px 8px', fontSize: 12, color: rsColor(row.rsWeek), whiteSpace: 'nowrap' }}>{fmtRs(row.rsWeek)}</td>
      <td style={{ padding: '6px 8px', fontSize: 12, color: rsColor(row.rs1M), whiteSpace: 'nowrap' }}>{fmtRs(row.rs1M)}</td>
      <td style={{ padding: '6px 8px', fontSize: 12, color: rsColor(row.rs3M), whiteSpace: 'nowrap' }}>{fmtRs(row.rs3M)}</td>
      <td style={{ padding: '6px 8px', fontSize: 12, color: rsColor(row.rs6M), whiteSpace: 'nowrap' }}>{fmtRs(row.rs6M)}</td>
      <td style={{ padding: '6px 8px', fontSize: 12, color: rsColor(row.rs1Y), whiteSpace: 'nowrap' }}>{fmtRs(row.rs1Y)}</td>
    </tr>
  );
}

/** Sub-score so we can rank sectors leader-to-laggard within the table. */
function rowRank(row: SectorRotationRow): number {
  const bucketScore = row.bucket ? TREND_BUCKET_META[row.bucket].score : 0;
  return bucketScore + (row.rs1M ?? 0);
}

export function SectorRotationCard({ rows, loading, asOf }: Props) {
  if (loading && rows.length === 0) {
    return <div style={{ color: 'var(--t3)', fontSize: 12 }}>Loading sector data…</div>;
  }

  const sorted = [...rows].sort((a, b) => rowRank(b) - rowRank(a));
  const leaders = sorted.slice(0, 3).map((r) => r.symbol);
  const laggards = sorted.slice(-3).map((r) => r.symbol).reverse();

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12 }}>
          <span style={{ color: 'var(--t3)' }}>Leaders: </span>
          <span style={{ color: 'var(--c5)', fontWeight: 600 }}>{leaders.join(', ') || '—'}</span>
        </div>
        <div style={{ fontSize: 12 }}>
          <span style={{ color: 'var(--t3)' }}>Laggards: </span>
          <span style={{ color: 'var(--c1)', fontWeight: 600 }}>{laggards.join(', ') || '—'}</span>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Sector', 'Name', 'Structure', '1W RS', '1M RS', '3M RS', '6M RS', '1Y RS'].map((h) => (
                <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t3)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => <SectorRow key={row.symbol} row={row} />)}
          </tbody>
        </table>
      </div>
      <SourceNote source="RS = relative strength vs SPY (pp) over each lookback · MAs: TwelveData daily" asOf={asOf} />
    </div>
  );
}
