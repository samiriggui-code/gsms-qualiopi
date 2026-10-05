import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Decision } from './types';

// Offre de formation : résultats mesurés par formation (I2, I3) et ressources pédagogiques (I19)
// (backend/app/training/offre.py). Les taux sont calculés par l'API ; l'écran ne fait que les montrer.

export interface Measure {
  sessions: number;
  stagiaires: number;
  abandons: number;
  examines: number;
  reussis: number;
  enquetes: number;
  repondants: number;
  satisfaits: number;
  taux_reussite: number | null;
  taux_abandon: number | null;
  taux_reponse: number | null;
  taux_satisfaction: number | null;
  note_moyenne: number | null;
}

export interface ResultsBasis {
  du: string;
  au: string;
  sessions: number;
  stagiaires: number;
  examines: number;
  repondants: number;
  publie_le: string;
  publie_par: string;
}

export interface ProgramResults {
  id: string;
  code: string;
  title: string;
  is_certifying: boolean;
  mesure: Measure | null;
  publie: {
    taux_reussite: number | null;
    taux_satisfaction: number | null;
    base: ResultsBasis | null;
  };
  ecarts: string[];
  capabilities: { publier: Decision };
}

export interface ResultsOverview {
  periode: { du: string; au: string; mois: number };
  methode: Record<'periode' | 'reussite' | 'abandon' | 'satisfaction', string>;
  totaux: Omit<Measure, 'taux_reponse' | 'note_moyenne'>;
  formations_mesurees: number;
  formations: ProgramResults[];
}

export interface TrainingResource {
  id: string;
  program_id: string;
  program_code: string;
  program_title: string;
  title: string;
  kind: string;
  module_code: string | null;
  origin: string;
  source_ref: string | null;
  rights: string;
  rights_note: string | null;
  status: string;
  note: string | null;
  created_by: string | null;
  [key: string]: unknown;
}

export interface ResourcesOverview {
  ressources: TrainingResource[];
  formations: { id: string; code: string; title: string; ressources: number }[];
  capabilities: { ecrire: Decision };
}

export const useResults = (mois: number) =>
  useQuery({
    queryKey: ['formation', 'resultats', mois],
    queryFn: () => api.get<ResultsOverview>(`formation/resultats?mois=${mois}`),
    placeholderData: (previous) => previous,
  });

export function usePublishResults() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, mois }: { id: string; mois: number }) =>
      api.post(`formation/resultats/${id}/publication`, { mois }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['formation'] }),
  });
}

export const useTrainingResources = () =>
  useQuery({
    queryKey: ['formation', 'ressources'],
    queryFn: () => api.get<ResourcesOverview>('formation/ressources'),
  });

// Création, modification et suppression passent par la fiche formation (fiches/{id}/ressources).
export function useResourceSave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      programId,
      id,
      body,
    }: {
      programId: string;
      id?: string;
      body: Record<string, unknown>;
    }) =>
      id
        ? api.patch(`fiches/${programId}/ressources/${id}`, body)
        : api.post(`fiches/${programId}/ressources`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['formation'] }),
  });
}

export function useResourceDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ programId, id }: { programId: string; id: string }) =>
      api.delete(`fiches/${programId}/ressources/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['formation'] }),
  });
}
