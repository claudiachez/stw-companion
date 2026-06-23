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
- Before writing the handoff, **verify the repo is synced**: no uncommitted changes, no unpushed
  commits, and everything the handoff will reference is actually committed and **pushed to
  `staging`**. Commit and push the CLAUDE.md update to `staging` too — don't leave it local; the
  next session reads the pushed copy.
- Then give me the **handoff prompt**. It MUST:
  - start with `git fetch origin && git checkout staging && git pull --ff-only`, plus a one-line
    sanity check (e.g. "migrations go to NNN / file X exists; if not, you're on the wrong branch").
  - reference ONLY files that exist in the repo on `staging` — never local-only paths like
    `~/.claude/memory/*`, `~/Documents/Claude/Scheduled/*`, or service-key files (a remote session
    can't see them; put anything it needs into the repo).
  - state the next task, the read-first files, key constraints, and what NOT to touch.
