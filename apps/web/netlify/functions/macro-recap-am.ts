// Pre-market daily recap — fixed 8:32am ET, to run alongside the GEX snapshot (host, 2026-07-16).
//   Netlify cron is UTC-only, so we fire at BOTH 12:32 and 13:32 UTC to bracket 8:32 ET across DST;
//   the recap's own ET gate (512 = 8:32) writes only once it's ≥ 8:32 ET, and idempotency (skip if
//   today's AM recap exists) makes the second, later fire a no-op.
//   8:32 EDT = 12:32 UTC (writes; 13:32 = 9:32 ET no-ops) · 8:32 EST = 13:32 UTC (12:32 = 7:32 ET defers).
//   NOTE 8:32 is only ~2 min after an 8:30 econ release — if FRED's actual occasionally lags, bump to 8:33.
import { schedule } from '@netlify/functions';
import { generateDailyRecap } from '../_lib/recap-core';

export const handler = schedule(
  '32 12,13 * * 1-5',
  () => generateDailyRecap('macro-recap-am', 'am', { minEtMinutes: 8 * 60 + 32 }),
);
