import type { IbkrOrderSpec, IbkrOrderResult } from '@stw/ui';

// Same local proxy as IbkrBadge.tsx's pricer — admin-only, never deployed. This
// is the one place in the whole app that actually calls /place_order; LegTimeline
// (in @stw/ui, shared with apps/web) only ever sees this via the
// AppCapabilities.onExecuteIbkrOrder injection wired in main.tsx.
const PROXY_URL =
  (import.meta.env.VITE_IBKR_PROXY_URL as string | undefined) ?? 'https://localhost:8765';

export async function executeIbkrOrder(spec: IbkrOrderSpec): Promise<IbkrOrderResult> {
  const res = await fetch(`${PROXY_URL}/place_order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(spec),
  });
  const data = (await res.json()) as IbkrOrderResult;
  if (!res.ok && !data?.error) throw new Error(`HTTP ${res.status}`);
  return data;
}
