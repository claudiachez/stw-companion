import { FONT_SIZE, FONT_WEIGHT, LETTER_SPACING, NUMERIC_STYLE, SPACE } from '@stw/shared';

// Phase 3 core component (plans/stw-design-system.md §3.6). Header style + row height are
// lifted verbatim from TradesTable.tsx's `th`/`td` objects (the more complete of the two
// already-drifted copies — TradesTable.tsx and SignalsTable.tsx started identical and have
// since diverged, per docs/design-system/audit/02-component-duplication-report.md).
// Numeric columns get right-align + tabular-nums for free via `numeric: true`.
export interface DataTableColumn<T> {
  key: string;
  header: React.ReactNode;
  /** Right-aligns and applies tabular-nums — the standing rule for all numeric data. */
  numeric?: boolean;
  render: (row: T) => React.ReactNode;
  /** A small muted line under the cell's primary content (e.g. an option leg descriptor
   * under its ticker, matching TradesTable's ticker+instrument sub-line). */
  subCaption?: (row: T) => React.ReactNode;
  hideOnMobile?: boolean;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  selectedKey?: string | null;
  emptyState?: React.ReactNode;
  isMobile?: boolean;
}

const th: React.CSSProperties = {
  textAlign: 'left', fontSize: FONT_SIZE['2xs'], fontWeight: FONT_WEIGHT.bold, textTransform: 'uppercase',
  letterSpacing: LETTER_SPACING.label, color: 'var(--t3)', background: 'var(--s2)',
  padding: `${SPACE[1.5]}px ${SPACE[3]}px`, borderBottom: '1px solid var(--bsub)', whiteSpace: 'nowrap',
};
const thR: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = {
  padding: `${SPACE[2]}px ${SPACE[3]}px`, borderBottom: '1px solid var(--bsub)',
  verticalAlign: 'middle', lineHeight: 1.4,
};
const tdR: React.CSSProperties = { ...td, textAlign: 'right', ...NUMERIC_STYLE };

export function DataTable<T>({ columns, rows, rowKey, onRowClick, selectedKey, emptyState, isMobile }: DataTableProps<T>) {
  const visibleColumns = columns.filter((c) => !(isMobile && c.hideOnMobile));

  if (rows.length === 0) {
    return <>{emptyState ?? <p style={{ fontSize: FONT_SIZE.xs, color: 'var(--t3)', padding: `${SPACE[3]}px` }}>No data.</p>}</>;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: FONT_SIZE.xs }}>
        <thead>
          <tr>
            {visibleColumns.map((c) => (
              <th key={c.key} style={c.numeric ? thR : th}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = rowKey(row);
            const selected = key === selectedKey;
            return (
              <tr
                key={key}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                style={{
                  cursor: onRowClick ? 'pointer' : 'default',
                  background: selected ? 'var(--surface-hover)' : 'transparent',
                }}
                onMouseEnter={(e) => { if (!selected) (e.currentTarget as HTMLElement).style.background = 'var(--surface-hover)'; }}
                onMouseLeave={(e) => { if (!selected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                {visibleColumns.map((c) => (
                  <td key={c.key} style={c.numeric ? tdR : td}>
                    {c.render(row)}
                    {c.subCaption && (
                      <div style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)', marginTop: 1 }}>{c.subCaption(row)}</div>
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
