import { FONT_SIZE, SPACE } from '@stw/shared';

// New primitive (design-system Phase 5), extracted from PortfolioPage.tsx's GroupRow after
// the host confirmed a second consumer is coming — the Stock Picks Trades tab's own planned
// "group by ticker, expand for legs" view. Owns the accordion MECHANICS only (click/keyboard
// toggle, the ▶ disclosure indicator, hover/expanded background, an optional tier-style
// accent bar) — same skeleton-vs-behavior split as DetailPane/ListDetailSplit. Each consumer
// supplies its own header/expanded content via render props, since a group-by-ticker summary
// row's exact columns (P&L, in My Portfolio's case) aren't a property of the accordion
// behavior itself — guessing Trades' exact columns here would bake in the wrong shape.
export interface AccordionListProps<T> {
  items: T[];
  rowKey: (item: T) => string;
  expandedKeys: Set<string>;
  onToggle: (key: string) => void;
  /** The always-visible summary row content — ticker, badges, whatever the caller's own
   * columns are. Receives isExpanded so the caller can vary layout (e.g. mobile stacking). */
  renderHeader: (item: T, isExpanded: boolean) => React.ReactNode;
  /** Rendered only while the row is expanded. Omit for a row that's never expandable. */
  renderExpanded?: (item: T) => React.ReactNode;
  /** A 3px left accent bar color per row (e.g. a conviction-tier color). Omit for no bar. */
  accentColor?: (item: T) => string | undefined;
}

export function AccordionList<T>({
  items, rowKey, expandedKeys, onToggle, renderHeader, renderExpanded, accentColor,
}: AccordionListProps<T>) {
  return (
    <>
      {items.map((item) => {
        const key = rowKey(item);
        const isExpanded = expandedKeys.has(key);
        const accent = accentColor?.(item);
        return (
          <div key={key}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => onToggle(key)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(key); } }}
              style={{
                display: 'flex', alignItems: 'center', gap: SPACE[2], padding: '10px 14px',
                borderBottom: '1px solid var(--bsub)', cursor: 'pointer',
                background: 'transparent',
              }}
              onMouseEnter={(e) => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = 'var(--s2)'; }}
              onMouseLeave={(e) => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <span
                style={{
                  fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', flexShrink: 0, width: 16, textAlign: 'center',
                  transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', display: 'inline-block',
                }}
              >
                ▶
              </span>
              {accent !== undefined && (
                <div style={{ width: 3, height: 32, borderRadius: 2, flexShrink: 0, background: accent }} />
              )}
              {renderHeader(item, isExpanded)}
            </div>
            {isExpanded && renderExpanded?.(item)}
          </div>
        );
      })}
    </>
  );
}
