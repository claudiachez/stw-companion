import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserPositions, useIbkrSettings } from './useUserPositions';
import { useSyncPortfolio } from './useSyncPortfolio';
import { useHoldings } from '../picks/useHoldings';
import { ConvictionBadge } from '../picks/components/ConvictionBadge';
import { LoadingSpinner } from '../../primitives/LoadingSpinner';
import type { UserPosition } from './api';
import { cleanUnderlying } from './api';

function fmtMoney(n: number | null): string {
  if (n === null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function fmtPct(n: number | null): string {
  if (n === null) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function fmtExpiry(exp: string | null): string {
  if (!exp) return '';
  // YYYYMMDD → "Jan '25"
  const y = exp.slice(0, 4), m = exp.slice(4, 6), d = exp.slice(6, 8);
  const date = new Date(`${y}-${m}-${d}T12:00:00`);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

function fmtSynced(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function pnlColor(pnl: number | null): string {
  if (pnl === null) return 'var(--t2)';
  return pnl >= 0 ? '#16A34A' : '#DC2626';
}

// ── sub-components ────────────────────────────────────────────

interface LegRowProps {
  pos: UserPosition;
  showPnl: boolean;
}

function LegRow({ pos, showPnl }: LegRowProps) {
  const isOpt = pos.asset_class === 'OPT';
  const qty = pos.quantity ?? 0;
  const label = isOpt
    ? `${Math.abs(qty)}× $${pos.strike}${pos.put_call} ${fmtExpiry(pos.expiry)}`
    : `${Math.abs(qty).toLocaleString()} share${Math.abs(qty) !== 1 ? 's' : ''} @ ${pos.avg_cost != null ? `$${pos.avg_cost.toFixed(2)}` : '—'}`;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '7px 14px 7px 36px',
      borderBottom: '1px solid var(--bsub)',
      background: 'var(--bg)',
    }}>
      {/* Left: badge + label — shrinks so right side always has room */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
        <span style={{
          fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 4,
          color: isOpt ? 'var(--c4)' : 'var(--t2)',
          background: isOpt ? 'var(--c4bg)' : 'var(--s2)',
          border: isOpt ? '1px solid var(--c4b)' : '1px solid var(--border)',
          flexShrink: 0,
        }}>
          {isOpt ? `${qty < 0 ? 'SHORT ' : ''}${pos.put_call === 'C' ? 'CALL' : 'PUT'}` : 'STOCK'}
        </span>
        <span style={{
          fontSize: 12, color: 'var(--t2)', fontVariantNumeric: 'tabular-nums',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {label}
        </span>
      </div>

      {/* Right: P&L — never shrinks */}
      {showPnl && (
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {pos.unrealized_pnl_pct !== null && (
            <div style={{ fontSize: 12, fontWeight: 600, color: pnlColor(pos.unrealized_pnl_pct), fontVariantNumeric: 'tabular-nums' }}>
              {fmtPct(pos.unrealized_pnl_pct)}
            </div>
          )}
          {pos.unrealized_pnl !== null && (
            <div style={{ fontSize: 10, color: 'var(--t3)', fontVariantNumeric: 'tabular-nums' }}>
              {fmtMoney(pos.unrealized_pnl)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface GroupRowProps {
  underlying: string;
  positions: UserPosition[];
  stwConviction: number | null;
  isExpanded: boolean;
  onToggle: () => void;
  showPnl: boolean;
}

function GroupRow({ underlying, positions, stwConviction, isExpanded, onToggle, showPnl }: GroupRowProps) {
  const netPnl = positions.reduce((sum, p) => sum + (p.unrealized_pnl ?? 0), 0);
  // Mark value = sum of markPrice * |qty| * multiplier
  const totalMark = positions.reduce((sum, p) => sum + (p.mark_price ?? 0) * Math.abs(p.quantity ?? 0) * p.multiplier, 0);

  return (
    <>
      <button
        onClick={onToggle}
        style={{
          width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center',
          gap: 8, padding: '10px 14px',
          borderBottom: '1px solid var(--bsub)',
          background: isExpanded ? 'var(--c5bg)' : 'var(--surface)',
          cursor: 'pointer', border: 'none',
          borderTop: '1px solid var(--border)',
        }}
        onMouseEnter={(e) => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = 'var(--s2)'; }}
        onMouseLeave={(e) => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = 'var(--surface)'; }}
      >
        {/* Expand arrow */}
        <span style={{
          fontSize: 10, color: 'var(--t3)', flexShrink: 0,
          transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: 'transform 0.15s',
          display: 'inline-block',
        }}>▶</span>

        {/* Left group: ticker + badges — shrinks so P&L always fits */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', flexShrink: 0 }}>
            {underlying}
          </span>
          {stwConviction !== null && (
            <ConvictionBadge level={stwConviction} />
          )}
          <span style={{ fontSize: 10, color: 'var(--t3)', whiteSpace: 'nowrap' }}>
            {positions.length === 1 ? '1 position' : `${positions.length} legs`}
          </span>
        </div>

        {/* Right: net P&L — never shrinks */}
        {showPnl && (
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: pnlColor(netPnl), fontVariantNumeric: 'tabular-nums' }}>
              {fmtMoney(netPnl)}
            </div>
            {totalMark > 0 && (
              <div style={{ fontSize: 10, color: 'var(--t3)', fontVariantNumeric: 'tabular-nums' }}>
                {fmtMoney(totalMark)} mkt
              </div>
            )}
          </div>
        )}
      </button>

      {isExpanded && positions.map((p) => <LegRow key={p.id} pos={p} showPnl={showPnl} />)}
    </>
  );
}

// ── main page ─────────────────────────────────────────────────

export function PortfolioPage() {
  const navigate = useNavigate();
  const { data: positions = [], isLoading: posLoading } = useUserPositions();
  const { data: settings } = useIbkrSettings();
  const { data: stwHoldings = [] } = useHoldings();
  const { sync, isSyncing, syncError, lastResult } = useSyncPortfolio();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showPnl, setShowPnl] = useState(true);

  const isConnected = !!(settings?.ibkr_flex_token && settings?.ibkr_query_id);

  // Map STW ticker → conviction for badge lookup
  const stwMap = useMemo(
    () => new Map(stwHoldings.map((h) => [h.ticker, h.conviction])),
    [stwHoldings],
  );

  // Group positions by underlying, normalising any OCC symbols still in the DB
  const groups = useMemo(() => {
    const map = new Map<string, UserPosition[]>();
    for (const p of positions) {
      const key = cleanUnderlying(p.underlying);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [positions]);

  // Last synced timestamp: most recent across all positions
  const lastSynced = useMemo(() => {
    if (lastResult) return lastResult.lastSyncedAt;
    if (positions.length === 0) return null;
    return positions.reduce((max, p) =>
      p.last_synced_at > max ? p.last_synced_at : max, positions[0].last_synced_at);
  }, [positions, lastResult]);

  function toggleGroup(underlying: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(underlying)) next.delete(underlying);
      else next.add(underlying);
      return next;
    });
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 0 40px' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px',
        borderBottom: '1px solid var(--bsub)',
      }}>
        <div style={{ fontSize: 11, color: 'var(--t3)' }}>
          {lastSynced ? `Last synced ${fmtSynced(lastSynced)}` : 'Not synced yet'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setShowPnl((v) => !v)}
            title={showPnl ? 'Hide P&L' : 'Show P&L'}
            style={{
              padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
              background: 'none', border: '1px solid var(--border)',
              color: showPnl ? 'var(--t2)' : 'var(--t3)',
              cursor: 'pointer',
            }}
          >
            {showPnl ? 'Hide P&L' : 'P&L'}
          </button>
        <button
          onClick={sync}
          disabled={isSyncing || !isConnected}
          style={{
            padding: '7px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600,
            background: isConnected ? 'var(--acc)' : 'var(--s2)',
            color: isConnected ? '#fff' : 'var(--t3)',
            border: 'none', cursor: isConnected ? 'pointer' : 'default',
            opacity: isSyncing ? 0.6 : 1,
            transition: 'opacity 0.15s',
          }}
        >
          {isSyncing ? 'Syncing…' : 'Sync'}
        </button>
        </div>
      </div>

      {syncError && (
        <div style={{
          margin: '0 16px 12px', padding: '10px 14px', borderRadius: 6,
          background: '#2d0c0c', border: '1px solid var(--c1b)',
          color: 'var(--c1)', fontSize: 12,
        }}>
          {syncError}
        </div>
      )}

      {/* Not connected */}
      {!isConnected && (
        <div style={{
          margin: 16, padding: '24px', borderRadius: 8,
          background: 'var(--surface)', border: '1px solid var(--border)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 14, color: 'var(--t2)', marginBottom: 12 }}>
            Connect your IBKR account to see your positions here.
          </div>
          <button
            onClick={() => navigate('/settings')}
            style={{
              padding: '8px 18px', borderRadius: 6, fontSize: 12, fontWeight: 600,
              background: 'var(--acc)', color: '#fff', border: 'none', cursor: 'pointer',
            }}
          >
            Go to Settings →
          </button>
        </div>
      )}

      {/* Loading */}
      {isConnected && posLoading && <LoadingSpinner className="mt-16" />}

      {/* No positions yet */}
      {isConnected && !posLoading && positions.length === 0 && (
        <div style={{
          margin: 16, padding: '24px', borderRadius: 8,
          background: 'var(--surface)', border: '1px solid var(--border)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 14, color: 'var(--t2)', marginBottom: 6 }}>
            No positions loaded yet.
          </div>
          <div style={{ fontSize: 12, color: 'var(--t3)' }}>
            Click Sync to fetch your current IBKR positions.
          </div>
        </div>
      )}

      {/* Accordion */}
      {groups.length > 0 && (
        <div style={{
          margin: 16, borderRadius: 8, overflow: 'hidden',
          border: '1px solid var(--border)',
        }}>
          {groups.map(([underlying, legs]) => (
            <GroupRow
              key={underlying}
              underlying={underlying}
              positions={legs}
              stwConviction={stwMap.has(underlying) ? (stwMap.get(underlying) ?? null) : null}
              isExpanded={expanded.has(underlying)}
              onToggle={() => toggleGroup(underlying)}
              showPnl={showPnl}
            />
          ))}
        </div>
      )}
    </div>
    </div>
  );
}
