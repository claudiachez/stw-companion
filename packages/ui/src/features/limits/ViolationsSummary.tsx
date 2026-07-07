import { useState } from 'react';
import { evaluateRiskConfig, fmtDateTime, type PositionInput, type ConcentrationViolation } from '@stw/shared';
import { useAuthStore } from '../../store/auth';
import { LoadingSpinner } from '../../primitives/LoadingSpinner';
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

function severityColor(severity: 'ok' | 'breach'): string {
  return severity === 'breach' ? '#ef4444' : 'var(--acc)';
}

function ViolationRow({
  v, ack, onAcknowledge, note: noteBadge,
}: {
  v: ConcentrationViolation;
  ack: { status: AckStatus; glide_path_note: string | null } | undefined;
  onAcknowledge: (status: AckStatus, note?: string) => void;
  note?: string;
}) {
  const [note, setNote] = useState(ack?.glide_path_note ?? '');
  const status = ack?.status ?? 'new';
  return (
    <div className="flex flex-col gap-2 py-3 border-b border-bsub last:border-0">
      <div className="flex items-center justify-between gap-3">
        <span className="text-text text-sm font-medium">
          {v.scope}
          {noteBadge && <span className="text-t3 text-xs font-normal ml-1.5">{noteBadge}</span>}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono" style={{ color: severityColor(v.severity) }}>
            {v.exposurePct.toFixed(1)}% / {v.limitPct}%
          </span>
          <span
            className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded"
            style={{
              color: v.severity === 'breach' ? '#ef4444' : 'var(--t3)',
              background: v.severity === 'breach' ? '#ef444415' : 'var(--s2)',
              border: `1px solid ${v.severity === 'breach' ? '#ef444433' : 'var(--border)'}`,
            }}
          >
            {v.severity === 'breach' ? 'Breach' : 'OK'}
          </span>
        </div>
      </div>
      {v.severity === 'breach' && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] text-t3 uppercase tracking-wide">Status: {status}</span>
          {status === 'new' && (
            <button
              onClick={() => onAcknowledge('acknowledged')}
              className="text-xs px-2 py-1 rounded bg-s2 border border-border text-text"
            >
              Acknowledge
            </button>
          )}
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Glide path — e.g. no adds; reduce to 10% by 2026-08-01"
            className="flex-1 min-w-[220px] bg-s2 border border-border rounded px-2 py-1 text-xs text-text"
          />
          <button
            onClick={() => onAcknowledge('glide_path', note)}
            disabled={!note.trim()}
            className="text-xs px-2 py-1 rounded bg-acc text-white disabled:opacity-40"
          >
            Set glide path
          </button>
        </div>
      )}
    </div>
  );
}

function GrossExposureBar({ pct, limitPct, ladderTargetPct }: { pct: number; limitPct: number; ladderTargetPct: number | null }) {
  const scaleMax = Math.max(limitPct, pct, 100) * 1.05;
  const fillPct = Math.min(100, (pct / scaleMax) * 100);
  const limitMarkerPct = Math.min(100, (limitPct / scaleMax) * 100);
  const breach = pct > limitPct;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-text font-semibold">Gross exposure</span>
        <span className="font-mono" style={{ color: severityColor(breach ? 'breach' : 'ok') }}>
          {pct.toFixed(1)}% / {limitPct}%
        </span>
      </div>
      <div className="relative h-2.5 rounded-full bg-s2 border border-border overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${fillPct}%`, background: breach ? '#ef4444' : 'var(--acc)' }}
        />
        <div
          className="absolute top-0 bottom-0 w-px bg-t3"
          style={{ left: `${limitMarkerPct}%` }}
          title={`Limit: ${limitPct}%`}
        />
      </div>
      {ladderTargetPct !== null && (
        <div className="text-xs text-[#f59e0b] bg-[#f59e0b15] border border-[#f59e0b33] rounded px-3 py-2 mt-1">
          Drawdown ladder target: reduce gross to {ladderTargetPct}%
        </div>
      )}
    </div>
  );
}

function BreachOnlyList({
  title, violations, ackFor, onAcknowledge, unmappedNote,
}: {
  title: string;
  violations: ConcentrationViolation[];
  ackFor: (scope: string, type: ViolationType) => { status: AckStatus; glide_path_note: string | null } | undefined;
  onAcknowledge: (scope: string, status: AckStatus, note?: string) => void;
  unmappedNote?: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const type: ViolationType = title === 'Position concentration' ? 'position' : 'sector';
  const breaches = violations.filter((v) => v.severity === 'breach');
  // "Unmapped" is always surfaced even when not breaching — it represents
  // sector data that doesn't exist yet, not a clean bill of health.
  const unmapped = violations.find((v) => v.scope === 'Unmapped' && v.severity !== 'breach');
  const alwaysShown = unmapped ? [unmapped] : [];
  const shown = showAll ? violations : [...breaches, ...alwaysShown.filter((v) => !breaches.includes(v))];
  const hiddenCount = violations.length - shown.length;

  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <div className="text-text font-semibold text-sm mb-2">{title}</div>
      {violations.length === 0 && <div className="text-t3 text-xs">No positions.</div>}
      {violations.length > 0 && shown.length === 0 && (
        <div className="text-t3 text-xs">No breaches — all {violations.length} within limit.</div>
      )}
      {shown.map((v) => (
        <ViolationRow
          key={v.scope}
          v={v}
          ack={ackFor(v.scope, type)}
          onAcknowledge={(status, note) => onAcknowledge(v.scope, status, note)}
          note={v.scope === 'Unmapped' ? unmappedNote : undefined}
        />
      ))}
      {hiddenCount > 0 && (
        <button onClick={() => setShowAll(true)} className="text-xs text-t3 hover:text-t2 mt-2">
          {hiddenCount} more within limit — show all
        </button>
      )}
      {showAll && breaches.length < violations.length && (
        <button onClick={() => setShowAll(false)} className="text-xs text-t3 hover:text-t2 mt-2">
          Show breaches only
        </button>
      )}
    </div>
  );
}

export function ViolationsSummary({ showSyncButton = false }: { showSyncButton?: boolean }) {
  const userId = useAuthStore((s) => s.user?.id);
  const [expanded, setExpanded] = useState(false);

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
  }));

  const accountEquity = positionInputs.reduce((sum, p) => sum + Math.abs((p.quantity ?? 0) * (p.markPrice ?? 0) * (p.multiplier ?? 1)), 0);

  const result = evaluateRiskConfig(positionInputs, sectorMap ?? {}, accountEquity, {
    maxPositionPct: config.max_position_pct,
    maxSectorPct: config.max_sector_pct,
    maxGrossPct: config.max_gross_pct,
    ladder: config.ladder,
  }, null);

  const staleness = positions?.length
    ? fmtDateTime(positions.reduce((latest, p) => (p.last_synced_at > latest ? p.last_synced_at : latest), positions[0].last_synced_at))
    : null;

  function ackFor(scope: string, type: ViolationType) {
    return acks?.find((a) => a.scope === scope && a.violation_type === type);
  }

  const positionBreaches = result.positionViolations.filter((v) => v.severity === 'breach').length;
  const sectorBreaches = result.sectorViolations.filter((v) => v.severity === 'breach').length;
  const totalBreaches = positionBreaches + sectorBreaches + (result.grossViolation.severity === 'breach' ? 1 : 0);
  const summaryLine = `Gross ${result.grossViolation.exposurePct.toFixed(0)}% of ${result.grossViolation.limitPct}%` +
    (totalBreaches === 0 ? ' · no breaches' : ` · ${totalBreaches} breach${totalBreaches === 1 ? '' : 'es'}`);

  const sectorDataMissing = !sectorMap || Object.keys(sectorMap).length === 0;

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3 p-4 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-t3 text-xs shrink-0" style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▶</span>
          <span className="text-text font-semibold text-sm shrink-0">Risk limits</span>
          <span className="text-t3 text-xs truncate" style={{ color: totalBreaches > 0 ? '#ef4444' : 'var(--t3)' }}>{summaryLine}</span>
        </div>
        {showSyncButton && (
          <span
            onClick={(e) => { e.stopPropagation(); sync(); }}
            className="shrink-0 px-3 py-1.5 rounded text-xs font-semibold bg-acc text-white cursor-pointer"
            style={{ opacity: isSyncing ? 0.6 : 1 }}
          >
            {isSyncing ? 'Syncing…' : 'Sync & Evaluate'}
          </span>
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 flex flex-col gap-4 border-t border-bsub pt-4">
          <div className="text-t3 text-xs -mt-2">
            Evaluates YOUR OWN IBKR book (synced via Flex Query) against your thresholds — set in
            Settings. Nothing here blocks an order; breaches are flagged for you to act on.
            {staleness && <> Last synced: {staleness}.</>}
            {lastResult && ` Synced ${lastResult.count} position${lastResult.count !== 1 ? 's' : ''}.`}
          </div>
          {syncError && (
            <div className="text-xs font-medium text-[#ef4444] bg-[#ef444415] border border-[#ef444433] rounded px-3 py-2">
              Sync failed: {syncError} — evaluating against last-synced data below.
            </div>
          )}

          <div className="bg-surface border border-border rounded-xl p-5">
            <GrossExposureBar
              pct={result.grossViolation.exposurePct}
              limitPct={result.grossViolation.limitPct}
              ladderTargetPct={result.ladderTargetGrossPct}
            />
          </div>

          <BreachOnlyList
            title="Position concentration"
            violations={result.positionViolations}
            ackFor={ackFor}
            onAcknowledge={(scope, status, note) => acknowledge.mutate({ scope, violationType: 'position', status, glidePathNote: note })}
          />

          <BreachOnlyList
            title="Sector concentration"
            violations={result.sectorViolations}
            ackFor={ackFor}
            onAcknowledge={(scope, status, note) => acknowledge.mutate({ scope, violationType: 'sector', status, glidePathNote: note })}
            unmappedNote={sectorDataMissing ? '(no sector data yet)' : undefined}
          />
        </div>
      )}
    </div>
  );
}
