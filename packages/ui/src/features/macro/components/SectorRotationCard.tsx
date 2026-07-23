import type { SectorRotationRow, TrendBucket } from '@stw/shared';
import { TREND_BUCKET_META, FONT_SIZE, FONT_WEIGHT } from '@stw/shared';
import { Card, CardHeader, HelpPanel, SourceNote } from './macroVisuals';
import type { SectorConstituents } from '../useSectorRotation';

// "Where money is rotating" — the 11 SPDR sectors ranked leader→laggard, grouped
// into structure bands (colored band headers spelling the 9/21/200 combination).
// Each row: rank, sector, three RS-vs-SPY cells (W/1M/3M) as a signed number over a
// zero-centered bar scaled to the largest absolute move on the page, plus an
// "On the radar" column of leader (solid) / setting-up (dashed) constituent badges.
// RS values + buckets + constituent rankings all arrive from useSectorRotation /
// the shared relativeStrength + rankSectorConstituents scorers — pure re-layout.

interface Props {
  rows: SectorRotationRow[];
  loading: boolean;
  asOf: string | null;
  updatedAt?: Date | string | null;
  constituents: Record<string, SectorConstituents>;
  constituentsLoading: boolean;
  helpOpen: boolean;
  onToggleHelp: () => void;
  help: React.ReactNode;
}

const BUCKET_COLOR: Record<TrendBucket, string> = {
  momentum:         'var(--status-positive-text)',
  healthy_pullback: 'var(--status-positive-text)',
  mid_caution:      'var(--status-warning-text)',
  bear_rally:       'var(--status-warning-text)',
  risk_off:         'var(--status-negative-text)',
};

const BUCKET_BG: Record<TrendBucket, string> = {
  momentum:         'var(--status-positive-bg)',
  healthy_pullback: 'var(--status-positive-bg)',
  mid_caution:      'var(--status-warning-bg)',
  bear_rally:       'var(--status-warning-bg)',
  risk_off:         'var(--status-negative-bg)',
};

const COLS: { key: 'rsWeek' | 'rs1M' | 'rs3M'; label: string }[] = [
  { key: 'rsWeek', label: 'W' },
  { key: 'rs1M', label: '1M' },
  { key: 'rs3M', label: '3M' },
];

function fmtRs(v: number | null): string {
  if (v === null) return '—';
  return (v >= 0 ? '+' : '') + v.toFixed(1);
}
function rsColor(v: number | null): string {
  if (v === null) return 'var(--t3)';
  return v > 0 ? 'var(--status-positive-text)' : v < 0 ? 'var(--status-negative-text)' : 'var(--t2)';
}

/** Sub-score so sectors rank leader-to-laggard (bucket strength + 1-month RS). */
function rowRank(row: SectorRotationRow): number {
  const bucketScore = row.bucket ? TREND_BUCKET_META[row.bucket].score : 0;
  return bucketScore + (row.rs1M ?? 0);
}

/** Zero-centered bar geometry for a signed RS value scaled to `maxAbs`. */
function bar(v: number | null, maxAbs: number): { left: number; width: number } {
  if (v === null || maxAbs === 0) return { left: 50, width: 0 };
  const w = (Math.abs(v) / maxAbs) * 50;
  return v >= 0 ? { left: 50, width: w } : { left: 50 - w, width: w };
}

function RsCell({ v, maxAbs, tip }: { v: number | null; maxAbs: number; tip: string }) {
  const color = rsColor(v);
  const b = bar(v, maxAbs);
  return (
    <span title={tip} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'help' }}>
      <span style={{ fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.semibold, color, fontVariantNumeric: 'tabular-nums' }}>{fmtRs(v)}</span>
      <span style={{ width: '100%', height: 4, borderRadius: 2, background: 'var(--bsub)', position: 'relative' }}>
        <span style={{ position: 'absolute', top: 0, height: '100%', borderRadius: 2, left: `${b.left}%`, width: `${b.width}%`, background: color }} />
      </span>
    </span>
  );
}

function RadarBadges({ c }: { c?: SectorConstituents }) {
  const leaders = c?.leaders ?? [];
  const settingUp = c?.settingUp ?? [];
  if (leaders.length === 0 && settingUp.length === 0) {
    return <span style={{ width: 240, flexShrink: 0, fontSize: FONT_SIZE['2xs'], color: 'var(--t3)' }}>—</span>;
  }
  return (
    <span style={{ width: 240, flexShrink: 0, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {leaders.map((r) => (
        <span key={`l-${r.symbol}`} title={`${r.name} · leader — confirmed bullish structure`} style={{
          display: 'inline-flex', padding: '1px 8px', borderRadius: 999,
          background: 'var(--status-positive-bg)', border: '1px solid var(--status-positive-border)', color: 'var(--status-positive-text)',
          fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.bold,
        }}>{r.symbol}</span>
      ))}
      {settingUp.map((r) => (
        <span key={`s-${r.symbol}`} title={`${r.name} · setting up — turning positive on 1M RS`} style={{
          display: 'inline-flex', padding: '1px 8px', borderRadius: 999,
          border: '1px dashed var(--border)', color: 'var(--t2)',
          fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.semibold,
        }}>{r.symbol}</span>
      ))}
    </span>
  );
}

export function SectorRotationCard({ rows, loading, asOf, updatedAt, constituents, constituentsLoading, helpOpen, onToggleHelp, help }: Props) {
  if (loading && rows.length === 0) {
    return (
      <Card>
        <CardHeader title="Where money is rotating" meta="11 SPDR sectors · structure live · RS daily" helpOpen={helpOpen} onToggleHelp={onToggleHelp} />
        {helpOpen && <HelpPanel>{help}</HelpPanel>}
        <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t3)', marginTop: 8 }}>Loading sector data…</div>
      </Card>
    );
  }

  const sorted = [...rows].sort((a, b) => rowRank(b) - rowRank(a));
  const maxAbs: Record<string, number> = {};
  COLS.forEach(({ key }) => {
    maxAbs[key] = Math.max(1, ...sorted.map((r) => Math.abs(r[key] ?? 0)));
  });

  // Emit a band header whenever the bucket changes going down the ranked list.
  let prevBucket: TrendBucket | null | undefined;

  return (
    <Card>
      <CardHeader title="Where money is rotating" meta="11 SPDR sectors · structure live · RS daily" helpOpen={helpOpen} onToggleHelp={onToggleHelp} />
      <div style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', lineHeight: 1.5, marginTop: 2, marginBottom: 8 }}>
        Ranked #1 (leading) → #11 (lagging) by structure + 1-month relative strength vs SPY. Bar length = size of the move.
      </div>
      {helpOpen && <HelpPanel>{help}</HelpPanel>}

      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 620 }}>
          {/* Column header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 0 4px' }}>
            <span style={{ width: 26, flexShrink: 0 }} />
            <span style={{ width: 150, flexShrink: 0, fontSize: FONT_SIZE['3xs'], fontWeight: FONT_WEIGHT.bold, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--t3)' }}>Sector</span>
            <span style={{ flex: 1, display: 'flex', gap: 10, fontSize: FONT_SIZE['3xs'], fontWeight: FONT_WEIGHT.bold, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--t3)' }}>
              {COLS.map((c) => <span key={c.key} style={{ flex: 1, textAlign: 'center' }}>{c.label}</span>)}
            </span>
            <span style={{ width: 240, flexShrink: 0, fontSize: FONT_SIZE['3xs'], fontWeight: FONT_WEIGHT.bold, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--t3)' }}>On the radar</span>
          </div>

          {sorted.map((row, i) => {
            const showBand = row.bucket !== prevBucket;
            prevBucket = row.bucket;
            const bandColorTok = row.bucket ? BUCKET_COLOR[row.bucket] : 'var(--t3)';
            const bandBgTok = row.bucket ? BUCKET_BG[row.bucket] : 'var(--s2)';
            const bandLabel = row.bucket ? TREND_BUCKET_META[row.bucket].groupLabel : 'Unclassified';
            return (
              <div key={row.symbol}>
                {showBand && (
                  <div style={{
                    background: bandBgTok, color: bandColorTok, fontSize: FONT_SIZE['3xs'], fontWeight: FONT_WEIGHT.bold,
                    letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 8px', borderRadius: 4, margin: '3px 0',
                  }}>{bandLabel}</div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid var(--bsub)' }}>
                  <span style={{ width: 26, flexShrink: 0, fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold, color: 'var(--t3)', fontVariantNumeric: 'tabular-nums' }}>{i + 1}</span>
                  <span style={{ width: 150, flexShrink: 0, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: 'var(--text)' }}>
                    {row.symbol} <span style={{ fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.medium, color: 'var(--t3)' }}>{row.name}</span>
                  </span>
                  <span style={{ flex: 1, display: 'flex', gap: 10 }}>
                    {COLS.map((c) => <RsCell key={c.key} v={row[c.key]} maxAbs={maxAbs[c.key]} tip={`${row.symbol} ${c.label} RS vs SPY ${fmtRs(row[c.key])}`} />)}
                  </span>
                  <RadarBadges c={constituents[row.symbol]} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginTop: 8 }}>
        <span><span style={{ display: 'inline-flex', padding: '0 7px', borderRadius: 999, background: 'var(--status-positive-bg)', border: '1px solid var(--status-positive-border)', color: 'var(--status-positive-text)', fontWeight: FONT_WEIGHT.bold, fontSize: FONT_SIZE['3xs'] }}>leader</span> confirmed bullish structure</span>
        <span><span style={{ display: 'inline-flex', padding: '0 7px', borderRadius: 999, border: '1px dashed var(--border)', color: 'var(--t2)', fontWeight: FONT_WEIGHT.semibold, fontSize: FONT_SIZE['3xs'] }}>setting up</span> turning positive on 1M RS</span>
      </div>
      <SourceNote
        source={`SPDR sector ETFs vs SPY · structure classified on live prices vs daily MAs (regroups intraday); RS daily · Leaders/Setting Up are each sector's own constituents${constituentsLoading ? ' (loading…)' : ''}, not STW holdings · TwelveData MAs`}
        href="https://twelvedata.com"
        asOf={asOf}
        updatedAt={updatedAt}
        marginTop={8}
      />
    </Card>
  );
}
