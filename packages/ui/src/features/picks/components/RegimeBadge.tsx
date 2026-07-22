import type { TrendBucket, SectorStanding } from '@stw/shared';
import { TREND_BUCKET_META, FONT_SIZE, FONT_WEIGHT } from '@stw/shared';
import type { TickerRegime } from '../useTickerRegime';

// Bucket → CSS color token (kept in the UI; the shared layer stays framework-agnostic —
// same convention as TrendStructureTable.tsx's BUCKET_COLOR).
const BUCKET_COLOR: Record<TrendBucket, string> = {
  momentum:         'var(--c5)',
  healthy_pullback: 'var(--c5)',
  mid_caution:      'var(--c3)',
  bear_rally:       'var(--c3)',
  risk_off:         'var(--c1)',
};

const STANDING_META: Record<SectorStanding, { label: string; color: string }> = {
  leader:     { label: 'Sector Leader',     color: 'var(--c5)' },
  setting_up: { label: 'Sector Setting Up', color: 'var(--c3)' },
  laggard:    { label: 'Sector Laggard',    color: 'var(--c1)' },
};

/**
 * A held ticker's own 9/21/200 trend structure + its sector's current rotation
 * standing. Two independent signals, shown as two small chips: the ticker's own
 * structure (never the Regime Banner's market-wide wording — see CLAUDE.md's
 * Macro module-structure note) and, separately, its sector's context.
 */
export function RegimeBadge({ regime, compact = false }: { regime: TickerRegime | undefined; compact?: boolean }) {
  if (!regime || (regime.bucket === null && regime.standing === null)) return null;

  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
      {regime.bucket && (
        <span
          title="This ticker's own 9/21/200 EMA trend structure"
          style={{
            fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.semibold,
            color: BUCKET_COLOR[regime.bucket], whiteSpace: 'nowrap',
          }}
        >
          {TREND_BUCKET_META[regime.bucket].label}
        </span>
      )}
      {!compact && regime.standing && (
        <span
          title={regime.sectorName ? `${regime.sectorName} sector rotation standing` : 'Sector rotation standing'}
          style={{
            fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.semibold,
            color: STANDING_META[regime.standing].color, whiteSpace: 'nowrap',
          }}
        >
          {STANDING_META[regime.standing].label}
        </span>
      )}
    </span>
  );
}
