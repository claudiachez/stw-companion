import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchRiskConfig, fetchSectorMap, fetchViolationAcks, upsertViolationAck,
  ensureRiskConfig, saveRiskConfig, type RiskConfigRow,
  type ViolationType, type AckStatus,
} from './api';

export function useRiskConfig(userId: string | undefined) {
  return useQuery({
    queryKey: ['risk-config', userId],
    queryFn: () => fetchRiskConfig(userId!),
    enabled: !!userId,
  });
}

/**
 * Auto-creates a default risk_config row the first time a user without one
 * loads the Limits panel (subscribers don't get a seeded row like the
 * operator did in migration 055). No-op once a row exists.
 */
export function useEnsureRiskConfig(userId: string | undefined, config: RiskConfigRow | null | undefined, isLoading: boolean) {
  const qc = useQueryClient();
  const attempted = useRef(false);
  useEffect(() => {
    if (!userId || isLoading || config || attempted.current) return;
    attempted.current = true;
    ensureRiskConfig(userId).then(() => qc.invalidateQueries({ queryKey: ['risk-config', userId] }));
  }, [userId, config, isLoading, qc]);
}

export function useSaveRiskConfig(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Parameters<typeof saveRiskConfig>[1]) => saveRiskConfig(userId!, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['risk-config', userId] }),
  });
}

export function useSectorMap() {
  return useQuery({ queryKey: ['ticker-sector-map'], queryFn: fetchSectorMap, staleTime: 60 * 60 * 1000 });
}

export function useViolationAcks(userId: string | undefined) {
  return useQuery({
    queryKey: ['risk-violation-acks', userId],
    queryFn: () => fetchViolationAcks(userId!),
    enabled: !!userId,
  });
}

export function useAcknowledgeViolation(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      scope: string; violationType: ViolationType; status: AckStatus;
      glidePathNote?: string | null; glidePathTargetDate?: string | null;
    }) => upsertViolationAck(userId!, args.scope, args.violationType, args.status, args.glidePathNote, args.glidePathTargetDate),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['risk-violation-acks', userId] }),
  });
}
