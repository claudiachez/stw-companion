#!/usr/bin/env node
// One-time migration: push current HTML data to Supabase
// Run: node migrate.js

const fs = require('fs');

const SUPABASE_URL = 'https://usmqbohcjcyszjxxvnqu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_aPliJhMtRvi3kUST45VeTA_4rIjNfrR';

// Extract data from HTML
const html = fs.readFileSync('/Users/claudiachez/Documents/Claude/Code/STW Companion/dashboard/index.html', 'utf8');
const match = html.match(/<script id="stw-data-block">([\s\S]*?)<\/script>/);
if (!match) { console.error('Data block not found'); process.exit(1); }

const window = {};
eval(match[1]);
const { STW_DATA, GRADDOX_DATA } = window;

async function upsert(table, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`[${table}] ${res.status}: ${txt}`);
  }
}

async function main() {
  console.log(`\nMigrating ${STW_DATA.holdings.length} holdings to Supabase...\n`);
  for (const h of STW_DATA.holdings) {
    // Coerce action_date null to undefined so Supabase stores NULL
    const row = { ...h };
    if (!row.action_date) row.action_date = null;
    await upsert('holdings', row);
    console.log(`  ✓ ${h.ticker.padEnd(6)} rank ${h.rank}`);
  }

  if (GRADDOX_DATA) {
    console.log('\nMigrating Graddox snapshot...');
    await upsert('graddox', { id: 1, ...GRADDOX_DATA });
    console.log('  ✓ Graddox');
  }

  console.log('\n✅ Migration complete.\n');
}

main().catch(e => { console.error('\n❌', e.message); process.exit(1); });
