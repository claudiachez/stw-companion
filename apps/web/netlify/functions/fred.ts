/**
 * FRED proxy — the browser's only path to Federal Reserve Economic Data.
 *
 * FRED's api.stlouisfed.org sends no CORS header, so the macro module hooks
 * cannot fetch it directly; they call this same-origin proxy instead. It also
 * keeps FRED_API_KEY server-side (no VITE_ prefix), unlike the client-exposed
 * TwelveData key. The scheduled writers (macro-snapshot, regime-daily) call FRED
 * directly and do NOT go through here. See plans/20260707_data_feeds_inventory_and_plan.md.
 *
 * Request:  GET /.netlify/functions/fred?series=VIXCLS,DGS10[&limit=400]
 * Response: { [seriesId]: { closes: number[]; lastDate: string | null } }
 * A series whose upstream fetch fails comes back as { closes: [], lastDate: null }
 * (graceful — the calling module degrades that one cell to "—", never hard-fails).
 *
 * Direct REST fetch only (no @supabase/supabase-js — see CLAUDE.md Conventions).
 * URL building + response parsing live in @stw/shared (buildFredUrl /
 * parseFredObservations) so this and the writers share one implementation.
 */
import type { Handler } from '@netlify/functions';
import { buildFredUrl, parseFredObservations, runPaced, FEED_LIMITS } from '@stw/shared';

const MAX_SERIES = 10;

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = (process.env.FRED_API_KEY ?? '').trim();
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing FRED_API_KEY' }) };
  }

  const qs = event.queryStringParameters ?? {};
  const series = (qs.series ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_SERIES);
  if (series.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No series requested (?series=VIXCLS,DGS10)' }) };
  }
  const limit = Math.max(1, Math.min(5000, parseInt(qs.limit ?? '400', 10) || 400));

  // Paced through the shared limiter even though FRED's ~120/min tier almost
  // never gates ≤10 series — keeps every feed on one throttle path.
  const entries = await runPaced(
    series,
    async (id) => {
      try {
        const res = await fetch(buildFredUrl(id, apiKey, limit));
        if (!res.ok) return [id, { closes: [], lastDate: null }] as const;
        const bars = parseFredObservations(await res.json());
        const closes = bars.map((b) => b.close);
        const lastDate = bars.length ? bars[bars.length - 1].date : null;
        return [id, { closes, lastDate }] as const;
      } catch {
        return [id, { closes: [], lastDate: null }] as const;
      }
    },
    FEED_LIMITS.fred,
  );

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
    body: JSON.stringify(Object.fromEntries(entries)),
  };
};

export { handler };
