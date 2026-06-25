import type { CSSProperties } from 'react';

/**
 * "Open original message" icon — a small external-link affordance that opens the source
 * Discord/stream message in a new tab. Used on the Highlight box (holdings.dd_source_url)
 * and on each Commentary row (conviction_comments.source_url). Shown to everyone: the
 * platform is a companion to the Discord membership, so a connected member opens the
 * message and a non-member hits Discord's own no-access screen — access is gated by Discord,
 * not by us. Renders nothing when no url is present.
 */
export function SourceLink({ url, style, title = 'Open original message' }: {
  url: string | null | undefined;
  style?: CSSProperties;
  title?: string;
}) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      onClick={(e) => e.stopPropagation()}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 18, height: 18, borderRadius: 4, flexShrink: 0,
        color: 'var(--t3)', textDecoration: 'none', lineHeight: 1,
        ...style,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--acc)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--t3)'; }}
    >
      {/* external-link glyph */}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" y1="14" x2="21" y2="3" />
      </svg>
    </a>
  );
}
