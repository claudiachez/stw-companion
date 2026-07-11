import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  evaluateRiskConfig,
  type PositionInput, type ConcentrationViolation, type ViolationSeverity,
} from '@stw/shared';
import { useAuthStore } from '../../store/auth';
import { LoadingSpinner } from '../../primitives/LoadingSpinner';
import { HelpToggle } from '../../primitives/HelpToggle';
import { StatusPill, type StatusPillVariant } from '../../primitives/StatusPill';
import { useUserPositions } from '../portfolio/useUserPositions';
import { useSyncPortfolio } from '../portfolio/useSyncPortfolio';
import { useRiskConfig, useSectorMap, useViolationAcks, useAcknowledgeViolation, useEnsureRiskConfig } from './useRiskConfig';
import type { ViolationType, AckStatus } from './api';

// Book-level violations display — split out of the original LimitsPanel (host
// decision, 2026-07-06) so it can live on My Portfolio instead of Settings.
// Settings keeps only RiskConfigForm (account setup); this reads the same
// user_positions/risk_config data and renders read-only + acknowledge UI.
// Collapsed by default (one-line status strip) so a clean book doesn't crowd
// the page. `showSyncButton` is admin-only (apps/admin's LimitsPanel composite)
// — on My Portfolio, the page's own Sync button already invalidates the same
// `useUserPositions` query key, so no second sync control is needed there.

// Four severity tiers (see @stw/shared limits.ts): a NEAR (≥80% of limit) amber
// tier is the actionable early warning — a breach is already too late; and an
// UNEVALUATED gray tier is missing data (unmapped sector), never a breach, so it
// can't become a permanent red flag the operator learns to ignore.
const SEVERITY_PILL: Record<ViolationSeverity, { variant: StatusPillVariant; label: string }> = {
  ok: { variant: 'ok', label: 'OK' },
  near: { variant: 'near', label: 'Near' },
  breach: { variant: 'breach', label: 'Breach' },
  unevaluated: { variant: 'unevaluated', label: 'Unevaluated' },
};

const SEVERITY_TEXT_COLOR: Record<ViolationSeverity, string> = {
  ok: 'var(--acc)',
  near: 'var(--status-warning-text)',
  breach: 'var(--status-negative-text)',
  unevaluated: 'var(--t3)',
};

function ViolationRow({
  v, ack, onAcknowledge, note: noteBadge, ackable = true,
}: {
  v: ConcentrationViolation;
  ack: { status: AckStatus; glide_path_note: string | null } | undefined;
  onAcknowledge: (status: AckStatus, note?: string) => void;
  note?: string;
  /** When false, breaches show the pill but not the acknowledge/glide-path workflow. */
  ackable?: boolean;
}) {
  const status = ack?.status ?? 'new';
  const committedGlide = status === 'glide_path' ? (ack?.glide_path_note ?? '') : '';
  const [editingGlide, setEditingGlide] = useState(false);
  const [note, setNote] = useState(ack?.glide_path_note ?? '');
  const pill = SEVERITY_PILL[v.severity];
  const unevaluated = v.severity === 'unevaluated';

  return (
    <div className="flex flex-col gap-2 py-3 border-b border-bsub last:border-0">
      <div className="flex items-center justify-between gap-3">
        <span className="text-text text-sm font-medium">
          {v.scope}
          {noteBadge && <span className="text-t3 text-xs font-normal ml-1.5">{noteBadge}</span>}
        </span>
        <div className="flex items-center gap-2">
          {!unevaluated && (
            <span className="text-xs tabular-nums" style={{ color: SEVERITY_TEXT_COLOR[v.severity] }}>
              {v.exposurePct.toFixed(1)}% / {v.limitPct}%
            </span>
          )}
          <StatusPill variant={pill.variant}>{pill.label}</StatusPill>
        </div>
      </div>

      {/* Missing-data row: explain, don't offer a false acknowledge/glide action. */}
      {unevaluated && (
        <div className="text-t3 text-xs">
          No sector mapping yet — this position can’t be evaluated. Map its sector to include it.
        </div>
      )}

      {/* Breaches get the acknowledge + glide-path workflow. Acknowledgment (I've
          seen it) is kept distinct from the glide path (my committed reduction
          plan); once a glide path is set it renders as plain text, not an input. */}
      {v.severity === 'breach' && ackable && (
        <div className="flex flex-col gap-2">
          {committedGlide && !editingGlide ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-[10px] text-t3 uppercase tracking-wide">Glide path</span>
              <span className="text-t2 flex-1 min-w-[180px]">{committedGlide}</span>
              <button onClick={() => setEditingGlide(true)} className="text-t3 hover:text-t2">Edit</button>
            </div>
          ) : editingGlide || status !== 'glide_path' ? (
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                {status === 'new' && (
                  <button
                    onClick={() => onAcknowledge('acknowledged')}
                    className="text-xs px-2 py-1 rounded bg-s2 border border-border text-text"
                  >
                    Acknowledge
                  </button>
                )}
                {status === 'acknowledged' && (
                  <span className="text-[10px] text-t3 uppercase tracking-wide">Acknowledged</span>
                )}
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Glide path"
                  className="flex-1 min-w-[220px] bg-s2 border border-border rounded px-2 py-1 text-xs text-text"
                />
                <button
                  onClick={() => { onAcknowledge('glide_path', note); setEditingGlide(false); }}
                  disabled={!note.trim()}
                  className="text-xs px-2 py-1 rounded bg-acc text-white disabled:opacity-40"
                >
                  Set glide path
                </button>
              </div>
              {/* Format example as persistent helper text, not a placeholder that
                  vanishes the moment you start typing (when it's most useful). */}
              <span className="text-[10px] text-t3">e.g. “no adds; reduce to 10% by 2026-08-01”</span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function GrossExposureBar({ v, ladderTargetPct }: { v: ConcentrationViolation; ladderTargetPct: number | null }) {
  const { exposurePct: pct, limitPct } = v;
  const scaleMax = Math.max(limitPct, pct, 100) * 1.05;
  const fillPct = Math.min(100, (pct / scaleMax) * 100);
  const limitMarkerPct = Math.min(100, (limitPct / scaleMax) * 100);
  const ladderMarkerPct = ladderTargetPct !== null ? Math.min(100, (ladderTargetPct / scaleMax) * 100) : null;
  // At-limit (100%/100%) is `near` → amber, never green: a full bar you're trained
  // to see as "fine" defeats the point.
  const fill = SEVERITY_TEXT_COLOR[v.severity];
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-end text-xs">
        <span className="tabular-nums" style={{ color: fill }}>
          {pct.toFixed(1)}% / {limitPct}%
        </span>
      </div>
      {/* Ticks on the track make "how far over" legible: a solid mark at the cap
          (so an overshoot reads as distance past it, not a full bar) + a lighter
          mark at the drawdown-ladder target. */}
      <div className="relative h-2.5 rounded-full bg-s2 border border-border overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${fillPct}%`, background: fill }} />
        {ladderMarkerPct !== null && (
          <div className="absolute top-0 bottom-0" style={{ left: `${ladderMarkerPct}%`, width: 1, background: 'var(--status-warning-text)', opacity: 0.7 }} title={`Ladder target: ${ladderTargetPct}%`} />
        )}
        <div className="absolute top-0 bottom-0" style={{ left: `${limitMarkerPct}%`, width: 2, background: 'var(--text)' }} title={`Cap: ${limitPct}%`} />
      </div>
      <div className="flex items-center gap-3 text-[10px] text-t3">
        <span><span style={{ color: 'var(--text)' }}>▏</span> cap {limitPct}%</span>
        {ladderTargetPct !== null && <span><span style={{ color: 'var(--status-warning-text)' }}>▏</span> target {ladderTargetPct}%</span>}
      </div>
      {ladderTargetPct !== null && (
        <div className="text-xs text-[var(--status-warning-text)] bg-[var(--status-warning-bg)] border border-[var(--status-warning-border)] rounded px-3 py-2 mt-1">
          Drawdown ladder target: reduce gross to {ladderTargetPct}%
        </div>
      )}
    </div>
  );
}

const SEVERITY_RANK: Record<ViolationSeverity, number> = { breach: 0, near: 1, unevaluated: 2, ok: 3 };

/** One-line roll-up: "18/20 within limit · 1 breach · 1 near · max HOOD 8.5%/10%". */
function sectionSummary(violations: ConcentrationViolation[]): string {
  const evaluated = violations.filter((v) => v.severity !== 'unevaluated');
  const breaches = evaluated.filter((v) => v.severity === 'breach').length;
  const near = evaluated.filter((v) => v.severity === 'near').length;
  const withinLimit = evaluated.length - breaches;
  const unevaluated = violations.length - evaluated.length;

  const parts = [`${withinLimit}/${evaluated.length} within limit`];
  if (breaches) parts.push(`${breaches} breach${breaches === 1 ? '' : 'es'}`);
  if (near) parts.push(`${near} near`);
  if (unevaluated) parts.push(`${unevaluated} unevaluated`);

  const top = [...evaluated].sort((a, b) => (b.exposurePct / (b.limitPct || 1)) - (a.exposurePct / (a.limitPct || 1)))[0];
  if (top) parts.push(`max ${top.scope} ${top.exposurePct.toFixed(1)}%/${top.limitPct}%`);
  return parts.join(' · ');
}

function BreachOnlyList({
  title, description, help, violations, ackFor, onAcknowledge, unmappedNote, ackable = true, ackType = 'position',
}: {
  title: string;
  description: ReactNode;
  /** Optional deeper "what / why / how" shown behind an ⓘ next to the title. */
  help?: ReactNode;
  violations: ConcentrationViolation[];
  ackFor?: (scope: string, type: ViolationType) => { status: AckStatus; glide_path_note: string | null } | undefined;
  onAcknowledge?: (scope: string, status: AckStatus, note?: string) => void;
  unmappedNote?: string;
  /** Option concentration is display-only (no ack type in the DB) — pass false. */
  ackable?: boolean;
  ackType?: ViolationType;
}) {
  const [showAll, setShowAll] = useState(false);
  const type = ackType;
  // Exceptions are the resting view: anything not comfortably OK — breaches,
  // near-limit (the actionable early warning), and unevaluated (missing data).
  const exceptions = violations.filter((v) => v.severity !== 'ok').sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  const shown = showAll ? [...violations].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]) : exceptions;
  const hiddenCount = violations.length - shown.length;

  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <div className="text-text font-semibold text-sm flex items-center gap-1.5">
        {title}
        {help && <HelpToggle ariaLabel={`About ${title}`}>{help}</HelpToggle>}
      </div>
      <div className="text-t3 text-xs mt-0.5" style={{ lineHeight: 1.5 }}>{description}</div>
      {violations.length > 0 && <div className="text-t3 text-xs mt-2 mb-2" style={{ color: 'var(--t2)' }}>{sectionSummary(violations)}</div>}
      {violations.length === 0 && <div className="text-t3 text-xs">No positions.</div>}
      {violations.length > 0 && shown.length === 0 && (
        <div className="text-t3 text-xs">All {violations.length} comfortably within limit.</div>
      )}
      {shown.map((v) => (
        <ViolationRow
          key={v.scope}
          v={v}
          ackable={ackable}
          ack={ackFor?.(v.scope, type)}
          onAcknowledge={(status, note) => onAcknowledge?.(v.scope, status, note)}
          note={v.severity === 'unevaluated' ? unmappedNote : undefined}
        />
      ))}
      {hiddenCount > 0 && (
        <button onClick={() => setShowAll(true)} className="text-xs text-t3 hover:text-t2 mt-2">
          Show all {violations.length}
        </button>
      )}
      {showAll && exceptions.length < violations.length && (
        <button onClick={() => setShowAll(false)} className="text-xs text-t3 hover:text-t2 mt-2">
          Show exceptions only
        </button>
      )}
    </div>
  );
}

export function ViolationsSummary({ showSyncButton = false, settingsTo }: { showSyncButton?: boolean; settingsTo?: string }) {
  const userId = useAuthStore((s) => s.user?.id);

  // "Settings" renders as a link when the host app provides a route (web → /settings);
  // admin has no /settings route, so it falls back to plain text there.
  const settingsRef: ReactNode = settingsTo
    ? <Link to={settingsTo} style={{ color: 'var(--acc)', fontWeight: 600 }}>Settings</Link>
    : 'Settings';

  const { data: positions, isLoading: positionsLoading } = useUserPositions();
  const { data: config, isLoading: configLoading } = useRiskConfig(userId);
  const { data: sectorMap } = useSectorMap();
  const { data: acks } = useViolationAcks(userId);
  const acknowledge = useAcknowledgeViolation(userId);
  const { sync, isSyncing, syncError, lastResult } = useSyncPortfolio();

  useEnsureRiskConfig(userId, config, configLoading);

  if (positionsLoading || configLoading || !config) return <LoadingSpinner className="mt-8" />;

  const positionInputs: PositionInput[] = (positions ?? []).map((p) => ({
    underlying: p.underlying,
    quantity: p.quantity,
    markPrice: p.mark_price,
    multiplier: p.multiplier,
    isOption: p.asset_class === 'OPT',
  }));

  // Prefer the LIVE Net Liquidation Value from the IBKR NAV sync (migration 070) —
  // the manual account_equity is only the fallback until the first NAV sync lands.
  // A stale deposit figure is what made gross exposure read ~114% when the real
  // number was far lower.
  const accountEquity = config.ibkr_nlv ?? config.account_equity;
  const usingLiveEquity = config.ibkr_nlv != null;
  const drawdownPct = config.equity_peak
    ? ((accountEquity - config.equity_peak) / config.equity_peak) * 100
    : null;

  const result = evaluateRiskConfig(positionInputs, sectorMap ?? {}, accountEquity, {
    maxPositionPct: config.max_position_pct,
    maxOptionPositionPct: config.max_option_position_pct,
    maxSectorPct: config.max_sector_pct,
    maxGrossPct: config.max_gross_pct,
    ladder: config.ladder,
  }, drawdownPct);

  function ackFor(scope: string, type: ViolationType) {
    return acks?.find((a) => a.scope === scope && a.violation_type === type);
  }

  const allViolations = [...result.positionViolations, ...result.optionViolations, ...result.sectorViolations, result.grossViolation];
  const totalBreaches = allViolations.filter((v) => v.severity === 'breach').length;
  const totalNear = allViolations.filter((v) => v.severity === 'near').length;
  // Counts-only roll-up — the gross % lives in the Gross exposure card below, so the
  // header no longer repeats it (was "Gross 116%…" here AND "115.9%…" in the card).
  const summaryLine = totalBreaches === 0 && totalNear === 0
    ? 'All within limit'
    : [
      totalBreaches ? `${totalBreaches} breach${totalBreaches === 1 ? '' : 'es'}` : '',
      totalNear ? `${totalNear} near` : '',
    ].filter(Boolean).join(' · ');

  const sectorDataMissing = !sectorMap || Object.keys(sectorMap).length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          {/* Section header — larger/bolder than the card titles below so the
              page reads as "one section governing four cards", not a flat stack. */}
          <span className="text-text font-bold text-base shrink-0">Risk limits</span>
          <span className="text-t3 text-xs" style={{ color: totalBreaches > 0 ? 'var(--status-negative-text)' : totalNear > 0 ? 'var(--status-warning-text)' : 'var(--t3)' }}>{summaryLine}</span>
        </div>
        {showSyncButton && (
          <button
            onClick={() => sync()}
            disabled={isSyncing}
            className="shrink-0 px-3 py-1.5 rounded text-xs font-semibold bg-acc text-white cursor-pointer"
            style={{ opacity: isSyncing ? 0.6 : 1 }}
          >
            {isSyncing ? 'Syncing…' : 'Sync & Evaluate'}
          </button>
        )}
      </div>

      <div className="text-t3 text-xs" style={{ marginTop: -8, lineHeight: 1.5 }}>
        We compare your own IBKR positions (synced from your account) against the limits you
        set in {settingsRef}. It's a heads-up only — nothing here places or blocks a trade; it
        just flags where you're over the line so you can decide what to do.
        {lastResult && ` Synced ${lastResult.count} position${lastResult.count !== 1 ? 's' : ''}.`}
      </div>
      {syncError && (
        <div className="text-xs font-medium text-[var(--status-negative-text)] bg-[var(--status-negative-bg)] border border-[var(--status-negative-border)] rounded px-3 py-2">
          Sync failed: {syncError} — evaluating against last-synced data below.
        </div>
      )}

      {/* The four limit cards are one group — a subtle tinted container sets them
          apart from the standalone Regime light card (same card style) above. */}
      <div className="rounded-2xl border border-border p-3 flex flex-col gap-4" style={{ background: 'var(--s2)' }}>
      <div className="bg-surface border border-border rounded-xl p-5">
        <div className="text-text font-semibold text-sm flex items-center gap-1.5">
          Gross exposure
          <StatusPill variant={SEVERITY_PILL[result.grossViolation.severity].variant}>{SEVERITY_PILL[result.grossViolation.severity].label}</StatusPill>
          <HelpToggle ariaLabel="About gross exposure">
            <span className="block">Your total market value ÷ your account equity.</span>
            <span className="block text-t3 mt-1">Above 100% means you're using leverage/margin, so a market drop hits your equity harder.</span>
            <span className="block text-t3 mt-1">Keep it near or under your gross cap; as you draw down, the ladder auto-tightens the target.</span>
          </HelpToggle>
        </div>
        <div className="text-t3 text-xs mt-0.5 mb-3" style={{ lineHeight: 1.5 }}>
          Total market value of every position vs your account equity. Above 100% means you're
          using leverage/margin; the drawdown ladder can trim this target as you draw down.
        </div>
        {usingLiveEquity ? (
          <div className="text-t3 text-xs mb-2 tabular-nums">
            vs live account equity {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(accountEquity)} — Net Liquidation Value from your last IBKR sync (incl. margin).
          </div>
        ) : config.is_placeholder && (
          <div className="text-t3 text-xs mb-2">
            Using a default $100,000 account equity — connect IBKR (with the NAV section) so this reads
            your live balance, or set a figure in Settings.
          </div>
        )}
        <GrossExposureBar
          v={result.grossViolation}
          ladderTargetPct={result.ladderTargetGrossPct}
        />
      </div>

      <BreachOnlyList
        title="Position concentration"
        description="Each ticker's share of your book vs your single-name cap — limits how much any one position can hurt you."
        help={<>
          <span className="block">Each ticker's market value as a % of your whole book, vs your single-name cap.</span>
          <span className="block text-t3 mt-1">Caps how much any one position can hurt you if it gaps against you.</span>
          <span className="block text-t3 mt-1">Over the line? Trim it, or set a glide path (a dated plan to reduce).</span>
        </>}
        violations={result.positionViolations}
        ackType="position"
        ackFor={ackFor}
        onAcknowledge={(scope, status, note) => acknowledge.mutate({ scope, violationType: 'position', status, glidePathNote: note })}
      />

      <BreachOnlyList
        title="Option concentration"
        description={<>Each ticker's OPTIONS exposure vs your option cap — options carry more risk per dollar (leverage, time decay), so this cap is usually tighter than the overall position cap. Set it under {settingsRef} → thresholds.</>}
        help={<>
          <span className="block">Each underlying's OPTIONS exposure as a % of your book, vs your option cap.</span>
          <span className="block text-t3 mt-1">Options carry more risk per dollar (leverage + time decay), so this cap is usually tighter than the overall position cap.</span>
          <span className="block text-t3 mt-1">Set the cap under Settings → thresholds.</span>
        </>}
        violations={result.optionViolations}
        ackable={false}
      />

      <BreachOnlyList
        title="Sector concentration"
        description="Each sector's share of your book vs your sector cap — limits thematic (correlated) risk when several names move together."
        help={<>
          <span className="block">Each sector's combined market value as a % of your book, vs your sector cap.</span>
          <span className="block text-t3 mt-1">Limits correlated risk — when a whole theme sells off, names in it tend to move together.</span>
          <span className="block text-t3 mt-1">Diversify or trim the heaviest sector to bring it back in line.</span>
        </>}
        violations={result.sectorViolations}
        ackType="sector"
        ackFor={ackFor}
        onAcknowledge={(scope, status, note) => acknowledge.mutate({ scope, violationType: 'sector', status, glidePathNote: note })}
        unmappedNote={sectorDataMissing ? '(no sector data yet)' : undefined}
      />
      </div>
    </div>
  );
}
