---
description: Wrap up the session — update CLAUDE.md handoff, verify repo is synced, emit the next-session prompt
---

Wrap up this session. We'll continue in a new session.

- Update `CLAUDE.md` (project root) — the **Current Status** and **Next Steps** sections — to
  accurately reflect where we're leaving off, what works, and what's next. Keep it concise for a
  new Claude Code session.
- **Capture any permanent/standing decisions** the session established or changed — UI/design
  conventions, locked product decisions, data-model rules, or host clarifications — into the
  **durable** sections of `CLAUDE.md` (e.g. **Conventions**, **Design System**, **Decisions locked**),
  NOT just Current Status (which is a snapshot the next handoff overwrites). Ask yourself: "is this a
  rule that should hold next month?" — if yes, it belongs in a durable section.
  - If a new decision **contradicts existing CLAUDE.md text, fix the old text in place** (correct or
    delete it) rather than only appending — stale guidance left standing will mislead the next session.
  - Skip pure implementation details and one-off fixes; record rules, not changelog entries.
- **Keep the standing reference docs in `docs/` current** if this session changed what they describe.
  Check each against the work done and update the stale ones (don't rewrite what's still accurate):
  - `docs/feeds.md` — every external data feed, its key/limits, and consumers. Update whenever a feed,
    API key, rate limit, scheduled writer, or the sector taxonomy changes.
  - `docs/workflow.md` — the cold, end-to-end system overview (ingestion → Supabase → apps).
  - `docs/macro_dashboard_guide.md` + `docs/macro_dashboard_guide_prompt.md` — the subscriber-facing
    Macro-tab guide + its regenerator prompt. Update when a macro module, indicator, data source, or
    the regime scoring changes.
  - `docs/regime_exit_v0.md` — operator-owned advisory de-risking policy (a template; only the operator
    fills/signs it — don't invent values).
  - `plans/20260706_integrity-guardrails-report.md` — a historical week-1 report; don't rewrite it, but
    add a short "superseded / current state" note if later work changed its conclusions.
  - **Doc filenames are lowercase** (`snake_case.md`) — never ALL-CAPS. Fix any that drift.
- Before writing the handoff, **verify the repo is synced**: no uncommitted changes, no unpushed
  commits, and everything the handoff will reference is actually committed and **pushed to
  `staging`**. Commit and push the CLAUDE.md update to `staging` too — don't leave it local; the
  next session reads the pushed copy.
- **Verify branches, deploy state, and the database are actually where the handoff claims** — check,
  don't assume:
  - **Branches:** confirm every feature branch this session opened is truly merged before calling it
    done or suggesting deletion. Use `git cherry origin/staging <branch>` — a `-` prefix means the
    patch is already on `staging` (e.g. a squash-merge) and the branch is safe to delete; a `+` means
    genuinely unmerged work. **`git merge-base --is-ancestor` gives FALSE NEGATIVES on squash-merges**
    (the squash creates a new hash), so don't rely on it alone. List any stale branch safe to delete,
    and flag any with unmerged commits. (Claude can attempt `git push origin --delete <branch>` but
    may be blocked — flag it for manual deletion if so.)
  - **Production vs staging:** state plainly whether this session's work is on `main` (production) or
    only `staging`. Check with `git log --oneline origin/main..origin/staging` (non-empty = staging is
    ahead, i.e. NOT yet on production). A `staging → main` PR is a separate, approval-gated production
    deploy — never promote to `main` without explicit approval, and call out in the handoff if a
    promotion is pending.
  - **Database:** for every migration or data backfill authored this session, verify which Supabase
    environments it has ACTUALLY been applied to — PROD (`usmqbohcjcyszjxxvnqu`) **and** sandbox
    (`uolabcgbnrkhzpwuvzlk`) — by checking the column/data exists, not by assuming the user ran it.
    Migrations are Claude-authored / user-applied, so **a merged PR does NOT mean the DB is migrated**.
    Flag any environment still pending (e.g. "043 applied to PROD, still pending on sandbox").
- Then give me the **handoff prompt**. It MUST:
  - start with `git fetch origin && git checkout staging && git pull --ff-only`, plus a one-line
    sanity check (e.g. "migrations go to NNN / file X exists; if not, you're on the wrong branch").
  - reference ONLY files that exist in the repo on `staging` — never local-only paths like
    `~/.claude/memory/*`, `~/Documents/Claude/Scheduled/*`, or service-key files (a remote session
    can't see them; put anything it needs into the repo).
  - state the next task, the read-first files, key constraints, and what NOT to touch.
