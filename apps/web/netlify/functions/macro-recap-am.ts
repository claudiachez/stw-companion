// Pre-market daily recap — runs at ~8am ET on weekdays.
// 12:00 UTC = 8am EDT (summer) / 7am EST (winter) — always before the 9:30am open.
// Idempotent: skips if today's AM recap already exists in macro_daily_recaps.
import { schedule } from '@netlify/functions';
import { generateDailyRecap } from '../_lib/recap-core';

export const handler = schedule('0 12 * * 1-5', () => generateDailyRecap('macro-recap-am', 'am'));
