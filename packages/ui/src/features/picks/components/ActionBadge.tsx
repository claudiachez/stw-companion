import { Badge } from '../../../primitives/Badge';

// Small colored pill for a transaction action (New / Upsized / Trimmed / Closed).
// "Hold" has no entry in ACTION_VARS and renders nothing — holding is the implicit
// state. This used to hand-roll the exact same ACTION_VARS lookup + pill styling
// Badge's kind="action" already owns — kept as a thin wrapper so every existing
// `<ActionBadge action={a} />` usage keeps working unchanged.
export function ActionBadge({ action }: { action: string }) {
  return <Badge kind="action" action={action} />;
}
