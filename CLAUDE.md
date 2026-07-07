# STW Companion — Claude Code Guide

> **⚠️ START HERE — branch.** **`staging` is the active trunk** — all feature work happens here.
> **`staging` and `main` are in sync as of 2026-07-05** (`staging → main` PR #66 merged). `staging`
> itself is still exactly that state — **2 commits ahead of `main`** (both trivial CLAUDE.md handoff
> commits, nothing code-bearing) — so no new promotion is pending.
> **Two open PRs currently stack on top of `staging`, neither merged yet:**
> [PR #67](https://github.com/claudiachez/stw-companion/pull/67) (`claude/week1-integrity-guardrails`
> → `staging`, migrations 054–058, the Limits/regime engine, integrity guardrails — see
> [`plans/integrity-guardrails-report.md`](plans/integrity-guardrails-report.md)) and
> [PR #69](https://github.com/claudiachez/stw-companion/pull/69)
> (`claude/portfolio-limits-redesign` → `claude/week1-integrity-guardrails`, the Settings/My Portfolio
> redesign — see "Previous handoff" under Current Status below). **Both are untouched pending host
> review — do not merge either yourself.** If you're picking up either PR's work, branch further from
> that PR's branch, not from `staging` (staging doesn't have this code yet).
> **A third branch, `claude/design-system-audit`, is pushed but has no PR open yet** — cut directly
> from `staging` (independent of PR #67/#69, no stacking), now holds all 4 planned phases of the
> design-system build (audit → tokens → core components → enforcement/migration plan) **plus all of
> Phase 5 (the page migrations, not part of the original 4-phase spec) — Settings, My Portfolio, GEX
> Signals, Stock Picks, and Macro are all done, AND (2026-07-07, after the host asked to confirm every
> page was covered) `Layout.tsx`/`LoginPage.tsx`/`IbkrBadge.tsx`** — the non-gated login/signup screen
> and the shared header/nav chrome rendered on every gated page in both apps, none of which were ever
> in migration-plan.md's original 5-page list despite being visible on literally every screen. **Every
> literal color/font-size in the whole repo is now either migrated or a documented sanctioned exception**
> (`GexChart.tsx`'s canvas API, `LoginPage.tsx`'s Google-brand-color icon) — `pnpm lint` passes clean
> with zero unaccounted violations. Don't open a `staging → main`-style PR for it yet; wait until the
> host asks (this branch has never been reviewed as a whole — only phase-by-phase).
> Migrations run to **053 on `staging`**; **054–058 exist only on the PR #67 branch** (and per
> [`plans/integrity-guardrails-report.md`](plans/integrity-guardrails-report.md) were already applied
> directly to PROD, with 058 PROD-only — sandbox has no `tiers`/`profiles` tables to apply it to). The
> design-system branch adds no migrations (frontend/CSS/tokens only).
> `app_config.ibkr_live_trading_enabled` = **`0` on both PROD and sandbox** (confirmed 2026-07-05 —
> sandbox was left on `1` from prior UI testing, now turned back off via the Config page).
> If migrations stop at 021 you are on a stale checkout, re-sync.
> **First commands every session:** `git fetch origin && git checkout staging && git pull --ff-only`
> — but check the branch notes above first: if your task continues PR #67, PR #69, or the
> design-system work, check out that branch directly instead of cutting fresh from `staging`.
> Otherwise, **cut a feature branch** before making any change: `git checkout -b
> claude/<short-feature-name>`. **Never commit directly to `staging`** — work on the branch, push it,
> open a PR back to `staging` (host merges/approves). `main` is promoted only by an approved
> staging→main PR (= a production deploy) — this is a standing approval gate, not a one-time
> exception; ask before opening a staging→main PR even if staging looks ready.
> (Note: `memory/` lives in local `~/.claude/`, NOT in the repo — never reference it in a prompt meant
> for a remote session; put anything a future session needs into the repo.)

## Ground Rules
- If instructions seem to conflict, **always ask before doing anything**
- **Never commit directly to `staging`** — cut a `claude/<feature>` branch first, every session (see
  Branch Strategy). `staging` auto-deploys on every push, so direct commits put unreviewed/in-progress
  work straight onto the deployed staging site.
- Never force-push or reset `staging` or `main`
- Never push to `main` without explicit approval — that is production
- Write shared styling/logic/data **once** in the shared packages, never twice across apps
- **Every timestamp uses `fmtDateTime` from `@stw/shared`** — never `toLocaleString`/`toLocaleTimeString` or a local date helper (see Conventions → Timestamps)
- **All UI changes must work on mobile** — design for ≤390px first; test layouts at narrow width before pushing
- **Refer to the host generically in prose, never by name** — specs, code comments, reports, and
  commit message bodies say "the host" (confirmed as a standing rule, 2026-07-05), matching existing
  practice throughout this file. Exception: literal technical identifiers that must stay accurate to
  be useful (an RLS policy's email, an org/task UUID) — those aren't narrative attribution and are fine
  as-is.
- **After ~10 commits in a chat**, run the Session Close routine (see section below)

---

## Current Status — Design system Phases 1–5 ALL DONE, whole-repo sweep also done (handoff 2026-07-07)

**Branch: `claude/design-system-audit`, cut fresh from `staging` (independent of PR #67/#69), pushed
to origin, no PR opened yet.** All four spec phases plus the full Phase 5 page-migration pass were
presented to the host at their checkpoints and approved before proceeding — see
[`plans/stw-design-system.md`](plans/stw-design-system.md) for the 4-phase spec (Audit → Tokens →
Core components → Enforcement/migration prep) and
[`docs/design-system/migration-plan.md`](docs/design-system/migration-plan.md) for the Phase 5 plan.
**Every page in the original plan is migrated: Settings, My Portfolio, GEX Signals, Stock Picks,
Macro.** After that, the host asked to confirm coverage was actually complete — gated *and*
non-gated pages, including login/registration — which surfaced a real gap: `Layout.tsx` (shared
header/nav chrome on every gated page, both apps), `LoginPage.tsx` (the non-gated login **and**
signup screen — one combined component, no separate registration page), and `IbkrBadge.tsx` (admin
header widget) were never in migration-plan.md's 5-page list and had never been touched. **All 3 are
now migrated too** — see the dedicated paragraph below. `pnpm lint` now passes clean with **zero
unaccounted violations repo-wide** — the only entries left in `eslint-suppressions.json` are two
documented, permanent, sanctioned exceptions: `GexChart.tsx`'s canvas-API colors and `LoginPage.tsx`'s
Google-brand-color icon (see [`CONTRIBUTING.md`](docs/design-system/CONTRIBUTING.md)'s Design Token
Rules section for why each is exempt). **This branch has never been reviewed as a whole** — only
phase-by-phase and page-by-page — so next session's job is deciding what happens to it (open its
first-ever PR to `staging`?), not further migration. See Next Steps #1 below.

**Whole-repo sweep (2026-07-07, same session as Macro) — `Layout.tsx`, `LoginPage.tsx`,
`IbkrBadge.tsx`:** 28 real violations fixed, 2 new sanctioned exceptions documented. Real bugs found,
not just literal-swaps: `Layout.tsx`'s `<STWLogo>` mic icon and `LoginPage.tsx`'s login tile both
hardcoded the dark theme's exact hex for their arrow/background regardless of active theme — fixed
onto `var(--acc)`/`var(--surface)`, so both now correctly re-color in light theme (verified live —
confirmed via `preview_inspect`'s computed styles, since screenshots showed a stale cached frame
during this specific check; the actual DOM/CSS was correct). 4 new theme-invariant tokens added for
the mic icon's fixed illustration grays (`--logo-mic-stand`/`-body`/`-outline`/`-grille` — brand-mark
artwork, never theme-adaptive even before this migration, same category as `--action-broker`).
`Layout.tsx`'s Sign Out red and `IbkrBadge.tsx`'s status dots turned out to be exact-value duplicates
of existing tokens (`var(--status-negative-text)`, `var(--c3)`/`var(--acc)`/`var(--c1)`), not new
colors. **New sanctioned exception**: `LoginPage.tsx`'s "Continue with Google" icon keeps Google's 4
official brand colors as literals (external brand mark — there's no sensible STW token for "Google's
blue"), documented in CONTRIBUTING.md and permanently suppressed the same way as `GexChart.tsx`.

**Macro phase (finished this session, 2026-07-07) — the last of the 5 migration-plan.md pages:**
14 files, 124 violations. Two real cross-file color duplications surfaced and got proper named
tokens in `tokens.css` (not file-local workarounds — this lint rule has exactly one sanctioned home
for any literal color): `--status-elevated` (#f97316 orange, "elevated caution" between amber-warning
and red-negative — was hardcoded independently in both `RegimeBanner.tsx`'s "Defensive" band and
`SentimentGauge.tsx`'s "Fear" label/gauge-arc segment) and `--sentiment-greed` (#14b8a6 teal,
`SentimentGauge.tsx`'s "Greed" band, deliberately distinct from Extreme Greed's `--c5` so the 5-band
scale doesn't read as a flat red/green gradient). `SentimentGauge.tsx` also had a real in-file
duplication — the same 5 zone colors were hardcoded once in `zoneFor()` and again, independently, in
the gauge's own `arc.subArcs` config — fixed by deriving both from one `ZONES` array. Two more
components were **deliberately not forced onto `KpiCard`/`DataTable`**, matching the same
information-preserving judgment calls made in Stock Picks: `ModuleScoreStrip.tsx`'s score-colored
`detail` text (KpiCard's `secondaryValue` always renders muted, which would mute exactly the signal
the strip exists to surface) and `TrendStructureTable.tsx`'s bucket-grouped rows (DataTable's flat
row-per-item model can't express a colSpan group-header row interleaved between data rows). Verified
live via the admin app in both themes; `pnpm -r typecheck`/`test`/`build` all green.

**Everything below this point (Phases 1–4, plus the Stock Picks/other-page notes) is unchanged from
the 2026-07-06 handoff — kept as the durable record of what was built and why.**

**Phase 1 (audit, read-only, host-approved) — 5 docs in
[`docs/design-system/audit/`](docs/design-system/audit/):**
- `00-structure-overview.md` — confirms Tailwind 3 + CSS custom properties (no CSS-in-JS to unwind);
  found the color-token source of truth (`index.css`) existed as two byte-identical hand-maintained
  copies across `apps/web`/`apps/admin`; catalogued 3 existing informal partial systems
  (`packages/ui/src/primitives/`, Macro's `macroVisuals.tsx`, and a `SectionHeader` CLAUDE.md
  documented as shared but was actually a private function in one file) to extend rather than
  replace.
- `01-style-value-inventory.md` — 48 distinct literal hex colors, **348 inline `fontSize` literals
  across 14 pixel values vs. only 56 uses of Tailwind's own type scale**, ~39 distinct padding
  combinations with no 4px rhythm, 8 border-radius values.
- `02-component-duplication-report.md` — walks all 10 spec-named component classes with file paths.
  Sharpest finds: `ConvictionBadge.tsx` hardcodes its own literal-hex tier-color map that 100%
  duplicates `TIERS` in `packages/shared/src/constants/tiers.ts` (already one import away);
  `TradesTable.tsx`/`SignalsTable.tsx` have byte-identical `th` style objects that have already
  drifted; two competing button-authoring mechanisms (Tailwind classes vs. inline `style` objects) for
  the identical primary-CTA role, with 5 same-role Save buttons in 5 different sizes.
- `03-responsive-mobile-conventions.md` — `useIsMobile()`'s `640` breakpoint is consistently used (8
  call sites, none override it) but was a bare literal, not a named token; the list+detail
  split/mobile-full-screen-swap pattern CLAUDE.md calls "canonical for any list+detail surface" exists
  in exactly one place (`PicksView.tsx`), unextracted; modal backdrop color is consistent (5/5) but
  vertical alignment is a real 2-vs-3 split, and `PositionEditor.tsx` — the file CLAUDE.md cites as
  the canonical *centered* example — is actually one of the 2 that top-anchor instead.
- `04-additional-inconsistencies.md` — a deeper adversarial pass. Two real bugs, not just drift:
  (1) `HoldingRow.tsx`/`HoldingDetail.tsx`/`SignalsTable.tsx` hardcode the **light theme's** exact
  P&L green/red hex regardless of active theme, so P&L text renders the wrong hue in the app's
  default dark theme today, not just on a hypothetical toggle; (2) inputs authored via inline `style`
  (`SettingsPage.tsx`, all three `FilterBar` variants) set `outline: 'none'` with no focus-state
  replacement at all, unlike Tailwind-class inputs which correctly pair it with `focus:border-acc` — a
  real keyboard-accessibility regression on `staging` today. Also: no icon library anywhere (90
  hand-typed Unicode glyphs + 4 files of hand-copied SVG that already share one consistent art style —
  `lucide-react` would directly consolidate this).

**Phase 2 (tokens, host-approved after an in-browser visual review) —
[`docs/design-system/tokens.md`](docs/design-system/tokens.md) is the full reference:**
- **Color**: consolidated the two duplicated `index.css` files into one canonical
  [`packages/ui/src/styles/tokens.css`](packages/ui/src/styles/tokens.css), imported by both apps
  (`@import` must precede `@tailwind` in the importing file — CSS silently drops an `@import` that
  isn't a stylesheet's first rule; caught this exact bug during in-browser verification and fixed it).
  Added the spec's required semantic roles as pure additions: `status.{positive,warning,negative,
  info,neutral,unevaluated}` (bg/border/text triples, for Phase 3's `StatusPill`), `--pnl-gain`/
  `--pnl-loss` (distinct identity from `--acc`/`--c1` even though same value today — this is the named
  fix target for the P&L color bug above, though the actual 3-file migration onto it is Phase
  4/follow-up work, not done this session), `--surface-hover`/`--surface-inset`, `--border-strong`,
  `--text-inverse`. **Fixed a real WCAG AA contrast failure in `--t3`** (muted/tertiary text) in both
  themes — dark `#525252→#808080` (~2.5:1→~5.0:1), light `#6b916b→#527052` (~3.4:1→~5.2:1) — this is
  the existing variable every current consumer already reads, so it's a value change, not a new token;
  visually reviewed side-by-side with the host before approval.
- **Everything else** (spacing, radius, shadow, motion, breakpoint, z-index, type scale) lives as
  plain JS in [`packages/shared/src/constants/tokens.ts`](packages/shared/src/constants/tokens.ts) —
  mirrors Tailwind's own already-shipped default spacing/radius scale rather than inventing a parallel
  one (components author almost exclusively via inline `style` objects, not Tailwind classes, per the
  Phase 1 audit). `useIsMobile()` now sources its breakpoint from `BREAKPOINT.mobile` instead of a
  bare `640` literal. Type scale collapses the 14 observed pixel values into 6 named sizes
  (`2xs`/`xs`/`sm`/`base`/`lg`/`display`) — reviewed visually with the host, approved as-is.
  **Deliberately did NOT remap Tailwind's default `xs`/`sm`/`base`/`lg` font-size keys** in either
  `tailwind.config.ts` — would have silently changed ~51 existing `text-xs`/`text-sm`/`text-lg` call
  sites by 1-2px; only added the two non-colliding new sizes (`2xs`, `display`).
- **No component/page file touched.** `pnpm -r typecheck` and `pnpm -r test` (152 tests, `@stw/shared`)
  both pass unmodified. Verified live via `apps/web`'s login page (no auth needed) in both themes —
  screenshots + `getComputedStyle` checks confirmed every new/changed CSS variable resolves correctly,
  no console errors, no failed requests.

**Phase 3 (core components, host-approved via the `/design-system` gallery route) — 13 components in
[`packages/ui/src/primitives/`](packages/ui/src/primitives/), all exported from `@stw/ui`:**
- The 9 spec-listed components (`StatusPill`, `Badge`, `KpiCard`, `SectionHeader`, `Button`,
  `DataTable`, `DetailPane`, `FormRow`, `EmptyState` extended in place, `AlertStrip`, `SubNav`) **plus
  `Modal`** (the Phase 1 addendum) **plus two more added on a second pass against the audit, after the
  host explicitly asked "is there anything Phase 1/2 found that isn't in the plan":**
  `ListDetailSplit` (the responsive split/mobile-swap *behavior*, extracted from `PicksView.tsx` — the
  audit's own instruction was that `DetailPane` "must bake in" this behavior, not just the static
  skeleton, so it ships as a paired component) and `Icon` (a scoped `lucide-react` wrapper — the audit
  recommended it directly, and the first pass's own `StatusPill`/`AlertStrip` had fallen back into the
  Unicode-glyph pattern the audit warned against, so they were retrofitted onto `Icon` too), plus
  `TextInput` (the actual accessible input control `FormRow` needed but didn't own — the audit's
  focus-accessibility finding named "`FormRow`/`Button`/**input primitives**" explicitly, and the first
  pass had only built the layout wrapper). `Badge` also gained a 5th kind (`action`, for
  `ActionBadge.tsx`'s New/Upsized/Trimmed/Closed pills, reading `ACTION_VARS`) and `StatusPill` gained
  a `neutral` variant (tokens.md already defined `status.neutral`; the first pass only exposed 5 of 6
  roles) — both were scope gaps in the initial 11-component build, caught on the same re-check pass.
- Every component consumes tokens only (verified: zero literal color/size values in
  `packages/ui/src/primitives/`); every business-concept prop is an enum/union (`BadgeKind`,
  `ButtonVariant`, `StatusPillVariant`, `AlertSeverity`, etc.) — no `color="..."` escape hatch anywhere.
- Visual review lives at `/design-system` in the admin app (nav item + route in `apps/admin/src/App.tsx`,
  component at `packages/ui/src/primitives/DesignSystemGallery.tsx`) — checked in both themes and at
  390px mobile, no console errors. `pnpm -r typecheck`, `pnpm -r test` (152 tests), and `pnpm build`
  (both apps) all pass. **No existing page/component file was touched or migrated** — per the hard rule.

**Phase 4 (enforcement + migration plan, host-approved) — full reference:
[`docs/design-system/CONTRIBUTING.md`](docs/design-system/CONTRIBUTING.md) (usage guide + semantics +
numeric-formatting/P&L rules) and
[`docs/design-system/migration-plan.md`](docs/design-system/migration-plan.md) (per-page order):**
- **Lint enforcement is real, not just documented** — this repo had zero lint tooling before this
  session. `eslint.config.mjs` (repo root, new `eslint`/`@typescript-eslint/parser` devDependencies)
  blocks literal hex/rgb colors and raw numeric `fontSize`s anywhere in `apps/**`/`packages/**`,
  exactly what the spec asked for (not a general lint overhaul). Run via `pnpm lint`.
  **`eslint-suppressions.json`** (repo root, committed) is a baseline snapshot of the **419
  pre-existing violations across 43 files** that existed the moment the rule shipped — `pnpm lint`
  only fails on violations outside that baseline, so it's clean today despite the real debt, but a
  brand-new literal anywhere fails immediately. `pnpm lint:prune` shrinks a file's baseline entry after
  it's migrated (and, deliberately, plain `pnpm lint` fails if you fix something and forget to prune —
  that's the tool nudging you, not a false alarm; see CONTRIBUTING.md's Enforcement section for why).
  Three files are permanently exempted, not "pending migration" — `constants/tiers.ts`,
  `constants/baskets.ts`, `constants/tokens.ts` — they're the actual token-source files for their color
  domains, so their own definitions are supposed to be literals.
- **The migration-order proposal replaced estimate with measurement**: every count in
  `migration-plan.md` comes directly from `eslint-suppressions.json`, not the Phase 1 audit's
  illustrative grep samples. This surfaced a real correction to the standing plan — CLAUDE.md had
  called My Portfolio "the biggest offender" and Stock Picks "closest to target," but the measured
  data shows **Stock Picks is actually the single largest migration surface by far** (190 violations
  across 17 files — `HoldingDetail.tsx` + `LegTimeline.tsx` alone are 88), and Macro (123) also
  dwarfs My Portfolio (40) and GEX Signals (39, only 33 of which is real debt — `GexChart.tsx`'s 6 are
  a sanctioned canvas-API exception). Settings-first and My-Portfolio-second are still correct, but for
  the reasons CLAUDE.md actually gave (smallest surface to prove the pattern; a pending redesign lands
  there anyway) — not raw count. Recommended order is now: **Settings → My Portfolio → GEX Signals
  (small, quick win) → Stock Picks (large but core, budget multiple sessions, fix the P&L-color and
  modal-centering bugs as an early sub-pass) → Macro (large but lowest urgency — newest code, least
  internally inconsistent already)**. Full per-file breakdown and the specific structural work each
  page needs (which files become `DetailPane`/`Modal`/`Badge` instances, not just literal-swaps) is in
  `migration-plan.md`.
- `docs/design-system/CONTRIBUTING.md` is the durable usage guide — which `Badge` `kind`/`StatusPill`
  variant to reach for and why, `Button` variant semantics, the numeric-formatting rules the spec asked
  for (tabular-nums, `formatPct`'s sign-display convention, a documented-but-not-yet-built `$46.2K`
  currency-abbreviation rule — no consumer needs it yet, so it's specified but not implemented), and
  the P&L color rule (`var(--pnl-gain)`/`var(--pnl-loss)`, never `var(--acc)`/`var(--c1)` directly, and
  never a literal — except `GexChart.tsx`'s sanctioned canvas exception).
- **No existing page/component file was touched.** `pnpm -r typecheck`, `pnpm -r test`, and `pnpm
  build` all pass; `pnpm lint` passes clean against the new baseline.

---

## Previous handoff (2026-07-06) — Settings/My Portfolio redesign shipped as PR #69

**This session's actual code work: a host-approved UX proposal, then a full build, for
Settings/My Portfolio**, landed as [PR #69](https://github.com/claudiachez/stw-companion/pull/69)
(`claude/portfolio-limits-redesign` → `claude/week1-integrity-guardrails`, i.e. **on top of the still-
open PR #67**, not on `staging` — see the top banner). Full proposal at
[`plans/my-portfolio-settings-redesign-proposal.md`](plans/my-portfolio-settings-redesign-proposal.md),
reviewed and approved by the host before any code was written (standing practice worth repeating for
similarly-sized UI changes — presenting the proposal first surfaced a real ambiguity, "how exactly do
Gross Exposure/Sector Concentration render on My Portfolio", that would have been a wrong-guess
otherwise). What shipped:
- **Settings now holds only account setup.** IBKR Connection + a pure `RiskConfigForm` (thresholds
  only, no sync button, no violation display) in a 2-column layout. One Sync button total (on the
  Connection card).
- **`LimitsPanel` split**: `RiskConfigForm` (Settings, both apps) stays; a new collapsible
  `ViolationsSummary` (`packages/ui/src/features/limits/ViolationsSummary.tsx` — gross-exposure
  progress bar, breach-only concentration rows with a "show all" expander, honest "Unmapped (no
  sector data yet)" labeling) moved to **My Portfolio**, gated by a new `canUseLimits` capability
  (wired via a `PortfolioRoute` wrapper in apps/web, same pattern as `PicksRoute`'s `canViewHistory`;
  admin gets it unconditionally). Admin's Limits tab now composes both pieces via a slimmed
  `LimitsPanel.tsx`.
- **Ticker click on My Portfolio opens an own-position detail pane**
  (`packages/ui/src/features/portfolio/PortfolioPositionDetail.tsx`) instead of navigating to STW's
  tracked position — tailing status vs. STW with an explicit "View STW's tracked position →" link
  (the old default-click behavior, now opt-in), a per-ticker risk/regime rollup, Open P&L (real) /
  Closed P&L ("coming soon" — the subscriber Flex sync still only returns open positions, see Next
  Steps #7 below, unchanged). Follows `PicksView.tsx`'s list+detail contract: desktop resizable split,
  mobile full-screen swap.
- **Four value-adds** on My Portfolio, all reusing data already flowing in (no new pipelines): sizing
  delta vs. the tailed pick ("You: X% · STW: Y%"), a declining-STW-conviction alert (reuses the
  existing `useConvictionChanges` batch classifier, filtered to tailed tickers), an advisory
  regime note under the Equity:Options card (same `regimeGate()`/STW→IWM proxy as the admin's
  `RegimeLight`, same "advisory, not a trade signal" framing), and a stale-sync banner past 24h.
- **Verified:** `pnpm -r typecheck` (all 4 workspaces) and `pnpm -r test` (187/187, `@stw/shared` —
  no logic changed, this was UI-only) both green. `ViolationsSummary`/`RiskConfigForm` verified live
  in-browser via apps/admin (shares the same components) — collapse/expand, gross-exposure bar, empty
  states, no console errors, both desktop and 390px mobile.
- **NOT verified: apps/web itself.** No real subscriber credentials were available in that session's
  environment, and apps/web points at the production Supabase project, so login wasn't attempted —
  the My Portfolio detail pane, the split/mobile-swap wiring, and the four value-add banners are
  typechecked but have never been seen rendering in a real browser. **Do this first if picking up
  PR #69** — it's the single biggest confidence gap left.

**Previous handoff (2026-07-05) — TwelveData rate-limit bug fixed + shipped to production, unchanged
since.** This session found the REAL reason the per-ticker regime badge never rendered: it
was never the "daily quota exhausted" cause diagnosed on 2026-07-03 — that was a real, separate event,
but the actual structural bug (still present after that quota reset) is that `tdBatchCloses()` bundled
many symbols into one comma-joined TwelveData call assuming that avoided the free tier's rate limit;
TwelveData actually bills **1 credit per symbol, not per HTTP call**, so any batch over 8 symbols
429'd unconditionally, every time — this was also silently degrading the already-shipped Macro tab
(Sector Rotation, Trend Structure, Volatility/Stress, Sentiment Gauge breadth all fire their own
uncoordinated batch calls on load). Fixed by chunking to ≤8 symbols with ~65s pacing (see "New this
session" below) — verified at the network level (429→200, pacing recovers across chunk boundaries),
merged to `staging` via PR #65, then promoted `staging → main` via PR #66 (host-approved) — **the
regime badge fix is live in production, but its actual visual render (the trend-structure chip
appearing on a held ticker) was NOT re-confirmed in-browser after the fix** — a cold load takes
several minutes to fully populate (paced ≤8 symbols/65s), so re-check on a real session rather than
assuming. The IBKR order flow remains **functionally verified in the browser but never tested against
a real IB Gateway** (no Gateway access from this environment) — unchanged from last session, still in
Next Steps. Below that, the Macro Dashboard v2 work from the 2026-07-02 handoff is unchanged — no
app/repo code changed there since except the rate-limit fix. That prior session (2026-07-02) also did
**out-of-repo routine maintenance only** (no commits):
fixed a dedup bug in the `stw-transcripts` routine (it edits Discord posts in place — see Data
Ingestion section for the durable rule), processed the missed Episode 29 webinar, and added a
verbatim portfolio-update archive step to `stw-friday-weighting`. None of this touched
`packages/`/`apps/`/`supabase/migrations/` — see Data Ingestion below if picking this up, otherwise
skip straight to Next Steps. The Macro tab's full v2 rebuild (spec:
[`plans/macro_dashboard_spec.md`](plans/macro_dashboard_spec.md)) is now **feature-complete and
QA-verified on `staging`** — all 11 modules, including the two that were previously deferred (P2 5D
trend engine, P3 Event Risk) and Sector Rotation. Read the spec first if extending any module.

**Architecture (the v2 fix):** the old single MA table mixed trend, stress, rates and positioning into
one bucket. Now each module answers one question, and the **Market Regime is a weighted score**, not a
row count: `Trend 30% · Volatility 20% · Credit 15% · Rates+Dollar 15% · GEX 20%` → 5 regime bands
(75+ Risk-On … 0–29 Risk-Off). **VIX and US10Y are NOT trend rows** — VIX lives in Volatility/Stress,
US10Y in Rates+Dollar. Pure scorers + 94 unit tests in `packages/shared/src/utils/macro.ts`.

**Built + on staging (`packages/ui/src/features/macro/`):**
- **Module 1 Regime Banner** (`RegimeBanner.tsx`) — score-derived band + trading-mode line; 5D direction descriptor slot wired (filled by P2).
- **Module 2 Module Score Strip** (`ModuleScoreStrip.tsx`) — per-sleeve score at a glance; 5D-delta slot (P2).
- **Module 4 Trend / Market Structure** (`TrendStructureTable.tsx`) — SPY/QQQ default, IWM/RSP/VEA optional (click ticker to toggle, no expert gate); **5-bucket** logic incl. *bear-market rally* (below 200D but bouncing ≠ bullish).
- **Module 5 Volatility / Stress** (`VolatilityStressCard.tsx`) — VIX, VVIX, IV Premium; percentile + 5D direction.
- **Module 6 Credit / Liquidity** (`CreditLiquidityCard.tsx`) — HYG proxy (labeled; HY OAS later).
- **Module 7 Rates + Dollar** (`RatesDollarCard.tsx`) — US10Y yield + UUP; flight-to-safety cross-check (falling yields during stress ≠ bullish).
- **Module 8 GEX / Positioning** (`GexPositioningCard.tsx`) — Graddox bias score + **SPY (SPX÷10) and QQQ** levels + trigger/implication.
- **Module 9 Risk Appetite** (`SentimentGauge.tsx`) — renamed from Sentiment; **`react-gauge-component`** library gauge; two-column (gauge ┃ breakdown); 7 inputs (Dollar dropped, Breadth added, percentile VVIX); each row shows its fear/greed word.
- **Module 10 Recap** (`MacroRecapCard.tsx` + `macro-recap.ts`) — **daily market note**, updated twice per weekday: pre-market AM (8am ET, `macro-recap-am.ts`) and post-market PM (4:30pm ET, `macro-recap-pm.ts`). Headline · verdict · big story · bull/base/bear · playbook · watching levels · final word. Grounded ONLY in passed data (no fabricated figures), Sonnet→Haiku fallback. **Persisted cross-device in Supabase** (`macro_daily_recaps`, migration 051, keyed by `date + session`). Written only by the scheduled functions or the admin Regenerate button (editor-only gate, hard 403); subscribers only ever read. Admin site has a session selector (AM/PM) on the Regenerate button. Both web and admin have their own `macro-recap.ts` function (site-scoped). The old `macro_weekly_recaps` table (migration 049) remains in the DB but nothing writes to it — can be dropped later.
- **Module 11 Sector Rotation** (`SectorRotationCard.tsx` + `useSectorRotation.ts`) — 11 SPDR sectors as per-sector cards, ranked leader-to-laggard by structure + 1M RS; each card has a `recharts` radar (RS vs SPY across Week/1M/3M/6M/1Y) plus "Leaders"/"Setting Up" chip rows (that sector's own constituents, not STW holdings). Built on `claude/sector-rotation-tooltips`, merged via **PR #61**.
- **P2 — 5D trend engine** (`useMacroTrendHistory.ts`) — daily snapshots via `macro_daily_snapshots` (migration 048), written by the `macro-snapshot` Netlify scheduled function at 4:30pm ET weekdays. Drives the banner's 5D direction descriptor, score-strip 5D deltas, and gauge 5D delta. **Note: `macro-snapshot.ts` was broken (used `@supabase/supabase-js` which crashes Node 20) — fixed 2026-07-02, but the table was still empty as of that evening — see the ⚠️ note in the DB section above; verify before trusting this module's 5D data.**
- **P3 — Macro Event Risk** (`useMacroEvents.ts` + `macro-events` fn + `MacroEventRiskCard.tsx`) — CPI/PCE/FOMC/NFP overlay, wired into `MacroView.tsx`.
- **Help**: every module header has a collapsible ⓘ (`ModuleHeader`) — tap to expand a "what/why/how" blurb; collapsed by default.

**DB — migrations 048–051 applied on both PROD and sandbox (re-verified 2026-07-02):**
- `048_macro_daily_snapshots` — written by `macro-snapshot` scheduled fn (4:30pm ET weekdays); table
  includes its own `module_scores`/`indicator_scores` JSONB columns directly (no separate scores migration)
- `049_macro_weekly_recaps` — legacy, nothing writes to it now (replaced by 051)
- `050_run_log_latest_view` — **unrelated feature**: a subscriber-safe `run_log_latest` view (one row
  per `run_type`) backing the GEX Signals "Checked: …" stamp. (Earlier handoffs called this
  "050_macro_snapshot_scores" — that migration doesn't exist; this was a documentation error, now fixed.)
- `051_macro_daily_recaps` — written by `macro-recap-am/pm` scheduled fns + admin Regenerate; RLS read-only for `authenticated`

**⚠️ Unverified this session:** `macro_daily_snapshots` (048) was still **empty on PROD** as of
2026-07-02 ~7:48pm ET, well after the 4:30pm ET scheduled run and after the `macro-snapshot.ts` fix
(commit `3aa5528`) was pushed to `staging` earlier the same day. `macro_daily_recaps` (051) DID get a
fresh PM row that day, confirming scheduled functions are firing on this branch/site — so either the
snapshot function needs another scheduled cycle to prove out, or it's still failing silently. **Check
`macro_daily_snapshots` for a row dated 2026-07-02 or later before trusting the 5D trend engine.**

**Netlify env vars required:**
- Web site: `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_TWELVEDATA_KEY`
- Admin site: `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`
- Optional: `MACRO_RECAP_MODEL` (overrides default claude-sonnet-4-6 → haiku fallback)
- **All Netlify functions now use `.trim()` on env vars** to guard against pasted-key whitespace.

**✅ Production deploy done (2026-07-05):** `staging → main` promoted via PR #66 (host-approved) —
everything since the 2026-06-23 event-sourcing promotion, including PRs #50–#65 and all Macro
Dashboard v2 + QA + regime-badge/IBKR-trading + rate-limit-fix work, is now live on production.
`staging` and `main` are identical as of this handoff. Any future promotion still needs **explicit
approval** — this is a standing rule, not resolved by precedent.

**Event-sourcing migration plan is CLOSED (on `main` since 2026-06-23) — do not reopen.** The weight model,
locked decisions, and Phase-5 routine semantics below remain authoritative reference.

**Why:** the old editor was split-brain — it wrote BOTH `legs` (directly) and `leg_transactions`, which
fought on save, diverged, and stamped synthetic dates. Now committed to **true event-sourcing**:
`leg_transactions` (**the diary**) is the only hand-written source; `legs` (**the scoreboard**) is a pure
trigger-derived projection. The editor + ledger write ONLY events.

**Weight model (host-confirmed, corrected 2026-06-18):** a diary row's `weight` = that leg's **lot**
(BUY) or **remaining** (SELL, 0 on full close). **BUYs accumulate** → `legs.weight = Σ BUY lots − sells`.
So **Initial position weight = Σ open legs' lots** (computed from the diary = `positionWeight().current`;
tracks current lots, falls after a trim) and **Current position weight = `holdings.current_weight`** —
the live weight **the routines restate weekly** (NOT Σ legs). Both display read-only in the editor; the
hand-typed `initial_weight` field is gone and the editor no longer writes `initial_weight`/`current_weight`
(routines own current; legs own initial). The earlier "Current = Σ open legs; Initial = typed" wording was
wrong — host confirmed the swap. The 90:10 (equity:options) / 20:80
(short:long) split is only the **default** for computing lots when the host gives a total with no per-leg
detail — held in `app_config`, with a per-position override on `holdings.equity_pct`.

**Phase 1 DONE ✅ + verified on SANDBOX** (`040_sandbox_verify.sql`):
- **Migration `040_legs_event_sourcing.sql`** — `leg_transactions += action_label`; `holdings +=
  equity_pct`; new `app_config` table (split defaults 0.90 / 0.20); **trigger 030 rewritten** to fire on
  INSERT/UPDATE/DELETE, replay the diary, accumulate BUY lots, and **book realized on trims** (slice-weighted).
  Requires **037 + 039** first. (`host_quote` was added then removed — Notes is the single field.)
- `@stw/shared`: `deriveLegWeights` rewritten (90:10 / 20:80, expiry-aware, pins preserved) + new
  `positionWeight()` (Σ open legs). 45 tests green.

**Phase 2 DONE ✅ + verified on SANDBOX (browser):**
- **`PositionEditor`** = position fields + `equity_pct`; **Current weight computed** (read-only), **Initial
  weight editable**; open legs shown read-only (leg CRUD lives in the ledger — one edit surface).
  "Last Action Date" label; each open leg shows its open date.
- **`LegTimeline` = editable Transaction History ledger** (writes only `leg_transactions`): `+ Add event`
  (incl. new legs: Instrument {Shares/Call/Put} + Direction {Long/Short}), per-row ✎/✕ edit/delete,
  columns **Date · Action · Details · Price · Weight · Notes** (Details holds "Shares"/`$30C Sep '26`;
  one **Notes** column), newest-first, table on desktop / cards on mobile, **open/closed/all toggle**,
  **closed-leg rows dimmed** + "Closed"/"Expired" muted gray.
- **Resizable split** in `PicksView` — drag the divider between the list and the detail (15–80%) on
  desktop. **On mobile, the opened detail takes over the full screen** instead — the sub-tabs and filter
  bar hide entirely (`mobileDetail` in `PicksView.tsx`), and `onClose` returns to the list. This is the
  canonical list+detail pattern for any list+detail surface, not just Ticker Details: desktop shows both
  panes side-by-side; mobile never crams both into a narrow viewport — one pane takes over at a time.

**Phase 3 DONE ✅ + verified on SANDBOX (CXDO/IRDM):** detail-card P&L split per asset class, never
blended — **Open** shows Shares/Options return + lot; **Closed** shows per-asset return + portfolio
contribution. `closedPnlPct` + `closedPnlContribution` + `hasClosedPnl` in `@stw/shared`.

**Post-import holdings fix (Next Step #2) DONE ✅ on SANDBOX:**
- **`last_action`/`action_date` derived from each ticker's latest diary event** (`plans/post_import_holdings_fix.sql`).
  Same-day conversion ties (ADEA/CXDO/FIVN/GDYN/SHLS) resolve to the keep-open `New`; `Expired` →
  `Closed` at the holding level (last_action has no "Expired"). (At import time AMZN/HOOD/TSLA had no
  legs and were skipped — but that was a transient state, NOT a rule; **the host has since added real
  legs to the legacy names on PROD (2026-06-23)**. See the legacy-positions decision below.)
- **Baskets/categories** assigned from the 6/18 sector groupings; 3 new categories created
  (**AI Fraud / Verified Identity**, **Space & Satellite**, **Nuclear**); **IRDM moved Defense → Space & Satellite**.
- **Initial weight for fully-closed positions** now shows the closed legs' entry lots instead of blank —
  new shared helper **`displayInitialWeight`** wired into BOTH `HoldingDetail` (detail card) and
  `PositionEditor`. ARKK reads `1% → 0%`. 54 tests + typecheck green.
- **`revert_legacy_category.sql` applied** — removed the mistaken "Legacy Positions" category;
  AMZN/HOOD/TSLA are Uncategorized (Legacy is their **conviction tier**, not a sector).

**DB state — BOTH environments now on the event model (2026-06-19):**
- **PROD (`usmqbohcjcyszjxxvnqu`):** 038 + 039 + 040 + the import + `post_import_holdings_fix.sql`
  applied. **Verified: 42 legs / 60 diary rows**, last_action/action_date/baskets correct, reconciles to
  6/18. **STILL TODO on PROD: run `revert_legacy_category.sql`** — PROD has a *pre-existing* "Legacy
  Positions" category (old system) that AMZN/HOOD/TSLA still use; the env-agnostic revert clears it.
  Conviction on PROD is left to the routines (some cores not yet tier 5).
- **SANDBOX (`uolabcgbnrkhzpwuvzlk`):** same scripts + the revert all applied. Admin dev `.env.local` →
  sandbox, so **localhost reads/writes the sandbox directly**. 25 tickers / 42 legs.
- **PROD import gotchas (baked into `plans/prod_import/*` + the SQL files):** (1) PROD's STW
  `trader_id` = `64a779f9-13ba-4cb4-824b-d70dcab3a49b` (sandbox = `9ec36b89-…`); seeds now resolve the
  trader **by name**. (2) The Supabase SQL editor threw "Failed to fetch" on the one big import — it was
  split into 9 small files in **`plans/prod_import/`** (run `1_wipe` → `8_legs` → `9_weights` in order).
  (3) The wipe deletes **all** legs (PROD carried 28 stale ones from the old 029/030 system) with the
  `trg_leg_transactions_sync` trigger disabled during the delete.

**Decisions locked (see spec):** event-sourced; ledger-only leg editing (inline modal editing **deferred**);
one Notes column; trims book realized; >2 option legs split even; ledger newest-first; **a "convert to
shares" close is a real cash sale → book the option's actual exit price as realized P&L, never $0** (host
2026-06-18); **ledger Action verb = bold green for OPEN-leg events, plain gray for CLOSED-leg events**;
**P&L is split by asset class (Shares vs Options), never blended** — Open shows per-asset return + lot;
Closed shows per-asset return + **portfolio contribution** (return × sold weight), so a +600% option on a
thin slice reads as its true ~+3.6% portfolio impact (host 2026-06-18). P&L Breakdown is open-legs-only.
**"Legacy" is a conviction tier (Tier 6 / `c0`), NOT a sector/category** (host 2026-06-19). **Legacy /
low-conviction does NOT mean "no legs/data"** — every position the host actually holds carries leg +
transaction data regardless of tier, **especially while still open**; the host added real legs to the
legacy names (AMZN/HOOD/TSLA) on PROD (host 2026-06-23). So a tier-0 holding with open legs is normal —
never treat low conviction as a reason to leave a held position without legs. **Conviction is
owned by the routines** — set in the streaming run, never in a seed/migration (so the post-import fix does
NOT touch conviction; the 6/18 stars OSS/VPG/SYNA/VIAV/NBIS/ENS/AMKR/LEU/AMZN/TSLA are the routines' job).

**Decisions locked — admin IBKR trading (host 2026-07-03):** real order placement is **admin-only,
local-proxy-only, single-account** — extending it to arbitrary subscribers is explicitly out of scope
without a separate legal/compliance review and a different integration entirely (IBKR's Client Portal
Web API, or Alpaca's OAuth trading API per `plans/mobile-transition.md`); don't build toward it
incrementally. **Legs stay weight-only (%) forever** — real share/contract quantities are never derived
from weight and are always entered directly at order time (there is no plan to add share/contract
counts to the `legs`/`leg_transactions` schema). A confirmed broker fill is the only thing allowed to
patch a diary row's price after the fact — the requested/limit price never is, same rule as every other
close in this ledger.

**New plan docs (`plans/`):** `legs_event_sourcing_redesign.md` (spec) · `import_open_positions.sql`
(clean open-position import) · `post_import_holdings_fix.sql` (Next Step #2 seed) ·
`revert_legacy_category.sql` (drops the bad Legacy category) · `040_sandbox_verify.sql` (trigger test) ·
`legs_inspect.sql` (inspect legs/diary) · `zzadea_populate.sql` (seed test fixture).

**Tooling:** `pnpm` not on PATH — use `corepack pnpm …` or `~/.local/bin/pnpm`. No local Postgres (can't
run DDL locally — apply migrations via the Supabase SQL editor). Prod service key (read-only checks) at
`~/Documents/Claude/Scheduled/.supabase-service-key`. Sandbox anon key in `apps/admin/.env.local`.

**Phase 5 DONE ✅ (2026-06-19) — routines on the 040 event model** (out-of-repo
`~/Documents/Claude/Scheduled/*`; SKILL.md edits, not committed). All four updated:
- **morning + afternoon:** STEP 2.3 / STEP 3 rewritten — diary `leg_transactions` (`action_label` +
  `notes`=host's verbatim words) + **direct `holdings` PATCH** of `last_action`/`action_date`/
  `current_weight`; **`holding_transactions` path retired** (the still-live 033 trigger auto-logs a
  harmless audit row). **Lot semantics:** BUY weight = lot **added**, SELL = **remaining** (cost basis).
  **Split (90:10 / 20:80 from `app_config` + `holdings.equity_pct`) is initial-sizing fallback only —
  existing legs are NEVER re-split.** Upsize = keep existing legs, add the increment to the **named**
  leg (FIVN worked example baked in). Contract→shares = close option at real exit (never $0) + new
  shares leg **inherits the replaced leg's weight** (net-neutral); same-day close+open keeps the
  position open (`last_action` = the opening verb). Trim uses **cost-basis remaining**; an appreciated
  winner stated only in market % → **flag**, don't guess. `action_date` = the host's action date,
  written only by a real action.
- **friday-weighting:** direct `current_weight` PATCH (no `Hold` rows); **truth-up mismatch (snapshot ≠
  Σ lots, e.g. IRDM +600%) → flag, never rewrite lots**; legs reconcile adds missing only; **new STEP
  4d status-aging** — `action_date` older than the **previous** snapshot → `last_action='Hold'`
  (`action_date` preserved); Closed/Expired terminal.
- **transcripts:** conviction note — routine-owned, **mutable both ways on an explicit signal incl.
  promoting a Legacy (0)**; never inferred from sizing.
- **One-time SQL applied (PROD + sandbox):** `plans/conviction_618_stars.sql` (8 stars → tier 5;
  AMZN/TSLA stay 0) + `plans/fix_fivn_shares_weight.sql` (FIVN shares lot 3.5→2.5, net-neutral 6.0%).
- **PENDING (host) — NOT a repo task, doesn't affect the apps:** the stale **`gradoxx-daily-summary`**
  Cowork scheduled task (duplicates morning PART 1's Graddox) is an **orphaned backend object** — it
  still fires ~9am but has no working delete UI (absent from Cowork→Scheduled; its task page 404s; the
  delete API is desktop-client-gated). Task UUID `8377c152-0ffa-474d-9ec0-2281a92edb26`, org Claudia Chez
  `aea1699f-e0b8-4ed4-80b9-4abb5d0a7711`; the underlying skill is `skill_01UY6zPNf9Do8eR4voyUvtm6`. Being
  cleared via Anthropic support / desktop skill-delete. Also smoke-test the routines on their next live runs.

## From the 2026-07-05 session (staging → main — committed, pushed, promoted)

Picked up where 2026-07-03 left off: re-checked the regime badge, found the real bug behind it, fixed
it, shipped it to production, then separately investigated + fixed a live data-integrity report.

- **Root-caused + fixed the TwelveData rate-limit bug** (`packages/ui/src/features/macro/maCache.ts`,
  `useSectorRotation.ts`) — the regime badge was STILL blank after the 2026-07-03 daily-quota window
  reset, confirming it was a different, deeper bug: `tdBatchCloses()` assumed bundling many symbols
  into one comma-joined TwelveData call avoided the free tier's rate limit. It doesn't — TwelveData
  bills **1 credit per symbol, not per HTTP call** (confirmed directly: "12 API credits used, limit
  8"), so any batch over 8 symbols 429'd unconditionally, forever, regardless of waiting. This was
  ALSO silently degrading the already-shipped Macro tab (Sector Rotation's 12-symbol sector batch,
  Trend Structure's SPY/QQQ/IWM/RSP/VEA, Volatility's VIX/VVIX, Rates+Dollar's UUP, Sentiment Gauge's
  ~15 breadth stocks all fire independently on load with no shared rate budget). Fixed by chunking
  `tdBatchCloses` to ≤8 symbols per call, paced ~65s apart (shared constants with the existing
  `fetchClosesChunked` helper, whose own default delay of 2000ms was also too short and got corrected
  to match). **Verified at the network level** in-browser: confirmed chunked requests return 200
  instead of 429, and pacing correctly recovers across chunk boundaries — but did NOT re-open a ticker
  detail page afterward to visually confirm the badge chip itself renders (a cold load takes several
  minutes to fully populate at this pacing). **Tradeoff accepted by host:** first Picks/Macro load each
  day is slow (several minutes) instead of failing outright; cached 24h after. One narrow residual gap:
  two independently-paced hooks (Sector Rotation + Ticker Regime) can still collide at their handoff
  boundary and drop one chunk for that session — those few tickers just show no badge until the next
  paced cycle or next day's cache refresh, no crash. Typecheck + 152 tests green. Merged via
  [PR #65](https://github.com/claudiachez/stw-companion/pull/65).
- **`staging → main` promoted** via [PR #66](https://github.com/claudiachez/stw-companion/pull/66)
  (host-approved) — 104 commits, everything since the 2026-06-23 event-sourcing promotion is now live
  in production, including this session's fix.
- **Investigated a host-reported data-integrity concern from a prior session** ("VPG and TENB each have
  two identical duplicate OPEN legs... MITK has 3 OPEN legs... LEU has a probable year-typo in
  action_date"). Verified directly against PROD (`usmqbohcjcyszjxxvnqu`) rather than trusting the old
  claim or the host's own screenshot-based re-check:
  - **VPG/TENB "duplicate legs" — false alarm, confirmed.** Each has exactly 2 distinct `legs` rows
    (one SHARES + one OPTION) opened the same day as a single combo entry — different `leg_id`,
    different `instrument_type`/strike. Not a parser bug; a normal shares+option combo position. The
    prior claim almost certainly misread "same ticker, same date" without checking instrument type.
  - **MITK "3 open legs" — real, but legitimate.** SHARES (2.9%) + two different-expiry calls ($12.5C
    Nov'26 1.8%, $12.5C Jan'27 1.7%) — a deliberately layered position built via separate
    Upsized/rolled ledger events (notes confirm "raising total weighting to 6.4%" = 2.9+1.8+1.7). Not
    a duplicate.
  - **LEU year-typo — confirmed real, and fixed on both PROD + sandbox.** The host had already
    corrected the leg's open date in the UI (`legs.opened_at`/`leg_transactions.executed_at` both
    correctly read 2025-05-21), but **`holdings.action_date` is a separate write path** — the
    editor's own `PositionEditor.tsx` exposes it as an independently-editable field — and it still
    read `2026-05-21`, a year off. Corrected directly via SQL to `2025-05-21` on both PROD and
    sandbox (kept `last_action` untouched: `Hold` on PROD, `New` on sandbox — only the date was
    wrong). **Standing lesson, now in Conventions below:** fixing a leg's date via the ledger does
    NOT auto-correct `holdings.action_date` — always check both when correcting a date.

## Next Steps

1. **Design system migration is now fully done, repo-wide — decide what happens to
   `claude/design-system-audit` next, don't keep migrating.** All 5 planned pages (Settings, My
   Portfolio, GEX Signals, Stock Picks, Macro) plus the non-planned shared/non-gated surfaces
   (`Layout.tsx`, `LoginPage.tsx`, `IbkrBadge.tsx`) are migrated and host-checkpointed; see Current
   Status above and [`docs/design-system/migration-plan.md`](docs/design-system/migration-plan.md) for
   the full history. `pnpm lint` passes clean with zero unaccounted violations — only 2 permanent,
   documented sanctioned exceptions remain in `eslint-suppressions.json` (`GexChart.tsx`'s canvas API,
   `LoginPage.tsx`'s Google-brand-color icon). **This branch has never been reviewed as one whole
   diff** — only phase-by-phase and page-by-page. Ask the host before opening its first-ever PR
   (`claude/design-system-audit` → `staging`). Check out the existing branch, don't cut a new one:
   `git fetch origin && git checkout claude/design-system-audit && git pull --ff-only`.

2. **Get PR #67 and PR #69 reviewed and merged** (in that order — #69 is stacked on #67). Before
   merging either: (a) apps/web browser verification for #69 (see the PR #69 handoff below — never
   actually confirmed live), (b) PR #67's own deferred items — Item 0's live cron verification and
   Item 3's regime_daily backfill, both still not run (see
   [`plans/integrity-guardrails-report.md`](plans/integrity-guardrails-report.md) for exact status).
   Do not merge either PR yourself without host approval, per standing rule. Once merged, revisit
   whether the design-system Phase 3/4 components should retroactively cover PR #69's new surfaces
   (`LimitsPanel`, `ViolationsSummary`, `PortfolioPositionDetail`) — they weren't in scope for the
   Phase 1 audit since they hadn't merged yet.

3. **Visually confirm the regime badge actually renders** now that the rate-limit fix is live. Open a
   held ticker's detail page (or the Picks list at normal width) and check for the trend-structure
   chip — allow several minutes on a cold load (paced ≤8 symbols/65s) before concluding it's still
   broken. If it's blank even after a full population cycle, that's a new, third bug — don't assume
   it's the same root cause as the last two.

4. **Live-test the admin IBKR order flow against a real IB Gateway** — cannot be done from this
   environment. In order: (1) `IB_PORT=4002 python3 ibkr_proxy.py` against Gateway in **paper** mode,
   (2) place a real paper order end-to-end from the "Open via IBKR" modal, confirm the fill patches the
   diary row's price correctly, (3) test "Close via IBKR" on an open leg, (4) only after both work
   cleanly, consider port 4001 (live). Flag if `/order_status`'s `reqAllOpenOrders`/`reqCompletedOrders`
   lookup doesn't find a previously-placed order from a new connection.

5. **Phase 4 admin Manage area, Parts B/C — still not built** (Part A, Config, shipped 2026-07-03).
   Spec: [`plans/phase4_admin_manage.md`](plans/phase4_admin_manage.md). **Categories CRUD**
   (delete-guarded — block or reassign-to-Uncategorized on delete) and **Traders** (read-only
   recommended — only 2 seeded, FK'd everywhere, high-risk/low-value to make editable). No migrations
   expected.

6. **Verify `macro_daily_snapshots` (migration 048) is actually populating** — still confirmed **empty
   on PROD as of 2026-07-05**, well after the `macro-snapshot.ts` fix (commit `3aa5528`, 2026-07-02)
   shipped. `macro_daily_recaps` (051) IS getting fresh rows, so scheduled functions are firing on this
   site — either the snapshot function needs more scheduled cycles, or it's still failing silently.
   Check Netlify function logs for `macro-snapshot` before spending more time re-diagnosing from the DB
   side alone.

7. **Macro Dashboard — remaining roadmap item** (spec: [`plans/macro_dashboard_spec.md`](plans/macro_dashboard_spec.md)).
   All 11 modules are built and in production. The one item left from the spec:
   - **Portfolio Heatmap** — treemap block on `PortfolioDashboard`, box ∝ `current_weight`,
     Today/Total + By Basket/All toggles. Spec § "Phase 4: Portfolio Heatmap".

8. **Overview/experience enrichment (host-requested, queued).** Stop the click-each-ticker experience:
   - **Transcripts library tab** — a NEW subscriber-facing **episode recap** (host's *trading psychology* +
     that episode's *per-ticker commentary*). **NOT** the local methodology `.md` files (apps never read those).
     Needs a new `webinars` table written by `stw-transcripts` + a new tab.
   - **Global Activity Feed** — one cross-ticker, reverse-chron feed merging Commentary + Transactions across
     all holdings, filterable. No schema (reads `conviction_comments` + `leg_transactions`). Low-cost.

9. **Subscriber closed-position P&L history — explicitly postponed by the host, design already
   researched.** The subscriber IBKR Flex query returns *open positions only* and the sync is
   delete-all-then-insert; closed history needs a genuinely different append-only, dedup-on-execution-id
   sync (a second Flex Query template + a new `user_closed_trades` table). Don't build until the host
   asks again. **Note:** the My Portfolio detail pane (this session) already surfaces this gap
   honestly to users as a "Closed position history — coming soon" placeholder rather than hiding it.

10. **Future features (not migration work):** inline 2-line leg editing in the modal (deferred); `$100k`
    notional + SPY benchmark (the `spy_daily` table from migration 032 already exists; the population
    cron + benchmark UI are unbuilt).

**Sandbox gaps (not blocking, dev-only):** (a) the **`prev_conviction_level` backfill** was never run on
sandbox, so the Conviction Changes block won't render there until it is (or until a real batch lands); (b) the
`recent_changes` view (migration 008) was never applied to sandbox, so **"Latest Portfolio Changes"** hides
there. Both render fine on PROD. Apply them to sandbox only if you want those blocks locally.

---

## One Monorepo, Two App Shells

This is a single pnpm workspace. Two thin app shells consume the same shared
packages and differ only by **capability**, never by forked components.

| App | Audience | Folder | Capabilities |
|---|---|---|---|
| Subscriber web | Subscribers | `apps/web` | Supabase auth + tier paywall (`AccessGate`); Portfolio page + IBKR Flex Query subscriber connection; Settings page (`/settings`) |
| Admin dashboard | STW editor | `apps/admin` | No paywall; Edit form, Users tab, Config page, IBKR badge + proxy writer + real order placement |

Each deploys to its own Netlify site from the **same branch** (base dir differs).

---

## Repo Structure

```
pnpm-workspace.yaml          → packages/*, apps/*
package.json                 → workspace scripts (dev:web, dev:admin, build, typecheck, test, lint)
eslint.config.mjs            → design-token lint enforcement (Phase 4 — see Design System section)
eslint-suppressions.json     → pre-Phase-5 violation baseline (committed; shrinks as pages migrate)
packages/
  shared/  (@stw/shared)     pure framework-agnostic logic: types, tiers, baskets,
                             format, options, pnl, filters, design tokens (+ unit tests)
    src/constants/tokens.ts  spacing/radius/shadow/motion/breakpoint/z-index/type-scale
  ui/      (@stw/ui)         shared React: feature pages/components, data hooks,
                             supabase/query-client factories, AppCapabilities context
    src/styles/tokens.css    canonical color tokens — both apps' index.css import this
    src/primitives/          design-system component library (StatusPill, Badge, KpiCard,
                             SectionHeader, Button, DataTable, DetailPane, ListDetailSplit,
                             FormRow, TextInput, EmptyState, AlertStrip, SubNav, Modal, Icon)
apps/
  web/                       subscriber shell: router, Layout, auth, AccessGate
    netlify/functions/
      ibkr-flex.ts           serverless IBKR Flex Query proxy (JWT-auth, never exposes token)
    netlify.toml             (Netlify base dir = apps/web)
  admin/                     admin shell: no paywall, Edit + Users + Config + IBKR (pricer + order placement)
    ibkr_proxy.py            local IBKR writer (run on your machine, not deployed)
    netlify.toml             (Netlify base dir = apps/admin)
    /design-system route     visual review gallery for the component library (admin-only, not linked from apps/web)
supabase/migrations/         001..053 — single source of truth for DB schema/RLS
docs/design-system/          audit reports, tokens.md, CONTRIBUTING.md, migration-plan.md (see Design System section)
CLAUDE.md                    this file
```

### Layer rules (keep them honest)
- `@stw/ui` takes everything via **props/context** — no app-specific imports, no env,
  no routes. The Supabase client + `VITE_*` env are created in each app and injected.
- Admin/subscriber differences flow through **one `AppCapabilities` context**
  (`isAdmin`, `canEdit`, `onEditHolding`, `showIbkrBadge`, `onExecuteIbkrOrder`) — never scatter
  `isAdmin` checks deep in shared components. `onExecuteIbkrOrder` is the one capability that reaches
  outside the app entirely (the local IBKR proxy) — it's wired only in `apps/admin/src/main.tsx`;
  `apps/web` never sets it, which is what actually keeps real order placement out of the subscriber app
  (not just a UI-level gate).
- `@stw/shared` is the only home for derived-number logic (P&L, weights, sector %, date formatting).
  Don't re-implement it in an app. (End state: move the math into Supabase views/RPC.)

---

## Branch Strategy

| Branch | Purpose | Deploys to |
|---|---|---|
| `main` | Production | both Netlify sites — prod |
| `staging` | Trunk / staging | both Netlify sites — staging |

Feature branches: `claude/<feature>` → branch from `staging` → PR to `staging` →
PR `staging` → `main` when approved. **This is enforced, not aspirational** (host 2026-07-03, after a
~2-week drift where ~18 commits landed on `staging` directly — see the top banner's "Known exception")
— `staging` auto-deploys to both Netlify staging sites on every push, so a branch is what keeps an
in-progress/broken commit off the deployed site until the PR actually merges. Every session cuts one,
every session.

```bash
git checkout -b claude/my-feature origin/staging
# work across packages/* and apps/*; shared change is written once
git push -u origin claude/my-feature
# PR → staging for review, then staging → main when approved
```

---

## Local Development

```bash
pnpm install            # installs the whole workspace
pnpm dev:web            # subscriber app (Vite)
pnpm dev:admin          # admin app (Vite)
pnpm build              # pnpm -r build across packages + apps
pnpm typecheck          # pnpm -r typecheck
pnpm test               # unit tests (@stw/shared)
pnpm lint               # design-token enforcement (eslint.config.mjs) — fails on new violations only
pnpm lint:prune         # run after migrating a file off literal colors/font-sizes; commit the result
```

Env: each app needs `VITE_FINNHUB_KEY` (live prices) and the Supabase URL + anon
key (in `.env`, gitignored; see `apps/web/.env.example`).

---

## Deployment (Netlify)

Two sites, one repo, same branch — distinguished by **base directory**:
- Web site: base dir `apps/web`, build `pnpm install && pnpm --filter web build`, publish `dist`
- Admin site: base dir `apps/admin`, build `pnpm install && pnpm --filter admin build`, publish `dist`

`staging` branch → staging deploy; `main` → production (requires approval). Build
config lives in each app's `netlify.toml`; base dir + env vars are set in the
Netlify dashboard.

**Build-skip:** with a base dir, Netlify by default skips a build when nothing in
that dir changed — which silently dropped shared `packages/**` updates. Each
`netlify.toml` now has an `ignore` command that builds when the app dir, any shared
package, or a root manifest (`pnpm-lock.yaml`/`package.json`/`pnpm-workspace.yaml`)
changed, and skips doc-only commits. So a `packages/**` change now correctly rebuilds
both sites.

Add each Netlify URL to Supabase Auth → URL Configuration → Redirect URLs (Google
OAuth on web does a full-page redirect).

---

## Database (Supabase)

- Project: `usmqbohcjcyszjxxvnqu.supabase.co`; client created per-app and injected into `@stw/ui`.
- `supabase/migrations/` is the single source of truth (through **053**).
  **Claude authors migrations; you apply them** via the Supabase SQL editor / `supabase db push`.
- **Local DB backups → gitignored `backups/`** (never committed — may carry PII), named
  `<date>_<purpose>.json` (e.g. `*_pre-coldrop.json`). Take a fresh logical snapshot of the
  affected tables before any destructive migration (column/table drop). The Supabase MCP has no
  `pg_dump`; pull tables via the REST API with the service key, or `select json_agg(...)`.
- Tables: `holdings`, `signals`, `profiles`, `tiers`, `run_log`,
  `user_positions`, `holding_transactions`, `conviction_comments`, plus the event-sourced
  `legs` / `leg_transactions`, `categories`, `traders`, `app_config`.
  RLS on `holdings`/`signals` restricts writes to `cc@claudiachez.com`. `user_positions`
  uses user-owned RLS — each subscriber reads and writes only their own rows.
  The admin IBKR proxy now prices STW's option legs and writes **`legs.mark_price`** (the old
  `last_pnl_*` / `ibkr_legs` columns on `holdings` were dropped in 034).
- **Transaction History is auto-logged by a DB trigger** (`stw_log_holding_transaction`,
  migration 016): any non-`Hold` change to a `holdings` row's `last_action`/`action_date`
  writes a `holding_transactions` row — so every writer (admin Edit form *and* the external
  scheduled routines) is captured with no client code. A dedupe guard on
  `(ticker, leg, action, event_date)` makes idempotent script re-runs safe. The admin
  "+ Add Event" form is a manual backup (a direct insert that doesn't touch `holdings`,
  so it never double-fires the trigger). This intentionally differs from conviction
  history, which uses explicit appends (see migration 015).
- **`holdings.action_date` is a separate write path from a leg's own open date** —
  `legs.opened_at`/`leg_transactions.executed_at` and `holdings.action_date` are NOT kept in sync
  automatically. Correcting a mis-dated leg via the ledger (or a direct `legs`/`leg_transactions` fix)
  does **not** touch `holdings.action_date` — it's an independently-editable field on
  `PositionEditor.tsx`. Confirmed by a real bug (LEU, fixed 2026-07-05): the leg was corrected to the
  right year but `holdings.action_date` still carried the old one. When fixing any date on a position,
  check and fix **both** sides.

### Data sources / writers
The apps mostly **read** these tables; the rows are written by systems that live **outside this
repo**. Know who writes what before you reason about freshness or "why is this row here":

| Table | Primary writer | Notes |
|---|---|---|
| `holdings` | **the routines** (see next section) | core position rows (`last_action`/`action_date`/`current_weight`/thesis/conviction/`category_id`); admin Edit form also writes. Per-leg sizing + prices live on `legs`/`leg_transactions`, not here |
| `signals` | **morning routine** (Graddox step) | GEX signal bias + levels |
| `conviction_comments` | **the routines** + `stw-transcripts` | explicit appends; `source` = `discord` or `streaming`; admin/users can also add notes |
| `holding_transactions` | **DB trigger** (no client) | auto-logged from any `holdings` write; never written directly by app or routine |
| `run_log` | **the routines** | ingestion audit + high-water mark; newest `digest` → "Latest Portfolio Changes" |
| `user_positions` | **web `ibkr-flex.ts`** | each subscriber's own IBKR account; user-owned RLS |
| `profiles` / `tiers` | auth + Settings | per-user creds/preferences, tier paywall |

"The routines" = three cowork cron tasks that ingest Discord into Supabase — **the primary writers of
`holdings`, `signals`, `conviction_comments`, `run_log`.** They are not in this repo (they live at
`~/Documents/Claude/Scheduled/<id>/SKILL.md`); the next section documents the full flow. They write
via the Supabase REST API with the **service-role key**, which is why their writes bypass the
`cc@claudiachez.com`-only RLS on `holdings`/`signals`.

---

## Data Ingestion — The Routines (out-of-repo, but the source of almost all data)

The apps render data that an external ingestion engine writes on a schedule. This engine is **not
checked into this repo** — it is a set of Claude cowork cron tasks at
`~/Documents/Claude/Scheduled/<id>/SKILL.md` (thin shims under `~/.claude/scheduled-tasks/`). It is
documented here because the Supabase schema is the contract between it (writer) and the apps
(readers); changing a table or the `legs`/`leg_transactions` event-sourced schema affects both sides.

**Mechanism (shared by every routine):**
- Reads Discord via **Claude in Chrome** (the user's own account — not a bot; the user isn't a server admin).
- Writes to Supabase via `curl` to the REST API using the **service-role key** (from `~/Documents/Claude/Scheduled/.supabase-service-key`), bypassing RLS. Every write uses `Prefer: return=representation` and is verified — an empty `[]` body is treated as failure.
- **High-water mark:** each routine first reads the newest `run_log.last_message_ts` for its channel, processes only messages newer than that, then writes a fresh `run_log` row. This makes every run idempotent — a message/recording/snapshot is processed exactly once, no matter which path fires. **Completeness is critical:** scroll Discord back to the *prior* mark and process EVERY message in the gap before advancing — the newest screenful loads first, so stopping early silently skips mid-gap messages while the mark moves past them (this dropped SYNA/TENB/GDYN on 6/26).
- **Extract intent, not the surface verb.** The host **deliberately obfuscates alerts to fool copy-bots** (confirmed 2026-06-26): a disguised "buy / hang on / revisit" can be a real **Close** (tells: "tossed/stopped out", "rules are rules", "I often sell bottoms"), and he may **omit the ticker** (name only, e.g. "Agility Robotics SPAC" = $CCXI → research and resolve the symbol). Still never infer weights/conviction from sizing; flag genuinely ambiguous actions rather than guessing.
- **Edited posts can defeat a naive high-water mark** (confirmed 2026-07-02, `stream-library-stw`): the host routinely **edits the same Discord message in place** to add new content (e.g. appending Episode 29 to the same post that already held Episodes 25–28), only posting a new message when he hits the character limit. Discord edits do **not** change a message's `id` or original `timestamp` — only `edited_timestamp` moves — so an ID/timestamp-only dedup check can silently treat a freshly-edited post as already processed. `stw-transcripts`' `SKILL.md` now checks for an "(edited)" marker and cross-references the post's stated episode number against `run_log.summary` before skipping; apply the same caution to any routine reading a channel where the host might behave the same way.

**The four routines:**

| Routine | Cadence | Reads (Discord channel) | Writes |
|---|---|---|---|
| `stw-morning-run` | 9am wkdays | Graddox → `live-notes-portfolio` → (fallback) `stream-library-stw` | `signals`, `legs`, `leg_transactions`, `holdings`, `conviction_comments`, `run_log` |
| `stw-afternoon-run` | 3pm wkdays | `live-notes-portfolio` → (fallback) `stream-library-stw` | `legs`, `leg_transactions`, `holdings`, `conviction_comments`, `run_log` |
| `stw-friday-weighting` | 5pm Fri | `updates-portfolio` (weekly full snapshot) | `holdings` (weights only), `run_log` |
| `stw-transcripts` | manual (+ daily fallback) | `stream-library-stw` (webinar recording) | methodology `.md` (local), `holdings`, `conviction_comments`, `run_log` |

**Daily flow (morning / afternoon):**
1. Read `live-notes-portfolio` — the host's real-time buy / sell / upsize / trim calls **and** his DD/thesis (he posts thesis here, not in a separate channel).
2. For each changed ticker, write the **event-sourced** path (post-Phase-5): a `leg_transactions` **diary** row per leg event (`BUY`/`SELL`/etc. with `action_label`, `price`, `weight`=lot/remaining, `notes`=host's words) — the 040 trigger derives the `legs` scoreboard (status, entry/exit, realized P&L) — then a **direct `holdings` PATCH** of `last_action`/`action_date`/`current_weight` only. No `position_detail`/`exit_*` blob is written (those columns were dropped in 034/035).
3. That `holdings` PATCH **auto-fires the 033 trigger** → a harmless `holding_transactions` audit row (no client code; the routines never write that table directly).
4. For notable commentary, **append a `conviction_comments` row** (`source='discord'`) → becomes "Latest Comments"; refresh `holdings.summary`/`bullets` + `dd_updated_at` only when the durable thesis actually changed.
5. Write the `run_log` mark, including a multi-line **`digest`** → rendered as "Latest Portfolio Changes" in the Overview.
6. **Recording fallback:** if `stream-library-stw` has an unprocessed recording, delegate to `stw-transcripts`. (Morning also runs the Graddox GEX step first → `signals`.)

**Weekly flow (Friday):** read the full-portfolio snapshot from `updates-portfolio` and **truth-up every holding's `current_weight`** to match it (this is the weighting source of record; daily calls only nudge weights). A ticker in `holdings` but absent from the snapshot is flagged, not auto-closed.

**Webinar flow (`stw-transcripts`):** processes the newest unprocessed recording **exactly once** (dedup via the `stream-library-stw` high-water mark). From one Zoom transcript it produces **two outputs**: (A) a **methodology-analysis `.md`** — a fixed 10-section reverse-engineering of *how the host thinks* (not what he owns) — saved to `~/Documents/Claude/Projects/Stock Talk Weekly/StockTalk_Episode_<DATE>_Analysis.md`; and (B) **conviction notes** — a `conviction_comments` row per ticker (`source='streaming'`) plus a thesis refresh when the durable "why" changed. Output A is the **only** routine output the apps never read (a local research library, kept separate from position data on purpose).

---

## IBKR Pipelines (three separate systems)

### Admin — local option pricer
`apps/admin/ibkr_proxy.py` is a **local** Flask server (`localhost:8765`, self-signed
TLS) that talks to IB Gateway (`127.0.0.1:4001`) via `ib_insync`. The admin browser
calls it to price **STW's** option legs (arbitrary contracts, not just held positions);
the browser then writes the per-leg **`legs.mark_price`** / `mark_price_at` (`mark_price_source='IBKR'`)
to Supabase — the proxy itself never writes Supabase. (Pre-event-sourcing this wrote `last_pnl_*` /
`ibkr_legs` on `holdings`; those columns were dropped in 034.) Run it locally with IB Gateway
connected; never deployed.

The proxy batches snapshots for speed, then **retries any leg the batch returned empty,
one at a time** (concurrent frozen snapshots occasionally drop an illiquid contract).
An unpriced leg carries an `error` reason so the UI can explain it, never a bare blank:
`ambiguous` (strike not listed for that expiry) or `no_market_data` (resolved but no
bid/ask/last/close — likely illiquid / deep-ITM / far-dated). Map it via
`legPriceReason(leg)` from `@stw/shared` — the single source of truth for unpriced copy.

### Admin — local real order placement (added 2026-07-03)
The same `ibkr_proxy.py` also exposes `POST /place_order` and `GET /order_status/<id>`
(write-capable `ib_insync` session, `readonly=False` — the pricer above stays `readonly=True`).
The admin browser calls it from a row-scoped "Open via IBKR" / "Close via IBKR" button in
`LegTimeline.tsx`, which opens a modal asking for real quantity + order type (legs are
weight-only — see `legs.ts`'s header comment — so quantity can never be derived from weight,
only suggested via `app_config`'s capital-allocation defaults). A confirmed fill PATCHes the
triggering diary row's price/`broker_*` columns (open) or inserts a new Closed diary row (close) —
never the requested/guessed price. Gated by `canEdit` + `app_config.ibkr_live_trading_enabled` +
`AppCapabilities.onExecuteIbkrOrder` only being wired in `apps/admin/src/main.tsx`.
**This is explicitly admin-only, local-proxy-only, single-account.** Do not extend it to
arbitrary subscribers without a separate legal/compliance review — that would need an entirely
different integration (IBKR's Client Portal Web API, or Alpaca's OAuth trading API per
`plans/mobile-transition.md`), not more gating on this one. `IB_PORT` is an env var
(`IB_PORT=4002` for paper mode) so testing never requires editing the file.

### Subscriber — Flex Query portfolio sync
`apps/web/netlify/functions/ibkr-flex.ts` is a **serverless** Netlify function that
calls IBKR's cloud Flex Web Service API to fetch a subscriber's **own** portfolio positions.
Security model: client sends its Supabase JWT → function verifies it, reads
`ibkr_flex_token` + `ibkr_query_id` from `profiles` via service key → calls IBKR →
writes positions to `user_positions`. The raw token never reaches the browser.

Required Netlify env vars on the **web** site:
- `VITE_SUPABASE_URL` — already present (shared with the Vite client build)
- `SUPABASE_SERVICE_ROLE_KEY` — server-side only, must be added separately (no VITE_ prefix)

These three pipelines are independent. The admin proxy prices (and now trades) STW's own
positions on the admin's own account; the subscriber function only ever reads the
subscriber's own account, read-only. Do not conflate them.

---

## Conventions

### Netlify Functions
- **Anthropic:** use **direct `fetch()` to `https://api.anthropic.com/v1/messages`** — do NOT import `@anthropic-ai/sdk` (ESM/CJS bundling issues in the Netlify Node runtime → 502s). Pass `x-api-key`, `anthropic-version: 2023-06-01`, JSON body. See `apps/web/netlify/functions/macro-recap.ts`.
- **Supabase — NO `@supabase/supabase-js` in Netlify Functions.** `createClient` from supabase-js 2.100+ throws on Node 20 because the Realtime client tries to open a WebSocket at import time and crashes the function. Use **direct REST `fetch()`** for all Supabase reads/writes in functions — `GET /rest/v1/<table>?...` with `apikey` + `Authorization: Bearer <key>` headers. See `apps/web/netlify/_lib/recap-core.ts` for the pattern. This replaces the old guidance about `createClient` options.
- **Env var whitespace:** always call `.trim()` on env vars read in functions — pasted keys/URLs sometimes carry a trailing newline that causes "Invalid API key" from Supabase even when the value looks correct in the Netlify UI.
- **Both web and admin deploy functions.** Both `apps/web/netlify/functions/` and `apps/admin/netlify/functions/` are deployed by their respective Netlify sites. Functions that must work on both sites (e.g. `macro-recap.ts`) need a copy in each app — Netlify functions are site-scoped, not cross-domain callable.

### Macro data sources & module structure
- **Finnhub** (`VITE_FINNHUB_KEY`): live quotes for stock symbols only. Free tier does NOT serve index symbols (`^VIX`, `^TNX`, etc.) — they return empty. For index indicators, fall back to TwelveData last daily close.
- **TwelveData** (`VITE_TWELVEDATA_KEY`): daily OHLC for MA computation. Cache via `packages/ui/src/features/macro/maCache.ts` (`tdDailyCloses`, `loadCloses`, `loadLastDate`, `sma`), keyed `macro-ma-{symbol}` with `date` + `lastDate` (refresh once per day). Also the authoritative close source for VIX/US10Y/CBOE-TNX.
- **TwelveData bills 1 credit per symbol, not per HTTP call.** Bundling many symbols into one
  comma-joined request does NOT avoid the free tier's ~8-credit/minute cap — it still costs N credits
  and 429s if N > 8 (confirmed 2026-07-05: "12 API credits used, limit 8"; this was misdiagnosed once
  as an unrelated daily-quota exhaustion before the real per-minute cause was found). `tdBatchCloses`
  and `fetchClosesChunked` in `maCache.ts` both chunk to ≤8 symbols with ~65s pacing between chunks —
  **never revert to one large unchunked batch call**, and if you add a new module that fetches many
  TwelveData symbols, route it through one of these two helpers rather than a fresh `fetch()`.
- Without `VITE_TWELVEDATA_KEY`, MA/score cells degrade to `—` gracefully.
- **Module structure (v2):** the Macro tab is **weighted module scores**, NOT a single MA table. The 9/21/200 MA table is **Trend only**; **VIX → Volatility/Stress**, **US10Y → Rates+Dollar** — never put stress/rates indicators in the trend table. Pure scorers live in `packages/shared/src/utils/macro.ts` (unit-tested); fetching lives in the per-module hooks. Every macro card shows a **source + data-age** footer (`SourceNote`); daily series show their latest close date (`loadLastDate`).
- **Macro recap** (`macro-recap-am/pm` scheduled fns + `macro-recap.ts` manual fn): a **daily** note, two sessions per weekday (AM pre-market, PM post-market). Grounded ONLY in data passed to it — **never fabricate figures**. Prefers Sonnet, falls back to Haiku; override with `MACRO_RECAP_MODEL`. **Persisted cross-device** in `public.macro_daily_recaps` (migration 051, unique on `(date, session)`) — functions write with service-role key; RLS grants read-only `SELECT` to `authenticated`; admin-only Regenerate button with AM/PM selector. Scheduled: AM at 12:00 UTC (8am EDT), PM at 21:30 UTC (4:30pm EDT). Hook: `useDailyRecap.ts`.
- **5D trend engine** (`useMacroTrendHistory.ts`): daily module/indicator-score snapshots persisted server-side in `public.macro_daily_snapshots` (migration 048, one row per weekday, written by the `macro-snapshot` scheduled Netlify function at 4:30pm ET). **`macro-snapshot.ts` was broken (imported `@supabase/supabase-js` which crashes Node 20) — fixed 2026-07-02 to use direct REST fetch, but the table is STILL empty on PROD as of 2026-07-05** — the fix alone didn't resolve it; check Netlify function logs for `macro-snapshot` before assuming this module has real data. Banner direction descriptor, score-strip deltas, and gauge delta are consistent across devices once rows accumulate.
- **Sector Rotation** (Module 11, `useSectorRotation.ts` + `SectorRotationCard.tsx`): per-sector radar cards (RS vs SPY across Week/1M/3M/6M/1Y via `recharts`) plus "Leaders"/"Setting Up" constituent chips, fetched via `fetchClosesChunked` in `maCache.ts` (small sequential chunks to respect TwelveData's free-tier rate limit for the larger constituent symbol list).

### Timestamps
All UI timestamps use `fmtDateTime(val: Date | string | null)` from `@stw/shared`.
Output format: **`Mon D · H:MM AM ET`** (Eastern Time, year omitted).
- DB stores UTC; always display in ET via `timeZone: 'America/New_York'`.
- Label pattern: `[Action]: ${fmtDateTime(value)}` — e.g. `Last synced: Jun 5 · 7:46 AM ET`.
- Never call `toLocaleString` / `toLocaleTimeString` directly in components for timestamps.
- **No per-component date helpers** (e.g. a local `fmtStamp`) — import `fmtDateTime`. This covers every full "as of" timestamp: column labels, source lines, tooltips, alerts. (Exceptions: a date-only display like `action_date`, or a compact intraday tag like the Signals `@ 4:00 PM` price time — neither is a full timestamp.)

### Ticker links
**Any ticker shown anywhere in the UI must be a hyperlink to its detail page** — never
plain text. Use `<TickerLink ticker onSelect={onSelectTicker} />` from `@stw/ui` (free
text like a digest can be linkified token-by-token against the holdings set). This is a
standing rule: when you render a ticker, link it without being asked.
**Exception: the Macro tab.** Sector ETFs, index symbols (VIX, US10Y, etc.), and the Sector Rotation
card's Leaders/Setting Up constituent tickers render as plain styled chips/text, not `TickerLink` —
the Macro tab has no `onSelectTicker` navigation capability wired in (it isn't scoped to STW's
holdings set), so there's no detail page for most of these symbols to link to.

### Counts
"Positions" counts exclude the `CASH` balance row (it's not a position) and reflect the
active filter (closed hidden by default). The FilterBar count shows `N of {total}`.

### UI consistency (standing rules, host 2026-06-23)
- **White text on green.** Any filled `--acc`/green button or active toggle uses **white** text, never
  black/dark (black-on-green is low-contrast). Match the existing Save buttons (`color: '#fff'`).
- **Sibling tabs read as one app.** The Trades filter bar mirrors the Ticker Details `FilterBar` chrome
  (full-bleed surface bar, same control styling, same wording — e.g. "All Baskets", not "All Sectors").
  Every tab uses a **full-bleed layout** — control bar → filter bar → padded scroll area — never a
  centered/max-width column. When a new tab's data shape matches an existing one (e.g. My Portfolio vs.
  Trades), **reuse the exact same table styles** (`th`/`td`, etc.) rather than inventing a new look.
  This bit hard in the 2026-06-25 My Portfolio work — a from-scratch centered layout had to be reworked
  twice to match the siblings' full-bleed chrome.
- **Multi-column layouts stack on mobile.** Side-by-side sections (e.g. the Risk-Appetite gauge ┃
  breakdown) use `flexWrap` so they fill the full width on desktop and stack to a single column on
  mobile, rather than a fixed grid that gets cramped. Table columns that don't fit a narrow screen are
  hidden outright via the shared `useIsMobile()` hook (e.g. Trades' "Init Wt" column is desktop-only)
  rather than reflowed or truncated.
- **Filter/sort control ORDER is canonical — don't reinvent it per page.** Every filter bar follows
  **Search → Baskets → (Tiers/Status) → Types → Sort → toggles (checkboxes) → Clear → count**. Sort sits *after*
  the filters, never second. Match the order in `FilterBar.tsx` / `TradesFilterBar.tsx`; new tabs differ only by
  which filters exist, not by arrangement.
- **Timestamps align right; the left of a filter bar is for filters.** A "Last synced / Updated" stamp goes on
  the **right** of its bar (right-aligned), not the left — the left edge is filter real estate (host, 2026-06-25).
- **A list/blotter is a flat table by default; grouping is an opt-in checkbox** (like "Tailed only"), not forced
  sections. My Portfolio reuses the Trades `th`/`td` table styles; its "Group by ticker" toggle is the accordion.
- **Equity/Shares : Options ratio is computed by current MARKET VALUE, per leg** — shares on the live quote,
  option legs on their mark (cost weight grossed up by `mark÷entry`). **Never** by cost/premium weight and
  **never** by classifying a whole holding as equity-or-options (that dumps shares+overlay positions into equity
  and badly understates options). The host quotes the split by market value (confirmed 2026-06-25 against prod
  leg data: cost-weight ≈ 87:13 vs market-value ≈ host's 76:24). Same basis on the Stock Picks Overview card and
  the My Portfolio summary card.
- **Overview blocks share one header pattern.** Title lives OUTSIDE the card via `SectionHeader`, with an
  optional right-aligned `Updated: {fmtDateTime}` stamp — used by the webinar, changes, unpriced, and
  stale blocks. Don't put a block's title or its date inside the card.
- **Admin-only action hints.** Instructions a subscriber can't act on (e.g. "Run the IBKR sync") render
  only when `canEdit`; the explanation still shows to everyone.
- **Routine review-flags are admin-only** (host 2026-06-26). Operational uncertainty the routine surfaces —
  "flagged for review", "left open rather than auto-closed", missing-DD / snapshot-mismatch notes — must NOT
  appear in the subscriber-facing digest (`run_log.digest` → "Latest Portfolio Changes"). The public digest
  carries only **confirmed** changes; review-flags go to `run_log.summary` / the chat output (admin-gated).
- **Ticker Detail = four non-overlapping surfaces, one job each** (contract:
  [`plans/commentary_vs_transaction_boundary_spec.md`](plans/commentary_vs_transaction_boundary_spec.md)):
  **Highlight box** = `holdings.summary` (durable narrative paragraph) · **Key Points** = `holdings.bullets`
  (durable supporting detail — receipts + angles, **de-duped vs the summary**, never restating it; §2A) ·
  **Commentary** = `conviction_comments` (dated episodic views) · **Transaction History** =
  `leg_transactions.notes` (mechanics). Never re-derive one surface from another in the renderer.
- **Durable thesis source = local DD files** at `~/Documents/Claude/Projects/Stock Talk Weekly/Tickers DD/<TICKER>.md`
  (one per opened position; line 1 is a `**Source:** [Discord](url)` link; template `_TEMPLATE.md`). The apps
  NEVER read these — `holdings.summary`/`bullets` are the condensed projection, written from them by the
  routines (create on new position, non-destructive update on a durable DD expansion). Same private-library
  pattern as the methodology `.md` files.
- **Conviction delta is routine-recorded, never app-derived.** The Conviction Changes Overview block reads
  `conviction_comments.prev_conviction_level` (043) → renders `prev → current` directly. Do NOT reconstruct
  changes by diffing comment-level history across rows — it's sparse and contradicts the routine. The routine
  stamps the prior conviction on every comment it writes (= current when reaffirming).
- **Source-message icon is shown to everyone.** The "open original message" link (`dd_source_url` /
  `source_url`, via `SourceLink`) renders for all users — the platform is a companion to the Discord
  membership, so Discord itself gates access (member sees the message, non-member hits Discord's no-access
  screen). Don't admin-gate it. Use a directional glyph (▲▼★) for change *direction* and the external-link
  glyph only for *opening the source* — don't conflate the two.
- **Every modal in the app uses the same fixed-overlay chrome** (host 2026-07-03, after `EventForm`'s
  modal briefly diverged and had to be unified): `position: 'fixed', inset: 0` dark backdrop
  (`rgba(0,0,0,0.55)`), **vertically centered** (`alignItems: 'center'`, not `flex-start`/top-aligned),
  `background: 'var(--surface)'` (not `var(--s2)` — that reads as washed-out/wrong), click-outside
  (backdrop `onClick`) closes it, inner content `stopPropagation`s. See `PositionEditor.tsx`,
  `IbkrOrderModal`, and `EventForm` in `LegTimeline.tsx` for the canonical version. A new modal should
  copy this exactly, not invent its own positioning.
- **A real-money/broker action gets a visually distinct solid-fill color, never green or red.** The
  admin's "Open via IBKR" / "Close via IBKR" buttons are solid dark green (`#15803d`, white text) —
  deliberately *not* `--acc` (bright green = ordinary Save) and *not* `#ef4444` (red = Delete), so a
  real order can never be mistaken for either at a glance. If a future action carries similar
  real-world weight, give it its own solid color rather than reusing Save's or Delete's.
- **An admin settings page groups related fields into one card with ONE Save button**, not a Save per
  field (`ConfigPage.tsx`'s pattern, host 2026-07-03) — each row reports its draft value up to the
  section, which owns the dirty-tracking and the single mutation call. Reuse this pattern for any
  future Config/Manage addition rather than one-Save-per-row.
- **Reserve a fixed-width slot for optional row prefixes/labels, even when unused.** A column of
  inputs where some rows have a prefix (e.g. "$") and others don't will visually misalign unless every
  row reserves the same-width slot regardless of whether it's populated (`ConfigPage.tsx`'s `rowPrefix`
  class is the reference). Applies to any repeated label+input row layout, not just Config.
- **A calculated value that legitimately computes to zero must say so, never go silently blank.** The
  IBKR order modal's quantity suggestion shows `0` plus an explanatory shortfall note when the budget
  can't cover one unit, rather than leaving the field empty (which reads as "nothing computed" instead
  of "budget insufficient"). Apply the same instinct anywhere a calculation can legitimately land on
  zero/empty — show the result and why, don't hide it.
- **Settings pages hold only account setup — never live evaluation/violation display** (host decision,
  2026-07-06). A Settings form configures thresholds/credentials; it does not also show you how you're
  doing against them. That belongs on the page the data itself lives on (e.g. Limits violations live
  on My Portfolio, not Settings, even though the thresholds that drive them are edited in Settings).
  If a future Settings addition is tempted to add a "preview" of live data next to a config field,
  don't — split it the same way `RiskConfigForm` (Settings) and `ViolationsSummary` (My Portfolio)
  were split.
- **A list page's default ticker-click action should open that page's OWN data about the ticker, not
  jump to a different page's tracked version of it** (host decision, 2026-07-06, My Portfolio). My
  Portfolio's ticker click now opens an own-position detail pane instead of navigating to STW's
  tracked position (`PortfolioPositionDetail.tsx`) — the STW-position view is still reachable, but
  as an explicit named link inside the pane, not the default click target. Apply the same instinct to
  any future page that lists a subscriber's own data but is tempted to default-link into STW's data
  instead.
- **New code should use the design-token files and `packages/ui/src/primitives/` components, not
  fresh literals or a new one-off component** (established 2026-07-06, see Design System section —
  now **lint-enforced**, not just a convention: `pnpm lint` fails on a new literal color/px font-size
  anywhere in `apps/**`/`packages/**`). Colors from `packages/ui/src/styles/tokens.css`
  (`var(--status-positive-text)`, `var(--pnl-gain)`, etc.); spacing/radius/type-scale/motion from
  `packages/shared/src/constants/tokens.ts` (`SPACE`, `RADIUS`, `FONT_SIZE`, `NUMERIC_STYLE`, etc.);
  badges/pills/tables/modals/detail-panes/etc. from `packages/ui/src/primitives/` — see
  [`docs/design-system/CONTRIBUTING.md`](docs/design-system/CONTRIBUTING.md) for which one to reach
  for. Existing pages are NOT migrated onto these yet — that's Phase 5, in progress per
  [`docs/design-system/migration-plan.md`](docs/design-system/migration-plan.md) — so this rule
  governs new code only until a given page's migration lands.
- **P&L gain/loss color must read `var(--pnl-gain)`/`var(--pnl-loss)`, never a hardcoded hex or
  `var(--acc)`/`var(--c1)` directly.** `HoldingRow.tsx`, `HoldingDetail.tsx`, and `SignalsTable.tsx`
  currently hardcode the light theme's exact green/red (`#16A34A`/`#DC2626`) regardless of active
  theme — a real, live bug (P&L text renders the wrong hue in the app's default dark theme today),
  documented in
  [`docs/design-system/audit/04-additional-inconsistencies.md`](docs/design-system/audit/04-additional-inconsistencies.md).
  The correct tokens now exist; migrating those 3 files is the first sub-pass of the Stock Picks phase
  in [`docs/design-system/migration-plan.md`](docs/design-system/migration-plan.md) (still open — see
  Next Steps).
- **Never set `outline: 'none'` on a focusable element without a visible replacement.** Tailwind-class
  inputs in this app correctly pair `focus:outline-none` with `focus:border-acc`; several inline-
  `style` inputs (`SettingsPage.tsx`, all three `FilterBar` variants) set `outline: 'none'` with
  nothing replacing it — a real keyboard-accessibility regression, not just a style nit. **New code:
  use the `TextInput` primitive** (`packages/ui/src/primitives/TextInput.tsx`), which pairs
  `focus:outline-none` with a visible focus border by construction — don't hand-roll a new input style.
  This specific pattern isn't lint-checked (it's not a static AST-detectable literal), so it's on
  code review, not `pnpm lint`, to catch a regression here.

---

## Design System

> **A formal design-token + component system is built** (`claude/design-system-audit` branch, unmerged
> — see Current Status and Next Steps #1) — all 4 planned phases (audit → tokens → core components →
> enforcement/migration plan) are done and host-approved, per
> [`plans/stw-design-system.md`](plans/stw-design-system.md). **New UI code builds from `packages/ui`'s
> component library and the token files — not fresh literals, not a new one-off component** — this is
> now a standing rule, not just a phase-in-progress note; see
> [`docs/design-system/CONTRIBUTING.md`](docs/design-system/CONTRIBUTING.md) for the full usage guide
> (which `Badge` kind/`StatusPill` variant to use and why, `Button` variants, numeric-formatting and
> P&L color rules) and is **enforced by `pnpm lint`** (a brand-new literal color/font-size anywhere in
> `apps/**`/`packages/**` fails immediately — see CONTRIBUTING.md's Enforcement section). **The color
> variables below are no longer the sole source of truth** — `packages/ui/src/styles/tokens.css` is the
> canonical file both apps import (this table is a quick-reference subset, kept in sync manually);
> non-color scales live in `packages/shared/src/constants/tokens.ts`. Full reference:
> [`docs/design-system/tokens.md`](docs/design-system/tokens.md). Existing pages are not migrated yet
> — that's Phase 5, in progress per
> [`docs/design-system/migration-plan.md`](docs/design-system/migration-plan.md) — so don't be
> surprised to see plenty of pre-Phase-5 pages still on literal values; don't invent a second parallel
> token scheme (e.g. a new Tailwind theme extension) or a new one-off component when migrating one —
> extend the existing token files / `packages/ui/src/primitives/` instead.

- **Font:** Barlow Condensed (700/800) for the **STW logo** in the header only; system sans-serif (`font-sans`) everywhere else including page headings and login
- **Logo:** STW mic + green arrow SVG
- **Default theme:** Dark. Toggle persists to `localStorage` (`stwTheme`); light
  theme applied via `[data-theme="light"]`. Never hardcode colors outside `:root` /
  `[data-theme="light"]` — always use CSS variables.

#### Color Variables (`:root`)
| Variable | Value | Usage |
|---|---|---|
| `--bg` | `#0a0a0a` | Page background |
| `--surface` | `#111111` | Cards, header |
| `--s2` | `#1a1a1a` | Secondary surfaces |
| `--border` | `#2a2a2a` | Borders |
| `--bsub` | `#1f1f1f` | Subtle dividers |
| `--text` | `#f0f0f0` | Primary text |
| `--t2` | `#a0a0a0` | Secondary text |
| `--t3` | `#808080` | Muted text (changed from `#525252` 2026-07-06 — the old value failed WCAG AA contrast; see `docs/design-system/tokens.md`) |
| `--acc` | `#22c55e` | STW green |

New semantic tokens added 2026-07-06 (status pills, P&L, surface/border/text variants) aren't
duplicated in this table — see `docs/design-system/tokens.md` for the full set.

#### Tier Colors
| Tier | Color | Meaning |
|---|---|---|
| `--c5` | `#22c55e` | Highest conviction |
| `--c4` | `#3b82f6` | High conviction |
| `--c3` | `#f59e0b` | Moderate |
| `--c2` | `#6b7280` | Waning interest |
| `--c1` | `#ef4444` | Concern |
| `--c0` | `#52525b` | Legacy |

---

## Tech Stack
| Concern | Choice |
|---|---|
| Framework | React 18 + Vite 5 + TypeScript |
| Workspace | pnpm workspace (no Turborepo/Nx) |
| Routing | react-router-dom 6 |
| Data | TanStack Query 5 (60s staleTime) |
| State | Zustand 5 |
| Backend | Supabase (auth + Postgres + RLS) |
| Prices | Finnhub (live), TwelveData (daily/MAs), IBKR proxy (options legs) |
| Charts | lightweight-charts (GEX); react-gauge-component (Macro Risk-Appetite gauge) |
| Styling | Tailwind 3 + CSS variables |

---

## Session Close

Run this routine after ~10 commits or when wrapping up a session.

### 1 — Git hygiene
```bash
git fetch --prune origin          # drop stale remote-tracking refs
git branch --merged staging       # list local branches already merged
git branch -d <merged-branches>   # delete each one
```
Remote branches merged into staging: delete via GitHub UI
(Settings → Branches, or the "Delete branch" button on a closed PR).
Claude can attempt `git push origin --delete <branch>` but may get a 403 —
flag it if so and ask the user to delete manually.

### 2 — Supabase check
- Were any new migrations authored this session? List them and confirm the user has applied them via the Supabase SQL editor.
- If schema or RLS changed, remind user to verify on the staging project before shipping to prod.

### 3 — CLAUDE.md review
Review every section and ask: *does this still reflect the codebase, or is it stale?*
- Update migration count if new ones were added
- Update AppCapabilities list if the context interface changed
- Add conventions introduced this session (only if they're rules, not implementation details)
- Remove anything that's now discoverable from the code itself

### 4 — Staging deploy
Confirm the latest push to `staging` produced a successful Netlify build — but first decide whether a build was even *expected*.

Each `netlify.toml` `ignore` command builds only when the app dir, a shared
`packages/**`, or a root manifest changed (see Deployment). Check what the session's commits actually touched:
```bash
git diff --stat origin/main...staging   # files changed since last prod release
```
- **Only root/non-app files changed** (e.g. `CLAUDE.md`, `supabase/migrations/**`, `.github/**`): a **Canceled** deploy is *correct and expected* — there was nothing to rebuild. Leave it; do **not** force an empty commit (that just produces another no-op build).
- **App or shared code changed** (`apps/web/**`, `apps/admin/**`, `packages/**`) but the deploy is **Canceled or Failed**: this is a real problem (the `ignore` command should have built it). If it was canceled by a rapid superseding push, trigger a fresh build:
  ```bash
  git commit --allow-empty -m "Trigger staging deploy" && git push -u origin staging
  ```
  If it Failed, read the Netlify build log before re-triggering.

### 5 — Session summary
Briefly list: what was shipped, any pending user actions (migrations to apply, env vars to add, manual branch deletes), and any known open issues to tackle next session.
