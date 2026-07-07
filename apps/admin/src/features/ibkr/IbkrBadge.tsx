import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fmtDateTime, FONT_SIZE } from '@stw/shared';
import { useHoldings } from '@stw/ui';
import { supabase } from '../../lib/supabase';

const PROXY_URL =
  (import.meta.env.VITE_IBKR_PROXY_URL as string | undefined) ?? 'https://localhost:8765';

type Status = 'idle' | 'loading' | 'ok' | 'error';

// One contract sent to the proxy — `leg_id` is echoed back so each mark maps to its legs row.
interface LegSpec {
  leg_id: string;
  symbol: string;
  strike: number | null;
  right: 'C' | 'P';
  expiry: string;        // 'YYYYMMDD'
  entry: number | null;
}

interface LegResult extends LegSpec {
  price: number | null;
  error?: string;
  possibles?: { expiry: string }[];
}

const DOT: Record<Status, string> = {
  idle: 'var(--t3)',
  loading: 'var(--c3)',
  ok: 'var(--acc)',
  error: 'var(--c1)',
};

export function IbkrBadge() {
  const { data: holdings = [] } = useHoldings();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>('idle');
  const [label, setLabel] = useState('IBKR');
  const [title, setTitle] = useState('Click to fetch live option prices via the local IBKR proxy');

  async function sync() {
    if (status === 'loading') return;
    setStatus('loading');
    setLabel('IBKR…');

    try {
      // Collect all OPTION legs across all holdings, carrying each leg's id so the returned
      // mark can be written straight back to its `legs` row.
      const allLegs: LegSpec[] = [];
      for (const h of holdings) {
        for (const leg of h.legs) {
          if (leg.instrument_type !== 'OPTION' || leg.status !== 'OPEN') continue;
          allLegs.push({
            leg_id: leg.id,
            symbol: h.ticker,
            strike: leg.option_strike,
            right: leg.option_right === 'PUT' ? 'P' : 'C',
            expiry: (leg.option_expiry ?? '').replace(/-/g, ''),
            entry: leg.entry_price,
          });
        }
      }

      if (!allLegs.length) {
        setStatus('idle');
        setLabel('IBKR');
        setTitle('No open option legs to price');
        return;
      }

      const res = await fetch(`${PROXY_URL}/option_prices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(allLegs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const results: LegResult[] = await res.json();
      if ((results as unknown as { error?: string }).error) {
        throw new Error((results as unknown as { error: string }).error);
      }

      // Persist each priced leg's mark to the `legs` row (mark_price_source = IBKR). P&L % is
      // derived in-app from entry vs mark — the proxy is a pricer only. Don't touch holdings.
      const fetchedAt = new Date().toISOString();
      const synced = await Promise.allSettled(
        results
          .filter((r) => r.price != null && r.leg_id)
          .map((r) =>
            supabase
              .from('legs')
              .update({ mark_price: r.price, mark_price_at: fetchedAt, mark_price_source: 'IBKR' })
              .eq('id', r.leg_id),
          ),
      );
      const failed = synced.filter((r) => r.status === 'rejected').length;
      if (failed) console.warn(`IBKR→Supabase: ${failed} leg(s) failed to sync`);

      // Surface EVERY leg we couldn't price (not just ambiguous ones) so it's clear
      // exactly which contracts are missing and why.
      const unpriced = results.filter((r) => r.price == null);
      if (unpriced.length) {
        const lines = unpriced.map((r) => {
          const id = `${r.symbol} $${r.strike}${r.right} ${r.expiry ?? ''}`.trim();
          if (r.error === 'ambiguous') {
            const opts = (r.possibles ?? []).map((p) => p.expiry).join(', ') || 'none listed';
            return `• ${id} — strike isn't listed for that expiry; IBKR lists: ${opts}`;
          }
          if (r.error === 'no_market_data' || !r.error) {
            return `• ${id} — no bid/ask/last/close (likely illiquid, deep-ITM, or far-dated)`;
          }
          return `• ${id} — ${r.error}`;
        });
        alert(
          `IBKR sync — ${unpriced.length} of ${allLegs.length} leg(s) not priced:\n\n` +
          lines.join('\n') +
          '\n\nFix the leg\'s strike/expiry for "ambiguous" legs, or retry when IB Gateway has data.',
        );
      }

      const priced = allLegs.length - unpriced.length;
      setStatus('ok');
      setLabel(`IBKR ✓ ${priced}/${allLegs.length}`);
      setTitle(
        unpriced.length
          ? `${unpriced.length} unpriced: ` +
            unpriced.map((r) => `${r.symbol} $${r.strike}${r.right}`).join(', ')
          : `Last synced ${fmtDateTime(fetchedAt)}`,
      );

      await queryClient.invalidateQueries({ queryKey: ['holdings'] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus('error');
      setLabel('IBKR ✗');
      setTitle(msg);
      console.error('IBKR proxy error:', msg);
    }
  }

  return (
    <button
      onClick={sync}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        height: 36, padding: '0 10px',
        borderRadius: 6, border: '1px solid var(--border)',
        background: 'none', cursor: 'pointer',
        color: 'var(--t2)', fontSize: FONT_SIZE.sm, whiteSpace: 'nowrap',
        transition: 'background 0.15s, color 0.15s',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--s2)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
    >
      <span
        style={{
          width: 8, height: 8, borderRadius: '50%',
          background: DOT[status],
          animation: status === 'loading' ? 'ibkr-pulse 1s ease-in-out infinite' : 'none',
        }}
      />
      {label}
    </button>
  );
}
