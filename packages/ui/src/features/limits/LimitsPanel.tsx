import { useState } from 'react';
import { evaluateRiskConfig, fmtDateTime, type PositionInput, type ConcentrationViolation } from '@stw/shared';
import { useAuthStore } from '../../store/auth';
import { useIsMobile } from '../../hooks/useIsMobile';
import { LoadingSpinner } from '../../primitives/LoadingSpinner';
import { StatusPill } from '../../primitives/StatusPill';
import { useUserPositions } from '../portfolio/useUserPositions';
import { useSyncPortfolio } from '../portfolio/useSyncPortfolio';
import { useRiskConfig, useSectorMap, useViolationAcks, useAcknowledgeViolation, useEnsureRiskConfig } from './useRiskConfig';
import { RiskConfigForm } from './RiskConfigForm';
import type { ViolationType, AckStatus } from './api';

// Shared limits engine panel — plans/integrity-guardrails.md Item 2, extended to
// per-user editable thresholds (host decision, 2026-07-06). Used by BOTH the
// admin app (the operator's own book) and the subscriber web app (each
// subscriber's own book, Premium-gated) — same component, same data shape,
// each reads/writes only the signed-in user's own risk_config/user_positions
// rows via RLS. Flags only — nothing here places or blocks an order.

function severityColor(severity: 'ok' | 'breach'): string {
  return severity === 'breach' ? 'var(--status-negative-text)' : 'var(--acc)';
}

function ViolationRow({
  v, ack, onAcknowledge,
}: {
  v: ConcentrationViolation;
  ack: { status: AckStatus; glide_path_note: string | null } | undefined;
  onAcknowledge: (status: AckStatus, note?: string) => void;
}) {
  const [note, setNote] = useState(ack?.glide_path_note ?? '');
  const status = ack?.status ?? 'new';
  return (
    <div className="flex flex-col gap-2 py-3 border-b border-bsub last:border-0">
      <div className="flex items-center justify-between gap-3">
        <span className="text-text text-sm font-medium">{v.scope}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono" style={{ color: severityColor(v.severity) }}>
            {v.exposurePct.toFixed(1)}% / {v.limitPct}%
          </span>
          <StatusPill variant={v.severity === 'breach' ? 'breach' : 'neutral'}>
            {v.severity === 'breach' ? 'Breach' : 'OK'}
          </StatusPill>
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

export function LimitsPanel() {
  const userId = useAuthStore((s) => s.user?.id);
  const isMobile = useIsMobile();

  const { data: positions, isLoading: positionsLoading } = useUserPositions();
  const { data: config, isLoading: configLoading } = useRiskConfig(userId);
  const { data: sectorMap } = useSectorMap();
  const { data: acks } = useViolationAcks(userId);
  const acknowledge = useAcknowledgeViolation(userId);
  const { sync, isSyncing, syncError, lastResult } = useSyncPortfolio();

  useEnsureRiskConfig(userId, config, configLoading);

  if (positionsLoading || configLoading || !config) return <LoadingSpinner className="mt-16" />;

  const positionInputs: PositionInput[] = (positions ?? []).map((p) => ({
    underlying: p.underlying,
    quantity: p.quantity,
    markPrice: p.mark_price,
    multiplier: p.multiplier,
  }));

  // Real account equity from RiskConfigForm (migration 059) — always set (DB defaults
  // new rows to a $100,000 placeholder, flagged via config.is_placeholder below) rather
  // than derived from the SAME positions being evaluated, which made gross exposure
  // tautologically ~100% (numerator == denominator) before this fix.
  const accountEquity = config.account_equity;
  const drawdownPct = config.equity_peak
    ? ((config.account_equity - config.equity_peak) / config.equity_peak) * 100
    : null;

  const result = evaluateRiskConfig(positionInputs, sectorMap ?? {}, accountEquity, {
    maxPositionPct: config.max_position_pct,
    maxSectorPct: config.max_sector_pct,
    maxGrossPct: config.max_gross_pct,
    ladder: config.ladder,
  }, drawdownPct);

  const staleness = positions?.length
    ? fmtDateTime(positions.reduce((latest, p) => (p.last_synced_at > latest ? p.last_synced_at : latest), positions[0].last_synced_at))
    : null;

  function ackFor(scope: string, type: ViolationType) {
    return acks?.find((a) => a.scope === scope && a.violation_type === type);
  }

  return (
    <div className={`${isMobile ? '' : 'max-w-2xl mx-auto'} flex flex-col gap-4`}>
      <div className="bg-surface border border-border rounded-xl p-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="text-text font-semibold text-sm mb-1">Limits engine — flags only</div>
            <div className="text-t3 text-xs max-w-md">
              Evaluates YOUR OWN IBKR book (synced via Flex Query) against your thresholds below.
              Nothing here blocks an order — breaches are flagged for you to act on.
            </div>
          </div>
          <button
            onClick={sync}
            disabled={isSyncing}
            className="shrink-0 px-3 py-1.5 rounded text-xs font-semibold bg-acc text-white disabled:opacity-40"
          >
            {isSyncing ? 'Syncing…' : 'Sync & Evaluate'}
          </button>
        </div>
        <div className="text-t3 text-xs mt-3">
          {staleness ? `Last synced: ${staleness}` : 'No positions synced yet.'}
          {lastResult && ` · Synced ${lastResult.count} position${lastResult.count !== 1 ? 's' : ''}`}
        </div>
        {syncError && (
          <div className="mt-2 text-xs font-medium text-[var(--status-negative-text)] bg-[var(--status-negative-bg)] border border-[var(--status-negative-border)] rounded px-3 py-2">
            Sync failed: {syncError} — evaluating against last-synced data below.
          </div>
        )}
      </div>

      <RiskConfigForm userId={userId!} config={config} />

      <div className="bg-surface border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-text font-semibold text-sm">Gross exposure</span>
          <span className="text-xs font-mono" style={{ color: severityColor(result.grossViolation.severity) }}>
            {result.grossViolation.exposurePct.toFixed(1)}% / {result.grossViolation.limitPct}%
          </span>
        </div>
        {config.is_placeholder && (
          <div className="text-t3 text-xs mb-2">
            Using a default $100,000 account equity — set your real figure above for an accurate
            reading.
          </div>
        )}
        {result.ladderTargetGrossPct !== null && (
          <div className="text-xs text-[var(--status-warning-text)] bg-[var(--status-warning-bg)] border border-[var(--status-warning-border)] rounded px-3 py-2">
            Drawdown ladder target: reduce gross to {result.ladderTargetGrossPct}%
          </div>
        )}
      </div>

      <div className="bg-surface border border-border rounded-xl p-5">
        <div className="text-text font-semibold text-sm mb-2">Position concentration</div>
        {result.positionViolations.length === 0 && <div className="text-t3 text-xs">No positions.</div>}
        {result.positionViolations.map((v) => (
          <ViolationRow
            key={v.scope}
            v={v}
            ack={ackFor(v.scope, 'position')}
            onAcknowledge={(status, note) => acknowledge.mutate({ scope: v.scope, violationType: 'position', status, glidePathNote: note })}
          />
        ))}
      </div>

      <div className="bg-surface border border-border rounded-xl p-5">
        <div className="text-text font-semibold text-sm mb-2">Sector concentration</div>
        {result.sectorViolations.length === 0 && <div className="text-t3 text-xs">No positions.</div>}
        {result.sectorViolations.map((v) => (
          <ViolationRow
            key={v.scope}
            v={v}
            ack={ackFor(v.scope, 'sector')}
            onAcknowledge={(status, note) => acknowledge.mutate({ scope: v.scope, violationType: 'sector', status, glidePathNote: note })}
          />
        ))}
      </div>
    </div>
  );
}
