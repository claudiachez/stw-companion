/**
 * Clickable ticker → opens its detail page (via onSelect/setSelectedTicker).
 *
 * CONVENTION: any ticker shown anywhere in the UI must be a TickerLink, never plain
 * text — a ticker should always be a hyperlink to its detail page. Falls back to plain
 * text only when no onSelect handler is available.
 */
interface TickerLinkProps {
  ticker: string;
  onSelect?: (ticker: string) => void;
  /** Text to display instead of `ticker` (e.g. original casing); defaults to `ticker`. */
  label?: string;
  style?: React.CSSProperties;
}

export function TickerLink({ ticker, onSelect, label, style }: TickerLinkProps) {
  const text = label ?? ticker;
  if (!onSelect) return <span style={{ fontWeight: 700, ...style }}>{text}</span>;
  return (
    <button
      onClick={() => onSelect(ticker)}
      style={{
        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
        color: 'var(--acc)', fontWeight: 700, fontSize: 'inherit', fontFamily: 'inherit',
        ...style,
      }}
    >
      {text}
    </button>
  );
}
