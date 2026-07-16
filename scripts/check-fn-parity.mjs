// Fails when a Netlify function that exists in BOTH apps has drifted.
//
// Netlify functions are site-scoped: a function deployed on one site isn't callable
// from the other domain, so shared ones are kept as a copy in each app. Those copies
// MUST stay byte-identical, or a fix lands on one site and silently not the other —
// exactly the bug behind the 2026-07-15 "gray favorability arrow on admin" miss
// (macro-events was updated on web only). This runs in CI so a one-sided edit fails
// the PR instead of reaching a reviewer.
//
// A file with a genuine per-site difference goes in ALLOW_DIVERGENT with a reason.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const WEB = 'apps/web/netlify/functions';
const ADMIN = 'apps/admin/netlify/functions';

// Keep this list SHORT and justified — each entry is a copy we've accepted can drift.
const ALLOW_DIVERGENT = new Map([
  ['macro-recap.ts', 'admin decodes the Supabase JWT locally + returns richer per-site errors — reconcile the shared prompt/logic, see file headers'],
]);

const webFiles = existsSync(WEB) ? readdirSync(WEB).filter((f) => f.endsWith('.ts')) : [];
const paired = webFiles.filter((f) => existsSync(join(ADMIN, f)));

const drifted = [];
let checked = 0;
for (const f of paired) {
  if (ALLOW_DIVERGENT.has(f)) continue;
  checked++;
  if (readFileSync(join(WEB, f), 'utf8') !== readFileSync(join(ADMIN, f), 'utf8')) drifted.push(f);
}

if (drifted.length) {
  console.error('✖ Netlify function copies drifted between web and admin:');
  for (const f of drifted) console.error(`    ${WEB}/${f}  ≠  ${ADMIN}/${f}`);
  console.error('\nThese are site-scoped copies and must stay identical. Sync them, or');
  console.error('add the file to ALLOW_DIVERGENT in scripts/check-fn-parity.mjs with a reason.');
  process.exit(1);
}

console.log(`✓ Function parity OK — ${checked} paired file(s) identical, ${ALLOW_DIVERGENT.size} allowed-divergent.`);
