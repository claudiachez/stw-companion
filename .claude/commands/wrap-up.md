---
description: Wrap up the session — update CLAUDE.md handoff, verify repo is synced, emit the next-session prompt
---

Wrap up this session. We'll continue in a new session.

- Update `CLAUDE.md` (project root) — the **Current Status** and **Next Steps** sections — to
  accurately reflect where we're leaving off, what works, and what's next. Keep it concise for a
  new Claude Code session.
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
