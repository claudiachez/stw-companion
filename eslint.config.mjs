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
import tsParser from '@typescript-eslint/parser';

const COLOR_LITERAL = '^(#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$|rgba?\\()';

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
          selector: 'Property[key.name="fontSize"] > Literal[value>0]',
          message: 'Raw numeric fontSize — use FONT_SIZE from @stw/shared instead. See docs/design-system/CONTRIBUTING.md.',
        },
      ],
    },
  },
];
