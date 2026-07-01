// Post-market daily recap — runs at 4:30pm ET (21:30 UTC) on weekdays.
// Idempotent: skips if today's PM recap already exists in macro_daily_recaps.
import { schedule } from '@netlify/functions';
import { generateDailyRecap } from '../_lib/recap-core';

export const handler = schedule('30 21 * * 1-5', () => generateDailyRecap('macro-recap-pm', 'pm'));
