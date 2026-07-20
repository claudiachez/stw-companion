# Redesign — flags for the host (accumulated per page; surface in the final PR)

## Profile page (committed)
**Resolved:**
- **IBKR masked account number** ("U842•••93") — RESOLVED. It IS available: `user_executions.account`
  (per-fill). Now shown (masked via `maskAccount`) on both the Profile connected-accounts card and the
  Settings connection header. Null until the first fill syncs.
- **Avatar upload/edit** (host request) — real image upload. Migration `079_profile_avatar.sql`
  (APPLIED to PROD via MCP): `profiles.avatar_url` + a public `avatars` storage bucket with own-folder
  RLS + a `set_my_avatar_url` RPC. Profile shows the image (initials fallback); Edit adds upload / change /
  remove (≤3 MB, image/* only). Path `<uid>/<ts>.<ext>` in the avatars bucket.

**Host-requested additions (2nd round):**
- **Pending pill is amber** (host request) — added a generic `warning` variant to StatusPill (distinct
  from `near` = "≥80% of a limit"); `pending → warning`.
- **Name edit** — "Edit" on the identity card opens First + Last name inputs, stored as
  `display_name = "First Last"` (no first/last columns; split on first space to prefill). **Needs
  migration `077_set_my_display_name.sql`** (SECURITY DEFINER RPC — users have no direct UPDATE on
  profiles; same pattern as `set_my_preferences`). **HOST MUST APPLY 077.** Want true separate
  first/last columns instead? That's a further schema change.

**Deviations from the mock (deliberate, per our conventions):**
- **Theme control is 2-way (Light/Dark), not 3-way** — you chose to skip "System" (our theme store
  is binary; System would be a new device-follow behavior). The mock's System segment is dropped.
- **Exact px snap to the type scale**: the mock's 13/16/22px map to our `FONT_SIZE` tokens
  (14/18/26) — lint forbids literal font-sizes, so the app's type scale is canonical. Sub-pixel
  differences from the mock on the name (16→18) and avatar initial (22→26).
- **Pending/rejected notices use the `AlertStrip` primitive** (left-accent bar) rather than the
  mock's full bordered box — primitive reuse over a bespoke box.
- **Buttons use the `Button` secondary/destructive primitives** (secondary has a faint `--s2` fill
  vs the mock's transparent bg) — primitive reuse; tiny fill delta.

**New wiring added:**
- `Show dollar amounts` → new `showMoney` global preference (`usePrivacyStore` +
  `profiles.preferences.showMoney`, synced). No consuming surface yet — honored as Overview/other
  privacy surfaces are redesigned.
- `Change password` → Supabase password-reset email. `Sign out` → real signOut → /login.
  `Delete account…` → mailto to **`cc@claudiachez.com`** (interim — no dedicated support inbox /
  self-delete endpoint exists). **Confirm the support address.**
- `Manage` (IBKR) → routes to `/settings` (web only; the card is hidden in admin, which has no
  Settings route).
- Theme toggle **removed from the hamburger menu** (Profile owns it now), per your instruction.

**Verification:** compiles/boots clean, no console/build errors. Live authed page not
screenshotted (auth-gated; can't sign in) — needs a logged-in eyeball on the dev server/staging.

## Settings page (committed)
Guardrails form (`RiskConfigForm`) rebuilt to the 4-tab redesign (Position size caps / Account
safety net / Per-position stops / Red-market playbook), each with an on/off toggle, draggable
monotonic ladder columns, and a stocks/options scope switch. Dollar equivalents honor `showMoney`.

**New data (migration `078_guardrail_toggles_and_option_ladder.sql` — APPLIED to PROD via MCP):**
- `caps_enabled` / `ladder_enabled` / `per_stock_enabled` / `regime_enabled` (bool, default true).
- `per_stock_option_ladder` (jsonb) — the per-OPTION stop ladder, sibling to `per_stock_ladder`.

**Deferred (host-approved boundary):** the toggles + options ladder are STORED + EDITABLE now, but
the **Risk-tab evaluators + drawdown-alert cron do NOT yet honor them** — a disabled guardrail still
evaluates, and the per-option ladder isn't yet used for option positions. Wire this when the **Risk
tab** is redesigned (skip disabled guardrails; use the option ladder for option positions).

**Deviations from the mock:**
- **IBKR connection editor kept as-is** (the existing, working `SettingsPage` panel) rather than
  re-skinned to the mock's exact layout — functionally complete (collapsible, token reveal, guide,
  import). Re-skin later if desired.
- **Omitted the mock's "STW playbook / Reset to preset" banner** — there's no client-side PRESET in
  our data model; defaults live server-side (`DEFAULT_RISK_CONFIG`). Add a reset-to-defaults if wanted.
- Mock's `--pos-*/--warn/--neg` map to our real `--status-positive/warning/negative-*` tokens; the
  knob shadow uses `SHADOW.card` (the mock's literal rgba is lint-banned).
