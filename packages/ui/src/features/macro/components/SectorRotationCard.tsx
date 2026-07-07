import { useMemo } from 'react';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer } from 'recharts';
import type { SectorRotationRow, TrendBucket } from '@stw/shared';
import { TREND_BUCKET_META, TREND_BUCKET_ORDER, FONT_SIZE, FONT_WEIGHT } from '@stw/shared';
import { SourceNote } from './macroVisuals';
import type { SectorConstituents } from '../useSectorRotation';

const STRUCTURE_TOOLTIP = TREND_BUCKET_ORDER
  .map((b) => TREND_BUCKET_META[b].groupLabel)
  .join('\n');

interface Props {
  rows: SectorRotationRow[];
  loading: boolean;
  asOf: string | null;
  constituents: Record<string, SectorConstituents>;
  constituentsLoading: boolean;
}

const BUCKET_COLOR: Record<TrendBucket, string> = {
  momentum:         'var(--c5)',
  healthy_pullback: 'var(--c5)',
  mid_caution:      'var(--c3)',
  bear_rally:       'var(--c3)',
  risk_off:         'var(--c1)',
};

const RS_AXES: { key: 'rsWeek' | 'rs1M' | 'rs3M' | 'rs6M' | 'rs1Y'; label: string }[] = [
  { key: 'rsWeek', label: '1W' },
  { key: 'rs1M', label: '1M' },
  { key: 'rs3M', label: '3M' },
  { key: 'rs6M', label: '6M' },
  { key: 'rs1Y', label: '1Y' },
];

function fmtRs(v: number | null): string {
  if (v === null) return '—';
  return (v >= 0 ? '+' : '') + v.toFixed(1);
}

function rsColor(v: number | null): string {
  if (v === null) return 'var(--t3)';
  return v > 0 ? 'var(--c5)' : v < 0 ? 'var(--c1)' : 'var(--t2)';
}

/** Sub-score so sectors rank leader-to-laggard (drives the card rank badge). */
function rowRank(row: SectorRotationRow): number {
  const bucketScore = row.bucket ? TREND_BUCKET_META[row.bucket].score : 0;
  return bucketScore + (row.rs1M ?? 0);
}

function TickerRow({ label, rows, color }: { label: string; rows?: SectorRotationRow[]; color: string }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
      <span style={{ fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.semibold, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--t3)', flexShrink: 0 }}>{label}</span>
      {rows && rows.length > 0 ? (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {rows.map((r) => (
            <span
              key={r.symbol}
              title={`${r.name} · 1M RS ${fmtRs(r.rs1M)}`}
              style={{ fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, padding: '2px 6px', borderRadius: 4, background: 'var(--surface)', border: `1px solid ${color}`, color, whiteSpace: 'nowrap' }}
            >
              {r.symbol}
            </span>
          ))}
        </div>
      ) : (
        <span style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)' }}>—</span>
      )}
    </div>
  );
}

function SectorCard({ row, rank, constituents }: { row: SectorRotationRow; rank: number; constituents?: SectorConstituents }) {
  const bucketColor = row.bucket ? BUCKET_COLOR[row.bucket] : 'var(--t3)';
  const bucketLabel = row.bucket ? TREND_BUCKET_META[row.bucket].label : 'N/A';
  const radarData = useMemo(
    () => RS_AXES.map(({ key, label }) => ({ axis: label, RS: row[key] ?? 0 })),
    [row],
  );

  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          width: 22, height: 22, borderRadius: '50%', background: 'var(--acc)', color: 'var(--text-inverse)',
          fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          {rank}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: 'var(--text)' }}>
            {row.symbol}
            <span style={{ fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.medium, color: 'var(--t3)', marginLeft: 6 }}>{row.name}</span>
          </div>
          <div title={STRUCTURE_TOOLTIP} style={{ fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, color: bucketColor, cursor: 'help' }}>{bucketLabel}</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
        {RS_AXES.map(({ key, label }) => (
          <div key={key} style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', textTransform: 'uppercase' }}>{label}</div>
            <div style={{ fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: rsColor(row[key]) }}>{fmtRs(row[key])}</div>
          </div>
        ))}
      </div>

      <div style={{ width: '100%', height: 170 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData} outerRadius="75%">
            <PolarGrid stroke="var(--border)" />
            <PolarAngleAxis dataKey="axis" tick={{ fill: 'var(--t3)', fontSize: FONT_SIZE['2xs'] }} />
            <PolarRadiusAxis tick={{ fill: 'var(--t3)', fontSize: FONT_SIZE['2xs'] }} />
            <Radar name="RS vs SPY" dataKey="RS" stroke="var(--acc)" fill="var(--acc)" fillOpacity={0.35} />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <TickerRow label="Leaders" rows={constituents?.leaders} color="var(--c5)" />
      <TickerRow label="Setting Up" rows={constituents?.settingUp} color="var(--c3)" />
    </div>
  );
}

export function SectorRotationCard({ rows, loading, asOf, constituents, constituentsLoading }: Props) {
  if (loading && rows.length === 0) {
    return <div style={{ color: 'var(--t3)', fontSize: FONT_SIZE.sm }}>Loading sector data…</div>;
  }

  const sorted = [...rows].sort((a, b) => rowRank(b) - rowRank(a));

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        {sorted.map((row, i) => (
          <SectorCard key={row.symbol} row={row} rank={i + 1} constituents={constituents[row.symbol]} />
        ))}
      </div>
      <SourceNote
        source={`RS = relative strength vs SPY (pp) over each lookback · radar plots RS across Week/1M/3M/6M/1Y · Leaders/Setting Up are each sector's own constituents${constituentsLoading ? ' (loading…)' : ''}, not STW holdings · MAs: TwelveData daily`}
        asOf={asOf}
      />
    </div>
  );
}
