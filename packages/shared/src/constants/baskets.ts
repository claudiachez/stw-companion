// Canonical basket set — single source of truth for both apps.
// Verified identical to the admin dashboard (behavioral source of truth) and the
// web app's former local copy. The DB `holdings.basket` values use these exact
// strings ("+" not "&"). Keyed by string (not BasketName) because the column is
// free-form text; unknown baskets fall back to grey via bColor().
export const BASKET_COLORS: Record<string, string> = {
  'Robotics + Edge AI':             '#7C3AED',
  'Power Infrastructure':           '#16A34A',
  'Datacenter + AI Infrastructure': '#2563EB',
  'Telecom + Voice AI':             '#D97706',
  'U.S. Chips Supply Chain':        '#DC2626',
  'Defense':                        '#a78bfa',
  'AI Fraud / Verified Identity':   '#22d3ee',
  'Nuclear':                        '#fbbf24',
  'Hedge':                          '#14b8a6',
  'Legacy Positions':               '#6b7280',
};

export function bColor(basket: string | null | undefined): string {
  return (basket && BASKET_COLORS[basket]) || '#6b7280';
}
