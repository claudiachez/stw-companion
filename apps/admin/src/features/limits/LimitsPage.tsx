import { LimitsPanel, RegimeLight } from '@stw/ui';

// Admin-only shell around the shared LimitsPanel (plans/integrity-guardrails.md
// Item 2, now shared with apps/web's Premium-gated subscriber version — see
// packages/ui/src/features/limits/LimitsPanel.tsx). Evaluates the signed-in
// admin's OWN IBKR book — never STW's stated portfolio (holdings.current_weight),
// see the spec's data-domain note. RegimeLight self-gates on isAdmin.
export function LimitsPage() {
  return (
    <div className="flex-1 overflow-auto px-4 py-6 flex flex-col gap-4">
      <div className="max-w-2xl mx-auto w-full">
        <RegimeLight instrument="IWM" />
      </div>
      <LimitsPanel />
    </div>
  );
}
