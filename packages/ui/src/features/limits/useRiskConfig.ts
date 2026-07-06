import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchRiskConfig, fetchSectorMap, fetchViolationAcks, upsertViolationAck,
  type ViolationType, type AckStatus,
} from './api';

export function useRiskConfig(userId: string | undefined) {
  return useQuery({
    queryKey: ['risk-config', userId],
    queryFn: () => fetchRiskConfig(userId!),
    enabled: !!userId,
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
