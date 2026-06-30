// Scheduled macro recap — morning run (8am ET weekdays).
// Cron: 0 13 * * 1-5 = 13:00 UTC = 8am EST / 9am EDT.
// Idempotent: skips if this ISO week's recap already exists.
import { schedule } from '@netlify/functions';
import { generateWeeklyRecap } from '../_lib/recap-core';

export const handler = schedule('0 13 * * 1-5', () => generateWeeklyRecap('macro-recap-am'));
