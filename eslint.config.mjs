// Design-system enforcement (plans/stw-design-system.md Phase 4 §1). Scoped to exactly
// what the spec asks for — literal hex/rgb colors and raw px font-sizes — not a general
// lint overhaul; this repo had zero lint tooling before this file. See
// docs/design-system/CONTRIBUTING.md for the full rationale and how to fix a violation.
//
// This repo's dominant styling convention is inline `style={{ }}` objects (Tailwind
// classes are secondary — see docs/design-system/audit/00-structure-overview.md), so the
// rule below matches ANY object property with a hex/rgb string literal value, not just
// ones inside a `style` JSX attribute — that's also how the Phase 1 audit found violations
// (e.g. `ConvictionBadge.tsx`'s standalone `LEVELS` color map, not just inline styles).
//
// A brand-new `${c}15`-style computed alpha string (see Badge.tsx) is a TemplateLiteral,
// not a Literal — the rule only matches literal string values, so a value legitimately
// built from a token/variable is never flagged, only ones typed directly as a constant.
//
// The rule above only matches a Literal whose ENTIRE value is a hex/rgb string (anchored
// ^...$) — it was blind to a hex code embedded as a substring inside a longer string, which
// is exactly what a Tailwind arbitrary-value class does (`text-[#f59e0b] bg-[#f59e0b15]`).
// Found 2026-07-07 (design-system Phase 5): UsersPage.tsx, ProfilePage.tsx, and
// ConfigPage.tsx all used this pattern for status colors — including a `STATUS_STYLES` map
// duplicated near-verbatim across UsersPage.tsx and ProfilePage.tsx — and every one of them
// had ZERO violations under the original rule, so none were ever counted in
// eslint-suppressions.json or docs/design-system/migration-plan.md's per-page tables (which
// are generated purely from that file). The second selector below is unanchored specifically
// to catch this substring case, scoped to the `-[...]` bracket syntax so it can't match an
// unrelated string that merely contains a hex-looking run of characters.
import tsParser from '@typescript-eslint/parser';

const COLOR_LITERAL = '^(#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$|rgba?\\()';
const TAILWIND_BRACKET_COLOR_LITERAL = '-\\[(#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|rgba?\\()';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      // Sanctioned literal-color/size sources — the single named place each of these
      // values is allowed to exist as a literal, per docs/design-system/CONTRIBUTING.md.
      'packages/shared/src/constants/tiers.ts',
      'packages/shared/src/constants/baskets.ts',
      'packages/shared/src/constants/tokens.ts',
    ],
  },
  {
    files: ['apps/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: `Property > Literal[value=/${COLOR_LITERAL}/]`,
          message:
            'Literal color value — use a design token instead (packages/ui/src/styles/tokens.css, or var(--status-*)/var(--pnl-*) for status/P&L). See docs/design-system/CONTRIBUTING.md.',
        },
        {
          selector: `Literal[value=/${TAILWIND_BRACKET_COLOR_LITERAL}/]`,
          message:
            'Literal color value inside a Tailwind arbitrary-value class (e.g. text-[#hex]) — use a design token instead (packages/ui/src/styles/tokens.css, or var(--status-*)/var(--pnl-*) for status/P&L). See docs/design-system/CONTRIBUTING.md.',
        },
        {
          selector: 'Property[key.name="fontSize"] > Literal[value>0]',
          message: 'Raw numeric fontSize — use FONT_SIZE from @stw/shared instead. See docs/design-system/CONTRIBUTING.md.',
        },
      ],
    },
  },
];
