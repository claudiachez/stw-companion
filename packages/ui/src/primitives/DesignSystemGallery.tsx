import { useState } from 'react';
import { FONT_SIZE, FONT_WEIGHT, SPACE } from '@stw/shared';
import { StatusPill } from './StatusPill';
import { Badge } from './Badge';
import { KpiCard } from './KpiCard';
import { SectionHeader } from './SectionHeader';
import { Button } from './Button';
import { DataTable, type DataTableColumn } from './DataTable';
import { DetailPane, DetailPaneMetricLabel } from './DetailPane';
import { ListDetailSplit } from './ListDetailSplit';
import { FormRow } from './FormRow';
import { EmptyState } from './EmptyState';
import { AlertStrip } from './AlertStrip';
import { SubNav } from './SubNav';
import { Modal } from './Modal';
import { Icon, type IconName } from './Icon';
import { TextInput } from './TextInput';

// Phase 3 checkpoint deliverable (plans/stw-design-system.md §CHECKPOINT 3) — a plain
// internal route for visual review, since neither app has Storybook. Not linked from any
// subscriber-facing nav; wired only into apps/admin's router for this review.
// docs/design-system/tokens.md is the token reference this gallery renders against.

const H2: React.CSSProperties = { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: 'var(--text)', margin: `${SPACE[6]}px 0 ${SPACE[3]}px` };
const ROW: React.CSSProperties = { display: 'flex', gap: SPACE[3], flexWrap: 'wrap', alignItems: 'center' };

interface DemoRow { key: string; ticker: string; instrument: string; pnl: number; }
const DEMO_ROWS: DemoRow[] = [
  { key: '1', ticker: 'ADEA', instrument: '$12.5C Jan \'27', pnl: 34.2 },
  { key: '2', ticker: 'CXDO', instrument: 'Shares', pnl: -6.1 },
];
const DEMO_COLUMNS: DataTableColumn<DemoRow>[] = [
  { key: 'ticker', header: 'Ticker', render: (r) => r.ticker, subCaption: (r) => r.instrument },
  { key: 'pnl', header: 'P&L', numeric: true, render: (r) => `${r.pnl >= 0 ? '+' : ''}${r.pnl.toFixed(1)}%` },
];

export function DesignSystemGallery() {
  const [tab, setTab] = useState<'a' | 'b' | 'c'>('a');
  const [modalOpen, setModalOpen] = useState(false);
  const [splitSelected, setSplitSelected] = useState(false);

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: `${SPACE[5]}px ${SPACE[6]}px`, maxWidth: 900 }}>
      <div style={{ fontSize: FONT_SIZE.display, fontWeight: FONT_WEIGHT.bold, color: 'var(--text)' }}>Design System — Component Gallery</div>
      <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t3)', marginTop: SPACE[1] }}>
        Phase 3 review — every component below consumes tokens only. See docs/design-system/tokens.md.
      </div>

      <div style={H2}>StatusPill</div>
      <div style={ROW}>
        <StatusPill variant="ok">OK</StatusPill>
        <StatusPill variant="near">Near limit</StatusPill>
        <StatusPill variant="breach">Breach</StatusPill>
        <StatusPill variant="unevaluated">Unevaluated</StatusPill>
        <StatusPill variant="info">Info</StatusPill>
        <StatusPill variant="neutral">Not connected</StatusPill>
      </div>

      <div style={H2}>Badge</div>
      <div style={ROW}>
        <Badge kind="source" trader="STW" />
        <Badge kind="source" trader="Graddox" />
        <Badge kind="category" category="Robotics + Edge AI" />
        <Badge kind="category" category="Nuclear" />
        <Badge kind="tier" tier={5} />
        <Badge kind="tier" tier={1} />
        <Badge kind="flag" label="Mid-Term Caution" />
        <Badge kind="flag" label="Review Flag" tone="negative" />
        <Badge kind="action" action="New" />
        <Badge kind="action" action="Upsized" />
        <Badge kind="action" action="Trimmed" />
        <Badge kind="action" action="Closed" />
      </div>

      <div style={H2}>Icon</div>
      <div style={ROW}>
        {(['info', 'positive', 'warning', 'negative', 'close', 'up', 'down', 'flat'] as IconName[]).map((n) => (
          <div key={n} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SPACE[1], color: 'var(--t2)' }}>
            <Icon name={n} size={18} />
            <span style={{ fontSize: FONT_SIZE['2xs'], color: 'var(--t3)' }}>{n}</span>
          </div>
        ))}
      </div>

      <div style={H2}>KpiCard</div>
      <div style={ROW}>
        <KpiCard label="Active Holdings" primaryValue={24} />
        <KpiCard label="Avg Return" primaryValue="+4.2%" status="positive" delta={{ value: '1.1% (5D)', direction: 'up' }} />
        <KpiCard label="Equity : Options" primaryValue={76} secondaryValue={24} />
      </div>

      <div style={H2}>SectionHeader</div>
      <SectionHeader title="Portfolio Overview" />
      <SectionHeader title="Latest Portfolio Changes" right={<span>Updated: Jul 6 · 8:00 AM ET</span>} />
      <SectionHeader
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: SPACE[1] }}><Icon name="warning" size={11} /> Unpriced Legs (2)</span>}
        color="var(--c3)"
      />

      <div style={H2}>Button</div>
      <div style={ROW}>
        <Button variant="primary">Save</Button>
        <Button variant="primary" dirty>Save (unsaved changes)</Button>
        <Button variant="primary" disabled>Save</Button>
        <Button variant="secondary">Sync Portfolio</Button>
        <Button variant="ghost">Cancel</Button>
        <Button variant="destructive">Delete</Button>
      </div>

      <div style={H2}>DataTable</div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <DataTable columns={DEMO_COLUMNS} rows={DEMO_ROWS} rowKey={(r) => r.key} />
      </div>

      <div style={H2}>FormRow + TextInput</div>
      <div style={{ maxWidth: 360, display: 'flex', flexDirection: 'column', gap: SPACE[3] }}>
        <FormRow label="Flex Token" hint="Stored server-side, never exposed in the browser.">
          <TextInput placeholder="Paste your token" />
        </FormRow>
        <FormRow label="Total Capital" layout="horizontal" prefix="$">
          <TextInput defaultValue={100000} />
        </FormRow>
        <FormRow label="Query ID" hint="invalid=true — focus shows the negative-status color, not a bare browser outline.">
          <TextInput placeholder="e.g. 123456" invalid />
        </FormRow>
      </div>

      <div style={H2}>EmptyState</div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
        <EmptyState message="No positions match your filters." icon={<Icon name="info" size={28} />} action={{ label: 'Clear filters', onClick: () => {} }} />
      </div>

      <div style={H2}>AlertStrip</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE[2] }}>
        <AlertStrip severity="info">Options data synced 4 minutes ago.</AlertStrip>
        <AlertStrip severity="warning" action={{ label: 'Review', onClick: () => {} }}>2 legs are unpriced.</AlertStrip>
        <AlertStrip severity="negative" onDismiss={() => {}}>Sync failed — check your Flex Token.</AlertStrip>
      </div>

      <div style={H2}>SubNav</div>
      <SubNav
        items={[{ value: 'a', label: 'Portfolio Overview' }, { value: 'b', label: 'Ticker Details' }, { value: 'c', label: 'Trades' }]}
        active={tab}
        onChange={setTab}
      />

      <div style={H2}>Modal</div>
      <Button variant="secondary" onClick={() => setModalOpen(true)}>Open modal</Button>
      {modalOpen && (
        <Modal onClose={() => setModalOpen(false)} title="Edit ADEA">
          <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)' }}>Modal content goes here.</div>
          <div style={{ display: 'flex', gap: SPACE[2], marginTop: SPACE[3] }}>
            <Button variant="primary" onClick={() => setModalOpen(false)}>Save</Button>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
          </div>
        </Modal>
      )}

      <div style={H2}>DetailPane + ListDetailSplit</div>
      <div style={{ height: 260, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', display: 'flex' }}>
        <ListDetailSplit
          list={
            <div style={{ padding: SPACE[2] }}>
              <button
                onClick={() => setSplitSelected((v) => !v)}
                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 5, padding: '6px 10px', color: 'var(--text)', cursor: 'pointer', fontSize: FONT_SIZE.sm }}
              >
                {splitSelected ? 'Deselect' : 'Select ADEA'}
              </button>
            </div>
          }
          detail={splitSelected ? (
            <DetailPane
              title="ADEA"
              subtitle="Adeia Inc."
              badges={<Badge kind="tier" tier={5} />}
              onClose={() => setSplitSelected(false)}
              metrics={[
                { key: 'price', content: <><DetailPaneMetricLabel>Live Market</DetailPaneMetricLabel><div style={{ fontSize: FONT_SIZE.lg, fontWeight: 700, color: 'var(--text)' }}>$14.32</div></> },
                { key: 'pnl', content: <><DetailPaneMetricLabel>Open P&L</DetailPaneMetricLabel><div style={{ fontSize: FONT_SIZE.lg, fontWeight: 700, color: 'var(--pnl-gain)' }}>+34.2%</div></> },
              ]}
            >
              <div style={{ fontSize: FONT_SIZE.sm, color: 'var(--t2)' }}>Stacked section cards go here.</div>
            </DetailPane>
          ) : null}
        />
      </div>
    </div>
  );
}
