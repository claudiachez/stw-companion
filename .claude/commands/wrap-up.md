---
description: Wrap up the session — refresh docs/status.md + durable docs, verify repo/DB state, emit the next-session prompt
---

Wrap up this session for a fresh continuation. Work top to bottom.

## 1. Update the transient status
- Rewrite **`docs/status.md`** to reflect where we're leaving off: current branch/deploy state,
  migration high-water, pending host actions, and next work. Keep it lean — it's a snapshot, not a log.
- Append a short dated handoff entry to **`docs/session-history.md`** (what shipped, PRs, deviations).
  History accumulates there so `status.md` stays current-only.

## 2. Capture durable decisions in the RIGHT home (keep CLAUDE.md lean)
Any standing rule/decision this session established or changed goes to its durable home — NOT back
into CLAUDE.md as prose. Ask "is this a rule that holds next month?"; if yes:
- Product/architecture decision → **`docs/decisions.md`** (full rationale) + a ONE-LINE entry in
  CLAUDE.md's "Decisions locked" index.
- UI rule → **`docs/ui-conventions.md`**.
- A genuinely high-frequency, always-relevant rule → a terse line in CLAUDE.md's Ground rules/Conventions.
- **Do NOT re-bloat CLAUDE.md.** It's a lean rules + pointers file (~120 lines) — verbose content lives
  in `docs/*`. If a new decision contradicts existing text, fix it in place; don't just append.
- Skip one-off implementation details — record rules, not changelog entries.

## 3. Keep the reference docs current
Update only what this session changed (don't rewrite what's still accurate). Filenames are lowercase.
- `docs/feeds.md` / `docs/macro.md` — feeds, keys, limits, macro wiring, regime scoring.
- `docs/routines.md` — table writers + the ingestion cron routines.
- `docs/ibkr.md` — the three IBKR pipelines.
- `docs/workflow.md` — cold end-to-end system overview.
- `docs/decisions.md`, `docs/ui-conventions.md` — per step 2.
- `docs/macro_dashboard_guide*.md`, `docs/regime_exit_v0.md` (operator-owned template — never invent values).

## 4. Run `/stw-review`
Run it over the session's diff and fix anything it flags before finalizing.

## 5. Verify state — check, don't assume
- **Repo synced:** no uncommitted or unpushed changes; everything the handoff references is committed
  and pushed to `staging` (including the doc updates above — the next session reads the pushed copy).
- **Branches:** confirm each feature branch opened this session is truly merged. `git cherry origin/staging
  <branch>` — `-` prefix = already on staging (squash-merge), safe to delete; `+` = unmerged.
  (`git merge-base --is-ancestor` gives false negatives on squash-merges — don't rely on it.) Flag any
  branch needing manual deletion (`git push origin --delete` may be proxy-blocked).
- **Prod vs staging:** state plainly whether the work is on `main` or only `staging`
  (`git log --oneline origin/main..origin/staging`; non-empty = not on prod). A promotion is
  approval-gated — never promote without explicit approval; call out a pending one.
- **Database:** for every migration/backfill authored, verify which environments it's ACTUALLY applied
  to — PROD (`usmqbohcjcyszjxxvnqu`) and sandbox (`uolabcgbnrkhzpwuvzlk`) — by checking the column/data
  exists. A merged PR ≠ a migrated DB. Flag any environment still pending.
- **CI:** confirm the PRs' CI runs were green (typecheck/lint/test/fn-parity).

## 6. Emit the handoff prompt
It MUST:
- start with `git fetch origin && git checkout staging && git pull --ff-only`, plus a one-line sanity
  check (migrations reach NNN / a key file exists) and "read `docs/status.md` first".
- reference ONLY files present in the repo on `staging` — never local-only paths (`~/.claude/*`,
  `~/Documents/Claude/Scheduled/*`, service-key files); put anything a remote session needs into the repo.
- state the next task, the read-first files, key constraints, and what NOT to touch.
