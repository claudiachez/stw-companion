// Pre-market daily recap — runs at 8am ET (13:00 UTC) on weekdays.
// Idempotent: skips if today's AM recap already exists in macro_daily_recaps.
import { schedule } from '@netlify/functions';
import { generateDailyRecap } from '../_lib/recap-core';

export const handler = schedule('0 13 * * 1-5', () => generateDailyRecap('macro-recap-am', 'am'));
