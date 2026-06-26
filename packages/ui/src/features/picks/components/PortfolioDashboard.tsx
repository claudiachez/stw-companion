import { bColor, holdingPnlPct, legIsOpen, legMarkReason, fmtLegInstrument, fmtDateTime, TIERS } from '@stw/shared';
import { usePriceCacheStore } from '../../../store/priceCache';
import { useRecentChanges } from '../useRecentChanges';
import { useLatestRun } from '../useLatestRun';
import { useConvictionChanges, type ConvictionChange, type ChangeDir } from '../useConvictionChanges';
import { TickerLink } from '../../../primitives/TickerLink';
import { SourceLink } from './SourceLink';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { useCapabilities } from '../../../context/AppCapabilities';
import type { Holding } from '../api';

interface DashboardProps {
  holdings: Holding[];
  onSelectTicker?: (ticker: string) => void;
}

// Section header: an uppercase label with an optional right-aligned "Updated:" stamp. Used by
// every Overview block so the title (and its date, when present) live OUTSIDE the card and read
// consistently — same structure for the webinar, changes, unpriced, and stale blocks.
function SectionHeader({ title, color = 'var(--t3)', updatedAt }: { title: React.ReactNode; color?: string; updatedAt?: Date | null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color }}>
        {title}
      </div>
      {updatedAt && (
        <div style={{ fontSize: 11, color: 'var(--t3)', whiteSpace: 'nowrap', flexShrink: 0 }}>
          Updated: <span style={{ color: 'var(--t2)' }}>{fmtDateTime(updatedAt)}</span>
        </div>
      )}
    </div>
  );
}

// Render a digest string with any known ticker rendered as a clickable link.
function renderDigest(
  text: string,
  tickers: Set<string>,
  onSelectTicker?: (ticker: string) => void,
) {
  // Split keeping whitespace so spacing/newlines are preserved.
  return text.split(/(\s+)/).map((token, i) => {
    const bare = token.replace(/[^A-Za-z0-9.]/g, '');
    if (bare && tickers.has(bare.toUpperCase()) && onSelectTicker) {
      const lead = token.slice(0, token.indexOf(bare));
      const trail = token.slice(token.indexOf(bare) + bare.length);
      return (
        <span key={i}>
          {lead}
          <TickerLink ticker={bare.toUpperCase()} label={bare} onSelect={onSelectTicker} />
          {trail}
        </span>
      );
    }
    return <span key={i}>{token}</span>;
  });
}

function trimSnippet(s: string, n = 180): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

// Per-direction presentation: a directional glyph (the change indicator) + a color-coded badge.
const CHANGE_META: Record<ChangeDir, { label: string; color: string; bg: string; arrow: string }> = {
  up:   { label: 'Upgraded',   color: 'var(--c5)', bg: 'var(--c5bg)', arrow: '▲' },
  down: { label: 'Downgraded', color: 'var(--c1)', bg: 'var(--c1bg)', arrow: '▼' },
  new:  { label: 'New',        color: 'var(--c4)', bg: 'var(--c4bg)', arrow: '★' },
  same: { label: 'Reaffirmed', color: 'var(--t3)', bg: 'var(--s2)',  arrow: '•' },
};

// One conviction-change line, styled to match the "Latest Portfolio Changes" digest (13px body,
// linkified ticker, lineHeight 1.6 from the card). Reads:
//   TICKER ↗ [BADGE] Prev → Current: why
function ConvictionChangeRow({ c, onSelectTicker }: {
  c: ConvictionChange;
  onSelectTicker?: (t: string) => void;
}) {
  const m = CHANGE_META[c.dir];
  const toTier = TIERS[c.level] ?? TIERS[0];
  const fromTier = c.prevLevel != null ? (TIERS[c.prevLevel] ?? TIERS[0]) : null;
  return (
    <div style={{ marginBottom: 5 }}>
      <TickerLink ticker={c.ticker} onSelect={onSelectTicker} />
      {' '}
      <span style={{ color: m.color, fontWeight: 700 }}>{m.arrow}</span>
      {' '}
      <span style={{
        display: 'inline-block', verticalAlign: 'middle',
        fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
        color: m.color, background: m.bg, border: `1px solid ${m.color}33`,
        borderRadius: 4, padding: '1px 5px',
      }}>{m.label}</span>
      {' '}
      <span style={{ fontWeight: 600 }}>
        {fromTier && (
          <>
            <span style={{ color: fromTier.color }}>{fromTier.short}</span>
            <span style={{ color: 'var(--t3)' }}> → </span>
          </>
        )}
        <span style={{ color: toTier.color }}>{toTier.short}</span>
      </span>
      <span style={{ color: 'var(--t3)' }}>: </span>
      {trimSnippet(c.comment)}
      {c.sourceUrl && (
        <SourceLink url={c.sourceUrl} title="Open original message" style={{ verticalAlign: 'middle', marginLeft: 4 }} />
      )}
    </div>
  );
}

// ── Portfolio dashboard (shown when no ticker selected) ───────
export function PortfolioDashboard({ holdings, onSelectTicker }: DashboardProps) {
  const isMobile = useIsMobile();
  // Only the admin can act on a stale price (re-run the IBKR sync); subscribers can't, so
  // the "Re-run the sync." instruction is admin-only — the explanation still shows to everyone.
  const { canEdit } = useCapabilities();
  const cache = usePriceCacheStore((s) => s.cache);
  const { data: changes } = useRecentChanges(1);
  const latestChange = changes?.[0] ?? null;
  const convBatch = useConvictionChanges(holdings);
  const { data: lastRun } = useLatestRun();

  const active = holdings.filter((h) => h.ticker !== 'CASH' && h.last_action !== 'Closed');

  // Avg P&L across positions with a resolvable return — each holding's weight-weighted P&L
  // across its legs (shares ride the live quote, options their stored IBKR mark).
  const pnlValues = active
    .map((h) => holdingPnlPct(h.legs, cache[h.ticker]?.c ?? null))
    .filter((v): v is number => v != null);
  const avgPnl = pnlValues.length > 0
    ? pnlValues.reduce((s, v) => s + v, 0) / pnlValues.length
    : null;

  // Equity : Options ratio by current MARKET VALUE, per leg. The host quotes the split by what
  // each sleeve is worth now (not premium paid) — so winning option legs weigh more. Shares ride
  // the live quote; option legs use their stored IBKR mark; each leg's cost weight is grossed up
  // by mark÷entry. Per-leg (not whole-holding), so a shares+call overlay counts on BOTH sides —
  // the old whole-holding classification dumped every mixed position into equity (read ~97:3).
  // Falls back to the leg's cost weight when a price is missing.
  let equityVal = 0;
  let optionsVal = 0;
  active.forEach((h) => {
    const live = cache[h.ticker]?.c ?? null;
    for (const leg of h.legs) {
      if (!legIsOpen(leg)) continue;
      const w = leg.weight ?? 0;
      if (w <= 0) continue;
      const isOpt = leg.instrument_type === 'OPTION';
      const ref = isOpt ? leg.mark_price : live;
      const mult = (ref != null && leg.entry_price && leg.entry_price > 0) ? ref / leg.entry_price : 1;
      const val = w * mult;
      if (isOpt) optionsVal += val; else equityVal += val;
    }
  });
  const typeTotal = equityVal + optionsVal;
  const equityPct  = typeTotal > 0 ? Math.round(equityVal  / typeTotal * 100) : null;
  const optionsPct = typeTotal > 0 ? Math.round(optionsVal / typeTotal * 100) : null;

  // Sector distribution by weight
  const sectorMap: Record<string, number> = {};
  active.forEach((h) => {
    const w = h.current_weight ?? h.initial_weight ?? 0;
    sectorMap[h.basket] = (sectorMap[h.basket] ?? 0) + w;
  });
  const totalWeight = Object.values(sectorMap).reduce((s, v) => s + v, 0);
  const sectors = Object.entries(sectorMap).sort((a, b) => b[1] - a[1]);

  // Options data freshness = newest IBKR leg mark across all holdings.
  const optionsSynced = holdings.reduce<Date | null>((acc, h) => {
    for (const leg of h.legs) {
      if (!leg.mark_price_at) continue;
      const d = new Date(leg.mark_price_at);
      if (!acc || d > acc) acc = d;
    }
    return acc;
  }, null);

  // Portfolio-wide unpriced option legs: open OPTION legs with no IBKR mark yet.
  const unpricedLegs = holdings.flatMap((h) => {
    if (h.ticker === 'CASH' || h.last_action === 'Closed') return [];
    return h.legs
      .filter((l) => l.instrument_type === 'OPTION' && l.status === 'OPEN' && l.mark_price == null)
      .map((l) => ({ ticker: h.ticker, label: fmtLegInstrument(l), reason: legMarkReason(l) }));
  });

  // Stale prices: an option leg marked in a PRIOR sync but not the latest one shows an old
  // price. mark_price_at is per-leg and stamped on a successful sync, so any priced leg older
  // than the newest mark is stale.
  const stalePrices = holdings.flatMap((h) => {
    if (h.ticker === 'CASH' || h.last_action === 'Closed' || !optionsSynced) return [];
    const stale = h.legs.filter(
      (l) => l.instrument_type === 'OPTION' && l.mark_price != null && l.mark_price_at != null &&
        new Date(l.mark_price_at).getTime() < optionsSynced.getTime(),
    );
    if (!stale.length) return [];
    const at = new Date(stale[0].mark_price_at!);
    const legs = stale.map((l) => fmtLegInstrument(l)).join(', ');
    return [{ ticker: h.ticker, label: `priced ${fmtDateTime(at)}: ${legs}` }];
  });

  const pnlColor = avgPnl != null ? (avgPnl >= 0 ? '#22c55e' : '#ef4444') : 'var(--t3)';

  const tickerSet = new Set(holdings.map((h) => h.ticker.toUpperCase()));
  const changeAt = latestChange?.ran_at ? new Date(latestChange.ran_at) : null;

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 16 }}>
        Portfolio Overview
      </div>

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
        {/* Holdings */}
        <div style={{ flex: 1, padding: '14px 16px', borderRadius: 8, background: 'var(--s2)', border: '1px solid var(--bsub)' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}>{active.length}</div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>Active Holdings</div>
        </div>

        {/* Avg P&L */}
        <div style={{ flex: 1, padding: '14px 16px', borderRadius: 8, background: 'var(--s2)', border: '1px solid var(--bsub)' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: pnlColor, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {avgPnl != null ? `${avgPnl >= 0 ? '+' : ''}${avgPnl.toFixed(1)}%` : '—'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>
            Avg Return{pnlValues.length > 0 ? ` (${pnlValues.length} positions)` : ''}
          </div>
        </div>

        {/* Equity : Options weight ratio */}
        <div style={{ flex: 1, padding: '14px 16px', borderRadius: 8, background: 'var(--s2)', border: '1px solid var(--bsub)' }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', lineHeight: 1 }}>
            <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
              {equityPct ?? '—'}
            </span>
            <span style={{ fontSize: 18, color: 'var(--t3)', marginBottom: 1 }}>:</span>
            <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--t2)', fontVariantNumeric: 'tabular-nums' }}>
              {optionsPct ?? '—'}
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>Equity : Options (by market value)</div>
        </div>
      </div>

      {/* Two-column grid on desktop — sector breakdown beside the activity feed so the
          wide overview tab isn't mostly empty space. Single column on mobile. */}
      <div style={{ display: isMobile ? 'block' : 'grid', gridTemplateColumns: isMobile ? undefined : 'minmax(280px, 1fr) 1.4fr', gap: 32, alignItems: 'start' }}>

      {/* Left column — sector distribution */}
      <div>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 10 }}>
        Sector Distribution
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {sectors.map(([name, w]) => {
          const pct = totalWeight > 0 ? (w / totalWeight) * 100 : 0;
          const c = bColor(name);
          return (
            <div key={name}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--t2)', minWidth: 0 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: c, flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginLeft: 8, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                  {pct.toFixed(0)}%
                </span>
              </div>
              <div style={{ height: 4, borderRadius: 2, background: 'var(--border)' }}>
                <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: c, opacity: 0.85 }} />
              </div>
            </div>
          );
        })}
      </div>
      </div>

      {/* Right column — activity + data status */}
      <div>

      {/* Freshness disclosure — the routine checks on a schedule but only posts when the host acts,
          so older dates below are "no newer signal", not stale data. `lastRun` includes no-change
          runs (recent_changes hides them), so this reflects the true last check. */}
      {lastRun?.ran_at && (
        <div style={{ fontSize: 11, color: 'var(--t3)', lineHeight: 1.5, marginBottom: 16 }}>
          Last checked <span style={{ color: 'var(--t2)' }}>{fmtDateTime(new Date(lastRun.ran_at))}</span>.
          The host posts changes intermittently — older dates below reflect his latest action, not stale data.
        </div>
      )}

      {/* Conviction Changes — the latest batch, classified ▲ upgraded / ▼ downgraded / ★ new, each
          with the level move and a one-line why. Reaffirmed (unchanged) collapse to a chip list. */}
      {convBatch && convBatch.changes.length > 0 && (
        <div style={{ marginTop: isMobile ? 28 : 0 }}>
          <SectionHeader
            title="Conviction Changes"
            updatedAt={convBatch.updatedAt ? new Date(convBatch.updatedAt) : null}
          />
          {/* Same card chrome + type scale as "Latest Portfolio Changes" for consistency. */}
          <div style={{
            padding: '12px 14px', borderRadius: 8,
            background: 'var(--s2)', border: '1px solid var(--acc)',
            fontSize: 13, color: 'var(--t2)', lineHeight: 1.6,
          }}>
            {/* meaningful changes (up / down / new), one line each */}
            {convBatch.changes.filter((c) => c.dir !== 'same').map((c) => (
              <ConvictionChangeRow key={c.ticker} c={c} onSelectTicker={onSelectTicker} />
            ))}
            {/* reaffirmed → a trailing "Also noted"-style line */}
            {convBatch.changes.some((c) => c.dir === 'same') && (
              <div style={{ marginTop: convBatch.changes.some((c) => c.dir !== 'same') ? 4 : 0 }}>
                <span style={{ color: 'var(--t3)' }}>Reaffirmed: </span>
                {convBatch.changes.filter((c) => c.dir === 'same').map((c, i, arr) => (
                  <span key={c.ticker}>
                    <TickerLink ticker={c.ticker} onSelect={onSelectTicker} />{i < arr.length - 1 ? '  ' : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Latest portfolio changes (digest) */}
      {latestChange?.digest && (
        <div style={{ marginTop: 28 }}>
          <SectionHeader title="Latest Portfolio Changes" updatedAt={changeAt} />
          <div style={{
            padding: '12px 14px', borderRadius: 8,
            background: 'var(--s2)', border: '1px solid var(--acc)',
            fontSize: 13, color: 'var(--t2)', lineHeight: 1.6, whiteSpace: 'pre-wrap',
          }}>
            {renderDigest(latestChange.digest, tickerSet, onSelectTicker)}
          </div>
        </div>
      )}

      {/* Options-mark freshness (IBKR). Holdings recency is already conveyed by the "Latest Portfolio
          Changes" block above — a separate "Holdings data synced" line read as stale/contradictory
          (it's last-CHANGED, not last-run), so it was removed. */}
      {optionsSynced && (
        <div style={{ marginTop: latestChange?.digest ? 12 : 24, fontSize: 11, color: 'var(--t3)' }}>
          Options data synced:{' '}
          <span style={{ color: 'var(--t2)' }}>{fmtDateTime(optionsSynced)}</span>
        </div>
      )}

      {/* Unpriced option legs — surfaced so they don't have to be hunted one-by-one. Title lives
          OUTSIDE the card (matches the blocks above). The "Run the IBKR sync" hint is admin-only —
          subscribers can't run the sync, so it would just confuse them. */}
      {unpricedLegs.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <SectionHeader title={`⚠ Unpriced Legs (${unpricedLegs.length})`} color="var(--c3)" />
          <div style={{ padding: '8px 10px', borderRadius: 6, background: 'var(--s2)', border: '1px solid var(--bsub)', fontSize: 11, color: 'var(--t2)', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {unpricedLegs.map((u, i) => (
              <div key={i}>
                <TickerLink ticker={u.ticker} onSelect={onSelectTicker} /> {u.label}
                {u.reason && (
                  <span style={{ color: 'var(--t3)' }}>
                    {' — '}{u.reason.title}{canEdit && u.reason.hint ? ` (${u.reason.hint})` : ''}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stale prices — priced before, but the latest sync didn't refresh them (still showing old
          prices). Title outside the card, consistent with Unpriced Legs above. */}
      {stalePrices.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <SectionHeader title={`◷ Stale Prices (${stalePrices.length})`} color="var(--c2)" />
          <div style={{ padding: '8px 10px', borderRadius: 6, background: 'var(--s2)', border: '1px solid var(--bsub)' }}>
          <div style={{ fontSize: 11, color: 'var(--t2)', lineHeight: 1.6 }}>
            {stalePrices.map((s, i) => (
              <span key={i}>{i > 0 ? '  ·  ' : ''}<TickerLink ticker={s.ticker} onSelect={onSelectTicker} /> — {s.label}</span>
            ))}
          </div>
          <div style={{ fontSize: 9, color: 'var(--t3)', marginTop: 4 }}>
            Showing prices from an earlier sync — the latest IBKR sync didn't refresh these.{canEdit ? ' Re-run the sync.' : ''}
          </div>
          </div>
        </div>
      )}

      </div>{/* end right column */}
      </div>{/* end two-column grid */}
    </div>
  );
}
