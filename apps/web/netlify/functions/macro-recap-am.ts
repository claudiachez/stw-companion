// Pre-market daily recap — targets ~8:35am ET on weekdays, AFTER the 8:30 econ
// releases (CPI/PCE/NFP/PPI/GDP) so the note can actually report them.
//
// Netlify cron is UTC-only, so we fire at BOTH 12:35 and 13:35 UTC to bracket 8:35 ET
// across DST, and the recap's own ET gate (minEtMinutes: 515 = 8:35) writes only once
// it's ≥ 8:35 ET. Idempotency (skip if today's AM recap exists) makes the second fire a
// no-op. Summer: 12:35 UTC = 8:35 EDT writes, 13:35 skips. Winter: 12:35 UTC = 7:35 EST
// defers, 13:35 = 8:35 EST writes. Either way: one write, at 8:35 ET, post-releases.
import { schedule } from '@netlify/functions';
import { generateDailyRecap } from '../_lib/recap-core';

export const handler = schedule('35 12,13 * * 1-5', () => generateDailyRecap('macro-recap-am', 'am', { minEtMinutes: 8 * 60 + 35 }));
