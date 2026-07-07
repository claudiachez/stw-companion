import { Badge } from '../../../primitives/Badge';

// This used to hardcode its own LEVELS color map — a 100% duplicate of TIERS in
// @stw/shared (same 6 tiers, same colors, same short labels: HIGHEST/HIGH/MODERATE/
// WANING/CONCERN/LEGACY), flagged by name in the Phase 1 audit
// (docs/design-system/audit/02-component-duplication-report.md). Kept as a thin
// wrapper (not deleted + call sites updated) so every existing `<ConvictionBadge
// level={n} />` usage keeps working unchanged.
export function ConvictionBadge({ level }: { level: number }) {
  return <Badge kind="tier" tier={level} />;
}
