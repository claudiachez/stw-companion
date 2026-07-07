import { useRef, useState } from 'react';
import { DURATION, EASING } from '@stw/shared';
import { useIsMobile } from '../hooks/useIsMobile';

// Phase 3 addendum to DetailPane (plans/stw-design-system.md §3.7's "carried forward"
// note — see docs/design-system/audit/03-responsive-mobile-conventions.md). Extracts the
// resizable-split / mobile-full-screen-swap *behavior* that today exists only inline in
// PicksView.tsx — CLAUDE.md calls this "the canonical list+detail pattern for any
// list+detail surface", but until now nothing outside Picks could import it (PR #69's
// PortfolioPositionDetail.tsx had to hand-copy the same behavior with nothing to reuse).
//
// Desktop: list + a draggable divider + detail, side by side. Mobile: the detail (when
// present) takes over the full screen instead of squeezing both into a narrow viewport.
export interface ListDetailSplitProps {
  list: React.ReactNode;
  /** null/undefined = nothing selected — list fills the row (desktop) or stays visible (mobile). */
  detail?: React.ReactNode | null;
  initialListPct?: number;
  minPct?: number;
  maxPct?: number;
}

export function ListDetailSplit({ list, detail, initialListPct = 42, minPct = 15, maxPct = 80 }: ListDetailSplitProps) {
  const isMobile = useIsMobile();
  const splitRef = useRef<HTMLDivElement>(null);
  const [listPct, setListPct] = useState(initialListPct);
  const [dragging, setDragging] = useState(false);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    document.body.style.userSelect = 'none';
    const onMove = (ev: MouseEvent) => {
      const rect = splitRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setListPct(Math.min(maxPct, Math.max(minPct, pct)));
    };
    const onUp = () => {
      setDragging(false);
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  if (isMobile) {
    // An open detail takes over the full screen instead of squeezing beside the list.
    return <div style={{ flex: 1, overflow: 'hidden' }}>{detail ?? list}</div>;
  }

  return (
    <div ref={splitRef} style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <div
        style={{
          overflow: 'hidden auto',
          position: 'relative', zIndex: 0,
          flexBasis: detail ? `${listPct}%` : 'auto',
          flexGrow: detail ? 0 : 1,
          flexShrink: 0,
          minWidth: 0,
          ...(dragging ? {} : { transition: `flex-basis ${DURATION.fast}ms ${EASING.standard}` }),
        }}
      >
        {list}
      </div>
      {detail && (
        <>
          <div
            onMouseDown={startResize}
            title="Drag to resize"
            style={{
              flexShrink: 0, width: 6, cursor: 'col-resize',
              background: dragging ? 'var(--acc)' : 'var(--border)',
              borderLeft: '1px solid var(--bsub)', borderRight: '1px solid var(--bsub)',
            }}
          />
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', position: 'relative', zIndex: 0, background: 'var(--bg)' }}>
            {detail}
          </div>
        </>
      )}
    </div>
  );
}
