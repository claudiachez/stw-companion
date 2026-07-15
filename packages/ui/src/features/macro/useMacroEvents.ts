import { useQuery } from '@tanstack/react-query';
import type { MacroEvent } from '@stw/shared';
import { classifyEventRisk } from '@stw/shared';

interface MacroEventsResponse {
  events: MacroEvent[];
  source: 'FRED' | 'unavailable';
  warning?: string;
}

async function fetchMacroEvents(): Promise<MacroEventsResponse> {
  const res = await fetch('/.netlify/functions/macro-events');
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { const b = await res.json() as { error?: string }; if (b?.error) detail = b.error; } catch { /* non-JSON body */ }
    throw new Error(detail);
  }
  return res.json() as Promise<MacroEventsResponse>;
}

/**
 * Module 3 — Macro Event Risk. Pulls the FRED-sourced calendar rows
 * from the `macro-events` Netlify function (web-only; on admin this 404s and
 * surfaces as `error`, same convention as `useWeeklyRecap`/`MacroRecapCard`)
 * and classifies the current overlay with the pure `classifyEventRisk`.
 */
export function useMacroEvents() {
  const query = useQuery({
    queryKey: ['macro-events'],
    queryFn: fetchMacroEvents,
    // Short staleTime: on a release morning the actual print + favorability arrow
    // should appear promptly, and after a deploy the new payload shape (e.g. the
    // lowerIsBetter field) shouldn't sit behind a long client cache.
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const events = query.data?.events ?? [];
  const read = classifyEventRisk(events);

  return {
    events,
    read,
    sourceUnavailable: query.data?.source === 'unavailable',
    warning: query.data?.warning ?? null,
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
  };
}
