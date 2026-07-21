import { bColor, holdingPnlPct, legIsOpen, legMarkReason, fmtLegInstrument, fmtDateTime, FONT_SIZE, FONT_WEIGHT, LETTER_SPACING, RADIUS, SPACE, TIERS } from '@stw/shared';
import { usePriceCacheStore } from '../../../store/priceCache';
import { useRecentChanges } from '../useRecentChanges';
import { useConvictionChanges, type ConvictionChange, type ChangeDir } from '../useConvictionChanges';
import { TickerLink } from '../../../primitives/TickerLink';
import { SourceLink } from './SourceLink';
import { SectionHeader } from '../../../primitives/SectionHeader';
import { PortfolioHeatmap, type HeatmapCell } from '../../../components/PortfolioHeatmap';
import { useSectorMap } from '../../limits/useRiskConfig';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { useCapabilities } from '../../../context/AppCapabilities';
import type { Holding } from '../api';

interface DashboardProps {
  holdings: Holding[];
  onSelectTicker?: (ticker: string) => void;
}

// "Updated: <date>" — the right-aligned slot every Overview block passes to the shared
// SectionHeader, so the stamp's own styling (muted date, lighter value) stays identical
// across the what-changed, treemap, and data-health blocks.
function updatedStamp(d: Date | null) {
  if (!d) return null;
  return <>Updated: <span style={{ color: 'var(--t2)' }}>{fmtDateTime(d)}</span></>;
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
          <TickerLink ticker={bare.toUpperCase()} label={bare} onSelect={onSelectTicker} style={{ fontSize: FONT_SIZE.sms }} />
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
// ▲ upgrade → positive, ▼ downgrade → negative, ★ new → info, • reaffirm → muted.
const CHANGE_META: Record<ChangeDir, { label: string; color: string; bg: string; border: string; arrow: string }> = {
  up:   { label: 'Upgraded',   color: 'var(--status-positive-text)', bg: 'var(--status-positive-bg)', border: 'var(--status-positive-border)', arrow: '▲' },
  down: { label: 'Downgraded', color: 'var(--status-negative-text)', bg: 'var(--status-negative-bg)', border: 'var(--status-negative-border)', arrow: '▼' },
  new:  { label: 'New',        color: 'var(--status-info-text)',     bg: 'var(--status-info-bg)',     border: 'var(--status-info-border)',     arrow: '★' },
  same: { label: 'Reaffirmed', color: 'var(--t3)',                   bg: 'var(--s2)',                 border: 'var(--bsub)',                   arrow: '•' },
};

// One conviction-change line: TICKER ▲ [BADGE] Prev → Current: why
function ConvictionChangeRow({ c, onSelectTicker }: {
  c: ConvictionChange;
  onSelectTicker?: (t: string) => void;
}) {
  const m = CHANGE_META[c.dir];
  const toTier = TIERS[c.level] ?? TIERS[0];
  const fromTier = c.prevLevel != null ? (TIERS[c.prevLevel] ?? TIERS[0]) : null;
  return (
    <div style={{ marginBottom: SPACE[1.5] }}>
      <TickerLink ticker={c.ticker} onSelect={onSelectTicker} style={{ fontSize: FONT_SIZE.sms }} />
      {' '}
      <span style={{ color: m.color, fontWeight: FONT_WEIGHT.bold }}>{m.arrow}</span>
      {' '}
      <span style={{
        display: 'inline-block', verticalAlign: 'middle',
        fontSize: FONT_SIZE['3xs'], fontWeight: FONT_WEIGHT.bold, letterSpacing: '0.05em', textTransform: 'uppercase',
        color: m.color, background: 'var(--surface)', border: `1px solid ${m.color}`,
        borderRadius: RADIUS.DEFAULT, padding: '1px 5px',
      }}>{m.label}</span>
      {' '}
      <span style={{ fontWeight: FONT_WEIGHT.semibold }}>
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

// One column of the top stat strip: 9px uppercase label / 20px big value / 10px sub.
function Stat({ label, value, sub, color = 'var(--text)', divider = false }: {
  label: string; value: React.ReactNode; sub?: React.ReactNode; color?: string; divider?: boolean;
}) {
  return (
    <div style={{ minWidth: 0, padding: '10px 12px 12px', borderLeft: divider ? '1px solid var(--bsub)' : undefined }}>
      <div style={{ fontSize: FONT_SIZE['3xs'], fontWeight: FONT_WEIGHT.bold, letterSpacing: LETTER_SPACING.label, textTransform: 'uppercase', color: 'var(--t3)' }}>
        {label}
      </div>
      <div style={{ fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold, color, marginTop: SPACE[1], fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {value}
      </div>
      {sub != null && (
        <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginTop: SPACE[0.5], whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {sub}
        </div>
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
  const { data: sectorLookup } = useSectorMap(); // ticker→market sector (distinct from the local by-basket map below)
  const { data: changes } = useRecentChanges(1);
  const latestChange = changes?.[0] ?? null;
  const convBatch = useConvictionChanges(holdings);

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
  // by mark÷entry. Per-leg (not whole-holding), so a shares+call overlay counts on BOTH sides.
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

  // Cash % — the CASH balance row's own portfolio weight (weights are already whole-book %).
  const cashRow = holdings.find((h) => h.ticker === 'CASH');
  const cashPct = cashRow ? (cashRow.current_weight ?? cashRow.initial_weight ?? null) : null;

  // Weight by basket (STW's thematic baskets), largest first.
  const basketMap: Record<string, number> = {};
  active.forEach((h) => {
    const w = h.current_weight ?? h.initial_weight ?? 0;
    basketMap[h.basket] = (basketMap[h.basket] ?? 0) + w;
  });
  const totalWeight = Object.values(basketMap).reduce((s, v) => s + v, 0);
  const baskets = Object.entries(basketMap).sort((a, b) => b[1] - a[1]);
  const maxBasketW = baskets.length ? baskets[0][1] : 0;

  // Options-mark freshness = newest IBKR leg mark across all holdings.
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
      (l) => l.instrument_type === 'OPTION' && l.status === 'OPEN' && l.mark_price != null && l.mark_price_at != null &&
        new Date(l.mark_price_at).getTime() < optionsSynced.getTime(),
    );
    if (!stale.length) return [];
    const at = new Date(stale[0].mark_price_at!);
    const legs = stale.map((l) => fmtLegInstrument(l)).join(', ');
    return [{ ticker: h.ticker, label: `priced ${fmtDateTime(at)}: ${legs}` }];
  });

  // Heatmap cells — box ∝ current weight; Today = Finnhub day change, Total = weighted
  // leg P&L (shares on the live quote, options on their stored IBKR mark).
  const heatmapCells: HeatmapCell[] = active.map((h) => ({
    ticker: h.ticker,
    weight: h.current_weight ?? h.initial_weight ?? 0,
    todayPct: cache[h.ticker]?.dp ?? null,
    totalPct: holdingPnlPct(h.legs, cache[h.ticker]?.c ?? null),
    basket: h.basket,
    sector: sectorLookup?.[h.ticker] ?? null,
  }));

  const tickerSet = new Set(holdings.map((h) => h.ticker.toUpperCase()));
  const webinarDate = convBatch?.eventDate ? new Date(convBatch.eventDate + 'T00:00:00') : null;
  const convChanges = convBatch?.changes ?? [];
  const meaningful = convChanges.filter((c) => c.dir !== 'same');
  const reaffirmed = convChanges.filter((c) => c.dir === 'same');
  const hasWhatChanged = convChanges.length > 0 || !!latestChange?.digest;
  const dataHealthClean = unpricedLegs.length === 0 && stalePrices.length === 0;

  const avgColor = avgPnl == null ? 'var(--text)' : avgPnl >= 0 ? 'var(--pnl-gain)' : 'var(--pnl-loss)';
  const pad = isMobile ? '16px 14px' : '14px 16px';

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'var(--bg)' }}>
      {/* Contained column + single pane card (matches the ref pane + the sibling Overview tab,
          instead of sprawling full-bleed). */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: isMobile ? 12 : '16px 20px' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      {/* Eyebrow strip — names the surface (shared anatomy with DetailPane). */}
      <div style={{
        background: 'var(--s2)', borderBottom: '1px solid var(--bsub)',
        padding: `${SPACE[1.5]}px ${SPACE[3.5]}px`,
        fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.bold, letterSpacing: LETTER_SPACING.label,
        textTransform: 'uppercase', color: 'var(--t3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        Stock Picks · Portfolio Overview
      </div>

      <div style={{ padding: pad, display: 'flex', flexDirection: 'column', gap: SPACE[3] }}>
        {/* 1 · Stat strip — bsub top/bottom, 4-up (2-up mobile). */}
        <div style={{
          display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
          gap: 0,
          borderTop: '1px solid var(--bsub)', borderBottom: '1px solid var(--bsub)',
          padding: `${SPACE[3.5]}px 0`,
        }}>
          <Stat label="Active holdings" value={active.length} sub={`${baskets.length} basket${baskets.length === 1 ? '' : 's'}`} />
          <Stat
            label="Avg return"
            value={avgPnl != null ? `${avgPnl >= 0 ? '+' : ''}${avgPnl.toFixed(1)}%` : '—'}
            sub={pnlValues.length > 0 ? `${pnlValues.length} positions` : 'no live prices'}
            color={avgColor}
            divider={!isMobile}
          />
          <Stat
            label="Shares : Options"
            value={equityPct != null ? `${equityPct} : ${optionsPct}` : '—'}
            sub="by market value"
            divider={!isMobile}
          />
          <Stat
            label="Cash"
            value={cashPct != null ? `${cashPct.toFixed(1)}%` : '—'}
            sub="of book weight"
            divider={!isMobile}
          />
        </div>

        {/* 2 · What changed this week — conviction moves + reaffirmations + the run digest. */}
        {hasWhatChanged && (
          <div>
            <SectionHeader title="What changed this week" right={updatedStamp(webinarDate)} />
            <div style={{
              padding: `${SPACE[3]}px ${SPACE[3.5]}px`, borderRadius: 10,
              background: 'var(--status-positive-bg)', border: '1px solid var(--status-positive-border)',
              fontSize: FONT_SIZE.sm, color: 'var(--t2)', lineHeight: 1.6,
            }}>
              {meaningful.map((c) => (
                <ConvictionChangeRow key={c.ticker} c={c} onSelectTicker={onSelectTicker} />
              ))}
              {reaffirmed.length > 0 && (
                <div style={{ marginTop: meaningful.length ? SPACE[1] : 0 }}>
                  <span style={{ color: 'var(--t3)' }}>Reaffirmed: </span>
                  {reaffirmed.map((c, i, arr) => (
                    <span key={c.ticker}>
                      <TickerLink ticker={c.ticker} onSelect={onSelectTicker} style={{ fontSize: FONT_SIZE.sms }} />{i < arr.length - 1 ? '  ' : ''}
                    </span>
                  ))}
                </div>
              )}
              {/* Trims / rolls / adds narrative — the latest run digest. */}
              {latestChange?.digest && (
                <div style={{
                  marginTop: convChanges.length ? SPACE[2] : 0,
                  paddingTop: convChanges.length ? SPACE[2] : 0,
                  borderTop: convChanges.length ? '1px solid var(--status-positive-border)' : 'none',
                  whiteSpace: 'pre-wrap',
                }}>
                  {renderDigest(latestChange.digest, tickerSet, onSelectTicker)}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 3 · The book — treemap (box ∝ weight, color = return), grouped by basket. */}
        <div>
          <PortfolioHeatmap
            cells={heatmapCells}
            onSelectTicker={onSelectTicker}
            showToday
            defaultGroup="basket"
            title="The book"
            updated={<>Source: <span style={{ color: 'var(--t2)' }}>Finnhub live · IBKR marks</span></>}
          />
        </div>

        {/* 4 · Weight by basket — bars sized against the largest basket. */}
        <div>
          <SectionHeader title="Weight by basket" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE[2] }}>
            {baskets.map(([name, w]) => {
              const pct = totalWeight > 0 ? (w / totalWeight) * 100 : 0;
              const barPct = maxBasketW > 0 ? (w / maxBasketW) * 100 : 0;
              const c = bColor(name);
              return (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: SPACE[2] }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[1.5], flex: `0 1 ${isMobile ? 108 : 150}px`, minWidth: 0 }}>
                    <span style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0, height: 6, borderRadius: RADIUS.sm, background: 'var(--bsub)' }}>
                    <div style={{ width: `${barPct}%`, height: '100%', borderRadius: RADIUS.sm, background: c, opacity: 0.85 }} />
                  </div>
                  <span style={{ fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: 'var(--text)', width: 38, textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                    {pct.toFixed(0)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 5 · Data health — unpriced + stale option marks, naming the tickers. */}
        <div>
          <SectionHeader
            title="Data health"
            color={dataHealthClean ? 'var(--t3)' : 'var(--status-warning-text)'}
            right={optionsSynced ? updatedStamp(optionsSynced) : null}
          />
          <div style={{ padding: `${SPACE[2.5]}px ${SPACE[3.5]}px`, borderRadius: 10, background: 'transparent', border: '1px solid var(--bsub)', fontSize: FONT_SIZE.sm, color: 'var(--t2)', lineHeight: 1.6 }}>
            {dataHealthClean && (
              <div style={{ color: 'var(--t3)' }}>
                All open option marks are priced and current{optionsSynced ? <> as of <span style={{ color: 'var(--t2)' }}>{fmtDateTime(optionsSynced)}</span></> : ''}.
              </div>
            )}

            {unpricedLegs.length > 0 && (
              <div style={{ marginBottom: stalePrices.length ? SPACE[2] : 0 }}>
                <div style={{ fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: 'var(--status-warning-text)', marginBottom: SPACE[1] }}>
                  ⚠ Unpriced legs ({unpricedLegs.length})
                </div>
                {unpricedLegs.map((u, i) => (
                  <div key={i}>
                    <TickerLink ticker={u.ticker} onSelect={onSelectTicker} style={{ fontSize: FONT_SIZE.xs }} /> {u.label}
                    {u.reason && (
                      <span style={{ color: 'var(--t3)' }}>
                        {' — '}{u.reason.title}{canEdit && u.reason.hint ? ` (${u.reason.hint})` : ''}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {stalePrices.length > 0 && (
              <div>
                <div style={{ fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: 'var(--status-warning-text)', marginBottom: SPACE[1] }}>
                  ◷ Stale prices ({stalePrices.length})
                </div>
                {stalePrices.map((s, i) => (
                  <div key={i}>
                    <TickerLink ticker={s.ticker} onSelect={onSelectTicker} style={{ fontSize: FONT_SIZE.xs }} /> — {s.label}
                  </div>
                ))}
                <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginTop: SPACE[1] }}>
                  {canEdit ? 'Showing prices from an earlier sync — the latest IBKR sync didn\'t refresh these. Re-run the sync.' : 'These option prices are from an earlier session.'}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
        </div>
      </div>
    </div>
  );
}
