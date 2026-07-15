// Pre-market daily recap.
//   • Quiet morning (no high-impact econ release): publishes at ~7:50am ET.
//   • Econ-release morning (CPI/PPI/PCE/NFP/GDP at 8:30): holds until ~8:33am ET so the
//     note can lead with the just-released print instead of guessing ahead of it.
//
// Netlify cron is UTC-only, so we fire at several UTC times that cover 7:50 ET and
// 8:33 ET across DST, and the recap's own ET gate decides which target applies today
// (7:50 quiet / 8:33 release-day). Idempotency (skip if today's AM recap exists) makes
// every fire after the first a no-op.
//   Fires (min past hour, UTC): 33 & 50 past 11, 12, 13.
//   7:50 EDT = 11:50 UTC · 7:50 EST = 12:50 UTC · 8:33 EDT = 12:33 UTC · 8:33 EST = 13:33 UTC.
import { schedule } from '@netlify/functions';
import { generateDailyRecap } from '../_lib/recap-core';

export const handler = schedule(
  '33,50 11,12,13 * * 1-5',
  () => generateDailyRecap('macro-recap-am', 'am', {
    amDynamicGate: { normalEtMin: 7 * 60 + 50, eventEtMin: 8 * 60 + 33 },
  }),
);
