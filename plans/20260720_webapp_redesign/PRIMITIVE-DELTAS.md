# Visual re-QA — shared-primitive deltas (for host review)

**RESOLVED (host: change primitives globally)** — commit 68f25c3. All groups below applied at the
primitive: StatusPill, Badge (incl. solid source pill), AlertStrip (full-border box, no icon),
Button (transparent secondary / pale destructive / 12px·6·14·r6), TickerLink 700, SegmentedControl
r6, AccordionList (chevron 16 / bar 32 / no expand tint), RegimeBadge (plain colored text),
DetailPane (radius 10 / inset stat grid / gaps), Modal (neutral border / r12 / plain title).
Two groups **kept, not changed** (would break intent): **FormRow** horizontal-label style (the S1
decision — reversing it restyles every config form) and **TextInput** 16px font floor (prevents
mobile-Safari focus zoom, documented in tokens.ts). Source: pixel-audit workflow wf_4a51f5a2-8c4.


### Profile (12)
  [font-size] Secondary buttons (Manage / Change password / Sign out)
      ref: 12px  |  app: 14px (FONT_SIZE.base)  @ packages/ui/src/primitives/Button.tsx:54
      note: Button primitive hardcodes base(14). Ref buttons are 12px (a sm token exists). Affects all four buttons on this view.
  [background] Secondary buttons (Manage / Change password / Sign out)
      ref: none (transparent)  |  app: var(--s2)  @ packages/ui/src/primitives/Button.tsx:27
      note: Ref secondary buttons are transparent with only a border; the app fills them with --s2.
  [color] Secondary buttons (Manage / Change password / Sign out)
      ref: var(--t2)  |  app: var(--text)  @ packages/ui/src/primitives/Button.tsx:28
      note: Ref label color is the muted --t2; app uses full-strength --text.
  [border-color] Delete account button
      ref: var(--neg-b) (#fca5a5 light / #7f1d1d dark)  |  app: var(--status-negative-text) ↔ --neg (#dc2626 / #ef4444)  @ packages/ui/src/primitives/Button.tsx:39
      note: destructive variant outlines with the strong negative TEXT token; ref outlines with the pale negative BORDER token --neg-b.
  [border] Pending / Rejected alert strip
      ref: 1px solid var(--warn-b) / var(--neg-b) — full box  |  app: 3px solid var(--status-warning-border)/-negative-border — LEFT edge only  @ packages/ui/src/primitives/AlertStrip.tsx:32
      note: Ref draws a full 1px all-around border; AlertStrip draws only a 3px left accent bar. Structural difference.
  [color (body text)] Pending / Rejected alert strip
      ref: var(--t2)  |  app: var(--status-warning-text)/-negative-text (--c3 amber / --c1 red)  @ packages/ui/src/primitives/AlertStrip.tsx:34
      note: Ref body copy is neutral --t2 with only the <b> tinted --warn/--neg; app tints the entire strip's text in the status color.
  [presence (severity icon)] Pending / Rejected alert strip
      ref: no icon  |  app: 14px lucide severity glyph  @ packages/ui/src/primitives/AlertStrip.tsx:39
      note: AlertStrip prepends a severity icon the ref does not have.
  [border-radius] Pending / Rejected alert strip
      ref: 8px  |  app: 6px (RADIUS.md)  @ packages/ui/src/primitives/AlertStrip.tsx:31
  [padding] Status / tier pills
      ref: 2px 10px  |  app: 2px 6px (SPACE[0.5] SPACE[1.5])  @ packages/ui/src/primitives/StatusPill.tsx:47
      note: Horizontal padding 6px vs ref 10px — pills are narrower than the design.
  [letter-spacing] Status / tier pills
      ref: 0.06em  |  app: 0.08em (LETTER_SPACING.label)  @ packages/ui/src/primitives/StatusPill.tsx:54
  [padding] Secondary buttons
      ref: 5px 12px (Manage) / 8px 14px (Account)  |  app: 6px 16px (SPACE[1.5] SPACE[4])  @ packages/ui/src/primitives/Button.tsx:52
      note: Horizontal padding 16px vs ref 12–14px; Account-row vertical 6px vs ref 8px.
  [border-radius] Secondary buttons
      ref: 6px  |  app: 5px (RADIUS.DEFAULT+1)  @ packages/ui/src/primitives/Button.tsx:53
      note: 1px under the ref's 6px on every button.

### Settings (3)
  [font-size / text-transform / color / label-width] Position size caps — row labels ('Any one stock', '…via options only', 'Any one sector', 'Everything combined') + 'Account equity'
      ref: 12px, sentence-case, color var(--text), width 210px, with a 10px 400-weight var(--t3) note stacked beneath the label  |  app: 10px, UPPERCASE, color var(--t3), letter-spacing 0.08em, width 140px (FormRow horizontal); note passed as `hint` → 11px var(--t3) full-width row below the input  @ packages/ui/src/primitives/FormRow.tsx:48
      note: NumRow/equity rows use FormRow layout='horizontal', whose standardized label styling (design-system decision) overrides the mock's ad-hoc label look. Visible restyle across all 4 cap rows + equity row; note also moves from under-label to full-width-below.
  [font-size] IBKR connection editor — Flex token & Flex query ID inputs
      ref: 12px  |  app: TextInput → FONT_SIZE.input = 16px  @ packages/ui/src/primitives/TextInput.tsx:55
      note: TextInput hard-floors font at 16px to prevent mobile-Safari focus zoom (documented in tokens.ts). Ref uses 12px for these two inputs (but 16px for the risk-form inputs, which match). Intentional primitive floor — flagging, not a fix.
  [font-size / padding] IBKR connection editor header — 'Connected' StatusPill
      ref: font-size 9px; padding 1px 8px  |  app: StatusPill fixed: font-size 10px (FONT_SIZE.2xs); padding 2px 6px  @ packages/ui/src/primitives/StatusPill.tsx:50
      note: The top status-strip 'Connected' pill (ref 10px / 2px 6px) matches StatusPill exactly; only this smaller in-editor pill (ref 9px / 1px 8px) differs. StatusPill can't vary per instance.

### GEX Signals (1)
  [border / border-radius / padding / color] Stale-report banner (AlertStrip)
      ref: 1px solid var(--warn-b) all sides, radius 10px, padding 9px 14px, color var(--t2), no icon  |  app: borderLeft 3px only, radius 6px (RADIUS.md), padding 8px 12px, color var(--status-warning-text), leading warning icon  @ packages/ui/src/primitives/AlertStrip.tsx:27
      note: Shared primitive — flag only, do not fix here. Ref banner is a fully-bordered 10px-radius warning box in --t2 text; AlertStrip uses a left-accent bar + icon + status-text color.

### Portfolio Overview (4)
  [background] Attention strip — status pill (StatusPill primitive)
      ref: var(--surface) (hollow white pill)  |  app: var(--status-{role}-bg) (tinted fill, e.g. --status-negative-bg #fee2e2)  @ packages/ui/src/primitives/StatusPill.tsx:50
      note: Ref pill sits on the colored strip with a white/surface fill so it pops; StatusPill fills with the tinted status-bg, which blends into the same-hued strip. Shared across surfaces — do not fix in the view.
  [padding] Attention strip — status pill (StatusPill primitive)
      ref: 2px 8px  |  app: 2px 6px (SPACE[0.5] / SPACE[1.5])  @ packages/ui/src/primitives/StatusPill.tsx:47
      note: Horizontal padding 6px vs ref 8px (2px, beyond tolerance). Primitive.
  [border] Over-cap callout — AlertStrip primitive border
      ref: 1px solid var(--warn-b) on all sides  |  app: border-left 3px solid var(--status-{role}-border) only  @ packages/ui/src/primitives/AlertStrip.tsx:32
      note: Ref callout has a full thin box border; AlertStrip uses a 3px left accent bar and no other border. Also renders a lucide severity icon the ref omits. Primitive — do not fix in the view.
  [color] Over-cap callout — AlertStrip primitive text
      ref: var(--t2) (muted body text)  |  app: var(--status-{role}-text) (colored body text)  @ packages/ui/src/primitives/AlertStrip.tsx:34
      note: Ref callout body is muted --t2; AlertStrip tints the whole body in the severity text color. Primitive.

### Portfolio Risk (2)
  [padding] Status pills (Account safety net, Invested, cap rows, per-stock stops)
      ref: 1px 8px  |  app: 2px 6px  @ packages/ui/src/primitives/StatusPill.tsx:47
      note: Ref's inline pills use padding:1px 8px; StatusPill primitive resolves to SPACE[0.5]/SPACE[1.5] = 2px 6px. Horizontal 6px vs 8px exceeds ±1px. Affects every pill on the page. Do not fix in-view (shared primitive). The verdict-banner pill is inline in the view (2px 8px) and matches.
  [font-weight] Per-stock stops — ticker (TickerLink)
      ref: 700  |  app: 600  @ packages/ui/src/primitives/TickerLink.tsx:24
      note: Ref ticker span is font-weight:700; TickerLink hardcodes fontWeight:600 and the view passes no override at ViolationsSummary.tsx:582, so it renders 600.

### Portfolio Tailing (1)
  [background / color] Source badge (STW pill in §1 summary header) — via Badge primitive
      ref: background var(--acc); color #ffffff (solid green pill, white text)  |  app: background var(--c5bg); color var(--acc); border var(--c5b) (tinted chip, green text)  @ packages/ui/src/primitives/Badge.tsx:65
      note: Ref renders STW as a solid-green filled pill with white text; the app's shared Badge kind='source' is a light-green tinted chip with green text + border. Same primitive also differs on border-radius (ref 9999px vs RADIUS.DEFAULT 4px), font-size (ref 11px vs FONT_SIZE['2xs'] 10px), letter-spacing (ref 0.05em vs LETTER_SPACING.label 0.08em) and padding (ref 2px 10px vs SPACE 2px 6px). Shared across every surface — flag only, do not fix in the view.

### Positions list (4)
  [width] Accordion row chevron (AccordionList)
      ref: 16px  |  app: 8px  @ packages/ui/src/primitives/AccordionList.tsx:51
      note: Shared primitive — flag only; also drives the app's 8px header chevron column
  [height] Accordion row accent bar (AccordionList)
      ref: 32px  |  app: 30px  @ packages/ui/src/primitives/AccordionList.tsx:58
      note: Shared primitive — 2px shorter than ref conviction bar
  [background] Accordion expanded-row header background (AccordionList)
      ref: transparent (header unchanged on expand)  |  app: var(--c5bg)  @ packages/ui/src/primitives/AccordionList.tsx:44
      note: Ref does not tint the summary row when expanded; app fills it with c5bg
  [border-radius] SegmentedControl button wrapper
      ref: 6px  |  app: 5px (RADIUS.DEFAULT+1 literal)  @ packages/ui/src/primitives/SegmentedControl.tsx:39
      note: Shared primitive; the file's own anatomy comment says 6px but codes 5

### Picks list (3)
  [structure (background/border/padding + font metrics)] HoldingRow regime indicator (RegimeBadge)
      ref: plain text: font-size 10px, font-weight 600, colored (pos-t/neg), no background, no border, no padding — single label  |  app: bordered pill chip(s): font-size 10px, font-weight 600, padding 2px 6px, border-radius 4px, background color+18, border 1px color+28 — up to two chips (trend bucket + sector standing)  @ packages/ui/src/features/picks/components/RegimeBadge.tsx:33
      note: Largest divergence. Ref shows one plain colored text regime label; app renders bordered chips via the shared RegimeBadge (reused across HoldingRow, portfolio rows, tables). May be an intentional two-signal enrichment, but it does not match this ref. Shared component — do not fix in place for this view.
  [font-size] HoldingRow basket/action badges (Badge primitive)
      ref: 9px  |  app: 10px (FONT_SIZE['2xs'])  @ packages/ui/src/primitives/Badge.tsx:53
      note: Shared Badge primitive standardizes at 10px; ref badges are 9px. Flag only.
  [letter-spacing] HoldingRow basket/action badges (Badge primitive)
      ref: 0.05em  |  app: 0.08em (LETTER_SPACING.label)  @ packages/ui/src/primitives/Badge.tsx:55
      note: Shared Badge primitive uses 0.08em; ref badges use 0.05em. Flag only.

### Picks Overview (3)
  [font-weight & margin-bottom] SectionHeader (shared) — used for What changed / The book / Weight by basket / Data health
      ref: font-weight 700; header margin-bottom 6px (ref labels also 9px for What-changed & Data-health, inside their cards)  |  app: font-weight 600 (semibold); marginBottom 10px (SPACE[2.5]); 10px (2xs)  @ packages/ui/src/primitives/SectionHeader.tsx:20
      note: Shared primitive — flagged, not fixed. Ref uses bold 700 titles with a 6px gap to the block; app is 600 with a 10px gap. Ref also embeds the What-changed (pos-t colored) and Data-health titles + as-of stamps INSIDE their cards rather than as a SectionHeader above.
  [font-size / font-weight / text-transform] PortfolioHeatmap (shared) — mode/group chips
      ref: 11px, weight 600, no uppercase, per-chip border radius 4  |  app: 10px (2xs), weight 700, uppercase + 0.08em, segmented group radius 6  @ packages/ui/src/components/PortfolioHeatmap.tsx:84
      note: Shared component reused across surfaces — flagged, not fixed. Ref chip font is 11px (xs token exists) vs app 10px; ref labels are Title-case ('Total return') vs app uppercase.
  [border] PortfolioHeatmap (shared) — treemap canvas
      ref: 1px solid var(--bsub)  |  app: none (no border on the canvas div)  @ packages/ui/src/components/PortfolioHeatmap.tsx:198
      note: Shared component — flagged, not fixed. Ref outlines the 200px heatmap box in --bsub; app canvas has border-radius 8 + bg but no border. Ref canvas is fixed 200px tall vs app's width-derived height.

### Picks Trades (2)
  [border-radius] Segment button group (SegmentedControl)
      ref: 6px  |  app: 5px  @ packages/ui/src/primitives/SegmentedControl.tsx:39
      note: Shared primitive — flag only. Ref segment group is 6px; primitive is 5px.
  [font-weight] Lot ticker link (TickerLink)
      ref: 700  |  app: 600  @ packages/ui/src/primitives/TickerLink.tsx:24
      note: Shared primitive — flag only. Ref trade-row ticker anchor is font-weight:700; TickerLink hardcodes 600 (call site only passes fontSize.sms=13, matching).

### Admin edit forms (Log-a-transaction / EventForm + Edit-position / PositionEditor) (5)
  [border-color] Modal card container
      ref: var(--border)  |  app: var(--acc) (accentColor default)  @ packages/ui/src/primitives/Modal.tsx:35
      note: Ref modal card border is --border; Modal primitive uses a 1px accent-green border by design. Shared — not fixed.
  [border-radius] Modal card container
      ref: 12px  |  app: 10px  @ packages/ui/src/primitives/Modal.tsx:35
  [box-shadow] Modal card container
      ref: 0 12px 32px rgba(0,0,0,0.12)  |  app: 0 12px 40px rgba(0,0,0,0.5)  @ packages/ui/src/primitives/Modal.tsx:36
      note: SHADOW.modal is heavier/darker than the ref card shadow.
  [font-size / weight / color / text-transform] Modal title
      ref: 14px / 700 / var(--text) / none  |  app: 12px (sm) / 600 / var(--acc) / uppercase +0.08em  @ packages/ui/src/primitives/Modal.tsx:40
      note: Ref modal title is a plain 14px/700 --text heading; the primitive renders an uppercase 12px accent-colored title. Shared — not fixed.
  [border-radius / font-size / font-weight] Button primitive (PositionEditor Save/Cancel)
      ref: 6px / 13px / 700  |  app: 5px (RADIUS.DEFAULT+1) / 14px (base) / 600 (semibold)  @ packages/ui/src/primitives/Button.tsx:53
      note: PositionEditor Save/Cancel use the Button primitive; ref buttons are radius 6, 13px, 700. Padding 6px 16px vs ref 7px 16px within tolerance. Shared — not fixed. (EventForm's inline buttons carry these same deltas as bespoke — see above.)

### Detail panes (8)
  [horizontal inset / border extent] Stat block grid (both panes)
      ref: grid nested inside padding:14px 16px 0 — top/bottom hairlines inset 16px L/R, first label at ~28px from edge  |  app: grid is a direct child with margin:14px 0 and no horizontal padding — hairlines run full-bleed edge-to-edge, first label at 14px  @ packages/ui/src/primitives/DetailPane.tsx:79
      note: Most visible structural miss: the ref's stat-row hairlines are inset to align under the header text; the app's span the whole pane width.
  [font-weight] Pane header title (both panes)
      ref: 800  |  app: 700 (FONT_WEIGHT.bold)  @ packages/ui/src/primitives/DetailPane.tsx:54
      note: No 800 token exists; the max is bold=700. The 22px ticker title reads visibly lighter than the ref.
  [border-radius] Section card (DetailPaneSection, every card)
      ref: 10px  |  app: 8px (RADIUS.lg)  @ packages/ui/src/primitives/DetailPane.tsx:115
      note: No 10px radius token; affects every stacked section card in both panes. Same 10→8 applies to the "Why STW holds it" green card below.
  [margin-top] Pane header subtitle
      ref: 1px  |  app: 4px (SPACE[1])  @ packages/ui/src/primitives/DetailPane.tsx:58
  [margin-top] Stat block grid — vertical margin
      ref: 12px  |  app: 14px (SPACE[3.5])  @ packages/ui/src/primitives/DetailPane.tsx:82
  [padding] Stat cell padding
      ref: 10px 12px 12px (t10 r12 b12 l12)  |  app: 10px 14px (t/b 10, l/r 14)  @ packages/ui/src/primitives/DetailPane.tsx:86
      note: L/R 12→14 (+2), bottom 12→10 (-2).
  [gap] Header badge strip — inter-badge gap
      ref: 8px (all title+badges are siblings at gap:8px)  |  app: 4px (SPACE[1]) — badges nested in their own div at gap 4  @ packages/ui/src/primitives/DetailPane.tsx:55
  [letter-spacing] Pane header title (both panes)
      ref: 0.01em  |  app: normal (unset)  @ packages/ui/src/primitives/DetailPane.tsx:54
      note: No 0.01em token; negligible visually.
