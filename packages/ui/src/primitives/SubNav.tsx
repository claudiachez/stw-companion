import { DURATION, FONT_SIZE, SPACE } from '@stw/shared';
import { useIsMobile } from '../hooks/useIsMobile';

// Phase 3 core component (plans/stw-design-system.md §3.11). The secondary tab bar
// pattern from PicksView.tsx (Portfolio Overview / Ticker Details / Trades), extracted
// verbatim so My Portfolio (and any future tabbed surface) can reuse it instead of
// hand-rolling another tab bar.
export interface SubNavItem<T extends string = string> {
  value: T;
  label: string;
}

export interface SubNavProps<T extends string = string> {
  items: SubNavItem<T>[];
  active: T;
  onChange: (value: T) => void;
}

export function SubNav<T extends string = string>({ items, active, onChange }: SubNavProps<T>) {
  const isMobile = useIsMobile();
  return (
    <div style={{ display: 'flex', background: 'var(--surface)', borderBottom: '1px solid var(--bsub)', flexShrink: 0, gap: isMobile ? 0 : SPACE[1], padding: isMobile ? 0 : `0 ${SPACE[2]}px` }}>
      {items.map((item) => {
        const isActive = item.value === active;
        return (
          <button
            key={item.value}
            onClick={() => onChange(item.value)}
            style={{
              flex: isMobile ? 1 : '0 0 auto',
              padding: isMobile ? `${SPACE[2.5]}px 0` : `${SPACE[2]}px ${SPACE[4]}px`,
              fontSize: FONT_SIZE.base, background: 'none', border: 'none',
              borderBottom: '2px solid transparent', cursor: 'pointer',
              marginBottom: -1, transition: `color ${DURATION.fast}ms`, whiteSpace: 'nowrap',
              fontWeight: isActive ? 600 : 400,
              color: isActive ? 'var(--acc)' : 'var(--t2)',
              borderBottomColor: isActive ? 'var(--acc)' : 'transparent',
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
