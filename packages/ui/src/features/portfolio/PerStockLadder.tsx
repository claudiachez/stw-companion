import { FONT_SIZE, FONT_WEIGHT, SPACE, RADIUS, type ViolationSeverity } from '@stw/shared';
import { StatusPill, type StatusPillVariant } from '../../primitives/StatusPill';
import { HelpToggle } from '../../primitives/HelpToggle';
import type { PerStockLadderInfo } from './usePerStockLadders';

// The per-stock ladder reuses the shared ok/near/breach severity vocabulary — but a
// "satisfied" rung (you've already trimmed to target) reads ok, so a compact chip only
// appears when there's something to act on (near/breach).
const SEVERITY_TEXT: Record<ViolationSeverity, string> = {
  ok: 'var(--acc)', near: 'var(--status-warning-text)', breach: 'var(--status-negative-text)', unevaluated: 'var(--t3)',
};

const fmtDd = (pct: number) => `${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(1)}%`;
const fmtPrice = (n: number) => `$${n.toFixed(2)}`;

/**
 * Compact per-stock drawdown chip for a position row — shown ONLY when the name needs
 * attention (near a rung, or past one and not yet trimmed). A satisfied/ok position shows
 * nothing, so rows stay quiet until there's something to do.
 */
export function PerStockLadderChip({ info }: { info: PerStockLadderInfo | undefined }) {
  if (!info) return null;
  const { severity, targetHoldPct } = info.status;
  if (severity === 'ok' || severity === 'unevaluated') return null;
  const variant: StatusPillVariant = severity;
  const label = severity === 'breach'
    ? `↓${Math.abs(info.status.drawdownPct).toFixed(0)}% → hold ≤${targetHoldPct}%`
    : `↓${Math.abs(info.status.drawdownPct).toFixed(0)}% near stop`;
  return <StatusPill variant={variant}>{label}</StatusPill>;
}

/**
 * Full per-stock ladder section for the position detail pane. Distinct from the account
 * "Portfolio drawdown" card (host: the three de-risking concepts must read as separate) —
 * this is one NAME's stop ladder off its own drawdown-from-entry, setting no gross target.
 */
export function PerStockLadderDetail({ info, ladder }: {
  info: PerStockLadderInfo | undefined;
  /** The user's configured rungs, to render the full ladder with the active one marked. */
  ladder: { drawdownPct: number; holdFractionPct: number }[];
}) {
  if (!info) {
    return <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t3)' }}>No stock position to evaluate.</div>;
  }
  const { status, currentPrice, priceIsLive, avgCost, currentQty, peakQty, historyIncomplete } = info;
  const { severity, activeRung, nextRung, targetHoldPct, currentHoldPct, alreadyComplies, distanceToNextPp } = status;
  const pillLabel = severity === 'breach' ? 'Action' : severity === 'near' ? 'Near' : 'On track';
  const pillVariant: StatusPillVariant = severity === 'ok' ? 'ok' : severity;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE[2] }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[2], flexWrap: 'wrap' }}>
        <span style={{ fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: SEVERITY_TEXT[severity], fontVariantNumeric: 'tabular-nums' }}>
          {fmtDd(status.drawdownPct)}
        </span>
        <span style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)' }}>from entry</span>
        <StatusPill variant={pillVariant}>{pillLabel}</StatusPill>
        <HelpToggle ariaLabel="About the per-stock stop ladder">
          <span className="block">A stop ladder for <strong>this one position</strong>, off its drawdown from your average cost — separate from your account-wide Portfolio drawdown.</span>
          <span className="block text-t3 mt-1">Each rung says how much of your <strong>peak</strong> size to keep at that loss. Once you've trimmed to a rung's target it goes quiet.</span>
          <span className="block text-t3 mt-1">Advisory only — nothing here places or blocks a trade.</span>
        </HelpToggle>
      </div>

      {/* What to do now */}
      <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)', lineHeight: 1.5 }}>
        {activeRung ? (
          alreadyComplies === true ? (
            <span>Past the {activeRung.drawdownPct}% rung — and you've trimmed to target (holding {currentHoldPct?.toFixed(0)}% of peak, ≤ {targetHoldPct}%). {nextRung ? `Next rung ${nextRung.drawdownPct}% → hold ≤${nextRung.holdFractionPct}%.` : 'Deepest rung.'}</span>
          ) : (
            <span style={{ color: 'var(--status-negative-text)' }}>
              Down past the {activeRung.drawdownPct}% rung — your plan: reduce to ≤{targetHoldPct}% of peak
              {currentHoldPct !== null ? ` (you're holding ${currentHoldPct.toFixed(0)}%)` : ''}.
            </span>
          )
        ) : nextRung ? (
          <span>Above the first rung. Next: {nextRung.drawdownPct}% → hold ≤{nextRung.holdFractionPct}% of peak{distanceToNextPp !== null ? ` · ${distanceToNextPp.toFixed(1)}pp away` : ''}.</span>
        ) : (
          <span className="text-t3">No rungs configured.</span>
        )}
      </div>

      {/* Full ladder, active rung marked */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE[1.5] }}>
        {ladder.map((r) => {
          const isActive = activeRung?.drawdownPct === r.drawdownPct;
          return (
            <span key={r.drawdownPct} style={{
              fontSize: FONT_SIZE['2xs'], fontVariantNumeric: 'tabular-nums',
              padding: '2px 7px', borderRadius: RADIUS.DEFAULT,
              border: `1px solid ${isActive ? SEVERITY_TEXT[severity] : 'var(--border)'}`,
              color: isActive ? SEVERITY_TEXT[severity] : 'var(--t3)',
              background: isActive ? 'var(--s2)' : 'transparent',
              fontWeight: isActive ? FONT_WEIGHT.semibold : undefined,
            }}>
              {r.drawdownPct}% → {r.holdFractionPct === 0 ? 'exit' : `keep ≤${r.holdFractionPct}%`}
            </span>
          );
        })}
      </div>

      {historyIncomplete && (
        <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--status-warning-text)', lineHeight: 1.5 }}>
          Trim history incomplete — older fills have aged out of the broker feed, so we can't confirm prior trims. Showing the alert on the safe side.
        </div>
      )}

      {/* Source + as-of, mirroring the pane's price treatment. */}
      <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', fontVariantNumeric: 'tabular-nums' }}>
        Entry avg {fmtPrice(avgCost)} · current {fmtPrice(currentPrice)} · Source: {priceIsLive ? 'Finnhub (live)' : 'IBKR mark'}
        {peakQty !== null ? ` · peak ${Math.abs(peakQty).toLocaleString()} sh, now ${Math.abs(currentQty).toLocaleString()}` : ''}
      </div>
    </div>
  );
}
