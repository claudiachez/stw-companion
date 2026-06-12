import { ACTION_VARS } from '@stw/shared';

// Small colored pill for a transaction action (New / Upsized / Trimmed / Closed).
// "Hold" has no entry in ACTION_VARS and renders nothing — holding is the implicit state.
export function ActionBadge({ action }: { action: string }) {
  const vars = ACTION_VARS[action];
  if (!vars) return null;
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
      padding: '2px 5px', borderRadius: 3,
      color: vars.color, background: vars.bg,
      textTransform: 'uppercase',
    }}>
      {action}
    </span>
  );
}
