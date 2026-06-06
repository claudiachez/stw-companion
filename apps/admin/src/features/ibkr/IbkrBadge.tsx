import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { parseOptionLegs, fmtDateTime, type OptionLeg } from '@stw/shared';
import { useHoldings } from '@stw/ui';
import { supabase } from '../../lib/supabase';

const PROXY_URL =
  (import.meta.env.VITE_IBKR_PROXY_URL as string | undefined) ?? 'https://localhost:8765';

type Status = 'idle' | 'loading' | 'ok' | 'error';

interface LegResult extends OptionLeg {
  price: number | null;
  bid?: number | null;
  ask?: number | null;
  mid?: number | null;
  pnl_pct?: number | null;
  pnl_dol?: number | null;
  error?: string;
  possibles?: { expiry: string }[];
}

const DOT: Record<Status, string> = {
  idle: 'var(--t3)',
  loading: '#f59e0b',
  ok: '#22c55e',
  error: '#ef4444',
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
      // Collect all option legs across all holdings.
      const allLegs: OptionLeg[] = [];
      for (const h of holdings) {
        parseOptionLegs(h.position_detail ?? '', h.ticker).forEach((leg) => allLegs.push(leg));
      }

      if (!allLegs.length) {
        setStatus('idle');
        setLabel('IBKR');
        setTitle('No parseable option legs found');
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

      // Group legs by ticker and aggregate P&L.
      const fetchedAt = new Date().toISOString();
      const byTicker = new Map<string, { legs: LegResult[]; pnlPct: number | null }>();
      for (const r of results) {
        const entry = byTicker.get(r.symbol) ?? { legs: [], pnlPct: null };
        entry.legs.push(r);
        byTicker.set(r.symbol, entry);
      }
      for (const entry of byTicker.values()) {
        const valid = entry.legs.filter((l) => l.price != null && l.entry != null);
        if (valid.length) {
          entry.pnlPct = valid.reduce((s, l) => s + (l.pnl_pct ?? 0), 0) / valid.length;
        }
      }

      // Persist to Supabase so subscribers see it (don't touch updated_at).
      const synced = await Promise.allSettled(
        [...byTicker.entries()]
          .filter(([, v]) => v.pnlPct != null)
          .map(([ticker, v]) =>
            supabase
              .from('holdings')
              .update({ last_pnl_pct: v.pnlPct, last_pnl_at: fetchedAt, ibkr_legs: v.legs })
              .eq('ticker', ticker),
          ),
      );
      const failed = synced.filter((r) => r.status === 'rejected').length;
      if (failed) console.warn(`IBKR→Supabase: ${failed} ticker(s) failed to sync`);

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
          '\n\nFix the expiry in position detail for "ambiguous" legs, or retry when IB Gateway has data.',
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
        color: 'var(--t2)', fontSize: 12, whiteSpace: 'nowrap',
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
