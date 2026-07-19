import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  evaluateRiskConfig, cashflowAdjustedDrawdownPct, bindingGrossTarget,
  drawdownLadderStatus, DRAWDOWN_NEAR_BAND_PP, fmtDateTime,
  type PositionInput, type ConcentrationViolation, type ViolationSeverity, type BindingGrossTarget,
  type DrawdownLadderStatus,
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

const fmtEquity = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

/**
 * Always-on drawdown read (plans/20260719 Item 1) — the fix for "the ladder was
 * silent until it fired". Renders whenever a real drawdown exists (a null drawdown
 * = no NLV+peak yet stays hidden, per the plan), showing the current % + where it
 * sits on the ladder + an amber NEAR the moment it's within the band of the next
 * rung — so the de-risk warning arrives BEFORE the rung, not after. Advisory only.
 */
function DrawdownCard({ status, nlv, asOf, isLive }: {
  status: DrawdownLadderStatus;
  nlv: number | null;
  asOf: string | null;
  /** Drawdown read off live Finnhub-priced positions (Item 2) vs the last IBKR sync. */
  isLive: boolean;
}) {
  const pill = SEVERITY_PILL[status.severity];
  // An `ok` drawdown reads neutral (a small red-number-in-green would jar); only a
  // NEAR/breach takes the amber/red status color so attention tracks real proximity.
  const numColor = status.severity === 'ok' ? 'var(--text)' : SEVERITY_TEXT_COLOR[status.severity];
  const { activeStep, nextStep, distanceToNextPp } = status;
  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <div className="text-text font-semibold text-sm flex items-center gap-1.5">
        Portfolio drawdown
        <StatusPill variant={pill.variant}>{pill.label}</StatusPill>
        <HelpToggle ariaLabel="About portfolio drawdown">
          <span className="block">How far your <strong>whole account</strong> is below its high-water mark — not any single position — adjusted for your deposits and withdrawals so a transfer isn't mistaken for a gain or loss.</span>
          <span className="block text-t3 mt-1">As you draw down, the ladder tightens your gross-exposure target — the rungs below show at what depth. This is reconciled with the market-regime rule above: whichever is tighter binds.</span>
          <span className="block text-t3 mt-1">Amber "near" means you're within {DRAWDOWN_NEAR_BAND_PP} points of the next rung; red means a rung is crossed. Advisory only — nothing here places or blocks a trade.</span>
        </HelpToggle>
      </div>

      <div className="flex items-baseline gap-2 mt-2">
        <span className="text-2xl font-semibold tabular-nums" style={{ color: numColor }}>
          {status.drawdownPct >= 0 ? '+' : '−'}{Math.abs(status.drawdownPct).toFixed(2)}%
        </span>
        <span className="text-t3 text-xs">from peak</span>
      </div>

      {/* Where you sit on the ladder — always shown, breach or not. */}
      <div className="text-t2 text-xs mt-2" style={{ lineHeight: 1.5 }}>
        {activeStep ? (
          <>
            <span style={{ color: SEVERITY_TEXT_COLOR.breach }}>
              Rung crossed at {activeStep.drawdownPct}% — de-risk gross to {activeStep.targetGrossPct}%.
            </span>
            {nextStep && (
              <span className="text-t3">
                {' '}Next rung {nextStep.drawdownPct}% → {nextStep.targetGrossPct}% gross
                {distanceToNextPp !== null && `, ${distanceToNextPp.toFixed(1)}pp away`}.
              </span>
            )}
          </>
        ) : nextStep ? (
          <span>
            Next rung <span className="font-medium text-text">{nextStep.drawdownPct}% → {nextStep.targetGrossPct}% gross</span>
            {distanceToNextPp !== null && (
              <span style={{ color: status.severity === 'near' ? SEVERITY_TEXT_COLOR.near : 'var(--t3)' }}>
                {' '}· {distanceToNextPp.toFixed(1)}pp away
              </span>
            )}
          </span>
        ) : (
          <span className="text-t3">No de-risk rungs configured.</span>
        )}
      </div>

      {/* Source + as-of, per convention (the HoldingDetail price idiom): live drawdown off
          Finnhub-priced positions when quotes are cached, the last IBKR sync on fallback. */}
      <div className="text-t3 text-[10px] mt-2 tabular-nums">
        vs your cash-flow-adjusted peak{nlv != null ? ` · ${isLive ? 'live ' : ''}account Net Liq ${fmtEquity(nlv)}` : ''} · Source: {isLive ? 'Finnhub' : 'IBKR'}{asOf ? ` · as of ${fmtDateTime(asOf)}` : ''}
      </div>
    </div>
  );
}

function GrossExposureBar({ v, binding }: { v: ConcentrationViolation; binding: BindingGrossTarget | null }) {
  const { exposurePct: pct, limitPct } = v;
  const targetPct = binding?.targetPct ?? null;
  const scaleMax = Math.max(limitPct, pct, 100) * 1.05;
  const fillPct = Math.min(100, (pct / scaleMax) * 100);
  const limitMarkerPct = Math.min(100, (limitPct / scaleMax) * 100);
  // The bar marker is the BINDING target (the number that actually governs), not the
  // ladder alone — so a tighter double-RED regime target moves the mark too.
  const ladderMarkerPct = targetPct !== null ? Math.min(100, (targetPct / scaleMax) * 100) : null;
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
          mark at the binding de-risk target. */}
      <div className="relative h-2.5 rounded-full bg-s2 border border-border overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${fillPct}%`, background: fill }} />
        {ladderMarkerPct !== null && (
          <div className="absolute top-0 bottom-0" style={{ left: `${ladderMarkerPct}%`, width: 1, background: 'var(--status-warning-text)', opacity: 0.7 }} title={`De-risk target: ${targetPct}%`} />
        )}
        <div className="absolute top-0 bottom-0" style={{ left: `${limitMarkerPct}%`, width: 2, background: 'var(--text)' }} title={`Cap: ${limitPct}%`} />
      </div>
      <div className="flex items-center gap-3 text-[10px] text-t3">
        <span><span style={{ color: 'var(--text)' }}>▏</span> cap {limitPct}%</span>
        {targetPct !== null && <span><span style={{ color: 'var(--status-warning-text)' }}>▏</span> target {targetPct}%</span>}
      </div>
      {binding && (
        <div className="text-xs text-[var(--status-warning-text)] bg-[var(--status-warning-bg)] border border-[var(--status-warning-border)] rounded px-3 py-2 mt-1">
          {binding.source === 'both' ? (
            <>
              {/* Both de-risk triggers live at once — show the ONE binding number plus
                  what it reconciles, so it's not read as two separate instructions. */}
              <span className="block font-semibold">Binding target: reduce gross to {binding.targetPct}%</span>
              <span className="block text-t3 mt-1" style={{ color: 'var(--t2)' }}>
                The tighter of your drawdown ladder ({binding.ladderPct}%) and the double-RED regime rule ({binding.regimePct}%).
              </span>
            </>
          ) : binding.source === 'ladder' ? (
            <span className="block">Drawdown ladder target: reduce gross to {binding.targetPct}%</span>
          ) : (
            <span className="block">Regime rule (double-RED): reduce gross to {binding.targetPct}%</span>
          )}
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

export function ViolationsSummary({ showSyncButton = false, settingsTo, bindingGross, drawdown }: {
  showSyncButton?: boolean;
  settingsTo?: string;
  /** The reconciled ladder-vs-regime gross target from the parent's useBindingGrossTarget
   * (so this card and the sibling RegimeLight show the identical binding number). When
   * omitted, falls back to a ladder-only reconciliation from this card's own data. */
  bindingGross?: BindingGrossTarget | null;
  /** Live NLV for the drawdown READ (Item 2), from the parent's useLiveNlv — so the card %
   * and the ladder→gross binding target read the same live value. Omitted (admin, no live
   * quotes) → the drawdown reads off the synced `ibkr_nlv` (the settled fallback). */
  drawdown?: { nlv: number | null; asOf: string | null; isLive: boolean };
}) {
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
  // Drawdown is measured NET OF CASH FLOWS off the live NLV against its cash-flow-
  // adjusted peak (migration 071) — NOT (equity − equity_peak)/equity_peak off the
  // manual placeholder, which lit up a phantom −60% (peak stuck at $100k, NLV ~$40k).
  // Null (→ ladder silent) until a real NLV + peak exist; a ~$60k historical
  // withdrawal no longer reads as a loss.
  // Drawdown reads off the LIVE NLV when the parent supplies one (Item 2, web), else the
  // synced ibkr_nlv (admin / no live quotes). The peak + the % denominator stay synced.
  const ddNlv = drawdown ? drawdown.nlv : config.ibkr_nlv;
  const ddAsOf = drawdown ? drawdown.asOf : config.ibkr_nlv_at;
  const ddIsLive = drawdown?.isLive ?? false;
  const drawdownPct = cashflowAdjustedDrawdownPct(
    ddNlv, config.equity_peak, config.cumulative_cashflow, config.equity_peak_cashflow,
  );
  // Always-on drawdown read for the card below (Item 1): null → silent (no NLV+peak yet).
  // The NEAR band is the user's setting (migration 072), defaulting to the shared constant
  // when the column isn't present yet (migration applied separately from the deploy).
  const nearBand = config.drawdown_near_band_pp ?? DRAWDOWN_NEAR_BAND_PP;
  const ladderStatus = drawdownPct === null ? null : drawdownLadderStatus(config.ladder, drawdownPct, nearBand);

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
      {/* Drawdown first — it drives the gross-exposure target the next card renders. */}
      {ladderStatus && (
        <DrawdownCard status={ladderStatus} nlv={ddNlv} asOf={ddAsOf} isLive={ddIsLive} />
      )}
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
          binding={bindingGross !== undefined ? bindingGross : bindingGrossTarget(result.ladderTargetGrossPct, null)}
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
