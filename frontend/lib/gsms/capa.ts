import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Capabilities, Decision } from './types';

// Actions correctives et préventives (backend/app/qualiopi/router.py, capa/policy.py).

export type CapaStatus =
  | 'OUVERTE'
  | 'EN_COURS'
  | 'A_VERIFIER'
  | 'CLOTUREE'
  | 'ANNULEE';
export type CapaStep = 'demarrer' | 'realiser' | 'verifier' | 'annuler';

export interface CapaAction {
  id: string;
  reference: string;
  type: 'CORRECTIVE' | 'PREVENTIVE';
  titre: string;
  cause: string | null;
  plan: string;
  responsable: string;
  echeance: string;
  statut: CapaStatus;
  statut_libelle: string;
  en_retard: boolean;
  realisation: string | null;
  realisee_le: string | null;
  verification: string | null;
  verifiee_par: string | null;
  cloturee_le: string | null;
  ecart: {
    id: string;
    reference: string;
    indicateur: number;
    titre: string;
  } | null;
  historique: {
    le: string | null;
    type: string;
    detail: string | null;
    par: string;
  }[];
  capabilities: Capabilities;
}

export interface Finding {
  id: string;
  reference: string;
  origine: 'CONTROLE' | 'AUDIT';
  indicateur: number;
  titre: string;
  explication: string;
  remediation: string;
  gravite: string;
  statut: string;
  session: string | null;
  constate_le: string;
  ouvrir_action: Decision;
}

export interface NewCapa {
  titre: string;
  plan: string;
  responsable: string;
  echeance: string;
  cause?: string | null;
  type: 'CORRECTIVE' | 'PREVENTIVE';
}

const keys = {
  actions: ['qualiopi', 'actions'] as const,
  findings: ['qualiopi', 'ecarts'] as const,
};

export const useCapaActions = () =>
  useQuery({
    queryKey: keys.actions,
    queryFn: () => api.get<CapaAction[]>('qualiopi/actions'),
  });

export const useOpenFindings = (enabled = true) =>
  useQuery({
    queryKey: keys.findings,
    queryFn: () => api.get<Finding[]>('qualiopi/ecarts'),
    enabled,
  });

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: keys.actions });
    qc.invalidateQueries({ queryKey: keys.findings });
  };
}

export function useCapaStep() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      id,
      step,
      note,
      motif,
    }: {
      id: string;
      step: CapaStep;
      note?: string;
      motif?: string;
    }) =>
      api.post<CapaAction>(`qualiopi/actions/${id}/${step}`, {
        note: note || null,
        motif: motif || null,
      }),
    onSuccess: invalidate,
  });
}

export function useOpenCapa() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ findingId, body }: { findingId: string; body: NewCapa }) =>
      api.post<CapaAction>(`qualiopi/ecarts/${findingId}/actions`, body),
    onSuccess: invalidate,
  });
}
