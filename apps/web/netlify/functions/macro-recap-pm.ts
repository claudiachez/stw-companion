// Post-market daily recap — targets ~4:30pm ET on weekdays (30 min after the close).
//
// Netlify cron is UTC-only, so we fire at BOTH 20:30 and 21:30 UTC to bracket 4:30pm ET
// across DST, and the recap's own ET gate (minEtMinutes: 990 = 4:30pm) writes only once
// it's ≥ 4:30 ET. Idempotency (skip if today's PM recap exists) makes the second fire a
// no-op. Summer (EDT): 20:30 UTC = 4:30pm writes, 21:30 skips. Winter (EST): 20:30 UTC =
// 3:30pm defers, 21:30 = 4:30pm writes. Either way: one write, at 4:30pm ET.
// (Previously fired at a bare 21:30 UTC, which is 5:30pm in EDT — the summer recap landed
// an hour late; the DST bracket + gate fixes that.)
import { schedule } from '@netlify/functions';
import { generateDailyRecap } from '../_lib/recap-core';

export const handler = schedule(
  '30 20,21 * * 1-5',
  () => generateDailyRecap('macro-recap-pm', 'pm', { minEtMinutes: 16 * 60 + 30 }),
);
