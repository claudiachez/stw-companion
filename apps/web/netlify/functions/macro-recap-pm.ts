// Scheduled macro recap — afternoon run (4:30pm ET weekdays).
// Cron: 30 21 * * 1-5 = 21:30 UTC = 4:30pm EST / 5:30pm EDT.
// Idempotent: skips if this ISO week's recap already exists.
import { schedule } from '@netlify/functions';
import { generateWeeklyRecap } from '../_lib/recap-core';

export const handler = schedule('30 21 * * 1-5', () => generateWeeklyRecap('macro-recap-pm'));
