import type { LevelSet } from '../api';

interface Badge { bg: string; color: string; border: string; text: string }
interface Row {
  icon: string;
  price: number;
  label: string;
  sub?: string;
  badge?: Badge;
  current?: boolean;
}

const TARGET_BADGE: Badge = { bg: 'var(--c3bg)', color: 'var(--c3)', border: 'var(--c3b)', text: "Today's Target" };
const DOWNSIDE_BADGE: Badge = { bg: 'var(--c1bg)', color: 'var(--c1)', border: 'var(--c1b)', text: 'Downside Risk' };

interface Props {
  title: string;        // e.g. "📊 SPY Levels"
  levels: LevelSet;     // already scaled (SPY = SPX ÷ 10)
  currentPrice: number | null;
  priceTime?: string;   // e.g. "@ 9:40 AM"
  isQQQ?: boolean;      // only QQQ surfaces the put-support note
}

export function LevelCard({ title, levels, currentPrice, priceTime, isQQQ = false }: Props) {
  const rows = ([
    levels.resistance    != null ? { icon: '🔴', price: levels.resistance,    label: 'Resistance' } : null,
    levels.gex1          != null ? { icon: '🟡', price: levels.gex1,          label: 'GEX1 / Gamma Flat' } : null,
    levels.put_support   != null ? { icon: '🟢', price: levels.put_support,   label: 'Put Support', sub: isQQQ ? (levels.note ?? '') : '' } : null,
    levels.key_target    != null ? { icon: '🎯', price: levels.key_target,    label: 'Key Target', badge: TARGET_BADGE } : null,
    levels.downside_risk != null ? { icon: '⚠️', price: levels.downside_risk, label: 'Downside Risk', badge: DOWNSIDE_BADGE } : null,
    currentPrice         != null ? { icon: '💲', price: currentPrice,         label: 'Current Price', sub: priceTime ?? '', current: true } : null,
  ] as (Row | null)[]).filter((r): r is Row => r !== null);

  // High → low so resistance sits on top, support at the bottom.
  rows.sort((a, b) => b.price - a.price);

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
      <div style={{ padding: '8px 13px', background: 'var(--s2)', borderBottom: '1px solid var(--bsub)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--t2)' }}>
        {title}
      </div>
      {rows.map((r, i) => {
        const fmt = Number.isInteger(r.price) ? r.price.toString() : r.price.toFixed(2);
        return (
          <div
            key={i}
            style={{
              display: 'flex', alignItems: 'center', padding: '8px 13px', gap: 9,
              borderBottom: i === rows.length - 1 ? '1px solid transparent' : '1px solid var(--bsub)',
              background: r.current ? 'var(--c5bg)' : undefined,
            }}
          >
            <span style={{ fontSize: 12, flexShrink: 0, width: 16, textAlign: 'center' }}>{r.icon}</span>
            <span style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', minWidth: 46, color: r.current ? 'var(--c5l)' : undefined }}>
              {fmt}
            </span>
            <span style={{ fontSize: 11, color: 'var(--t2)', flex: 1, lineHeight: 1.35 }}>
              {r.label}
              {r.sub ? <><br /><span style={{ fontSize: 10, color: 'var(--t3)' }}>{r.sub}</span></> : null}
            </span>
            {r.badge && (
              <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 3, whiteSpace: 'nowrap', background: r.badge.bg, color: r.badge.color, border: `1px solid ${r.badge.border}` }}>
                {r.badge.text}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
