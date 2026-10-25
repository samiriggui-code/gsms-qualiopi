import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Decision, ReadinessStatus } from './types';

// Évaluations du moteur : dernières passes, état par indicateur, résultats des contrôles et constats
// (backend/app/qualiopi/ecrans.py). « Tout réévaluer » : POST /qualiopi/evaluate.

export interface EvaluationRun {
  id: string;
  declencheur: string;
  portee: string;
  cible: string;
  debut: string | null;
  fin: string | null;
  resultats: number;
  indicateurs: number[] | null;
}

export interface EvaluationsOverview {
  referentiel: string;
  periode: { start: string | null; end: string | null; label: string };
  derniere: EvaluationRun | null;
  evaluations: EvaluationRun[];
  indicateurs: {
    numero: number;
    critere: number | null;
    critere_nom: string | null;
    etat: ReadinessStatus;
    resultats: Partial<Record<ReadinessStatus, number>>;
    controles: number;
    ecarts_ouverts: number;
  }[];
  capabilities: { reevaluer: Decision };
  avertissement: string;
}

export interface ControlResultRow {
  id: string;
  indicateur: number;
  controle: string;
  libelle: string;
  cible: string;
  type_cible: string;
  session_id: string | null;
  etat: ReadinessStatus;
  attendu: string;
  constate: string;
  explication: string;
  manquants: Record<string, unknown>[];
  revue_humaine: boolean;
  evalue_le: string | null;
  preuves: string[];
}

export interface FindingRow {
  id: string;
  reference: string;
  origine: 'CONTROLE' | 'AUDIT';
  indicateur: number;
  titre: string;
  explication: string;
  a_faire: string;
  gravite: string;
  etat_moteur: string;
  statut: string;
  statut_libelle: string;
  cible: string;
  session_id: string | null;
  constate_le: string | null;
  vu_le: string | null;
  resolu_le: string | null;
}

const keys = {
  overview: ['qualiopi', 'evaluations'] as const,
  results: (indicateur?: number, etat?: string) =>
    [
      'qualiopi',
      'evaluations',
      'resultats',
      indicateur ?? 0,
      etat ?? '',
    ] as const,
  findings: ['qualiopi', 'constats'] as const,
};

export const useEvaluations = () =>
  useQuery({
    queryKey: keys.overview,
    queryFn: () => api.get<EvaluationsOverview>('qualiopi/evaluations'),
  });

export function useControlResults(indicateur?: number, etat?: string) {
  const p = new URLSearchParams();
  if (indicateur) p.set('indicateur', String(indicateur));
  if (etat) p.set('etat', etat);
  const qs = p.toString();
  return useQuery({
    queryKey: keys.results(indicateur, etat),
    queryFn: () =>
      api.get<{ total: number; resultats: ControlResultRow[] }>(
        `qualiopi/evaluations/resultats${qs ? `?${qs}` : ''}`,
      ),
    placeholderData: (previous) => previous,
  });
}

export const useFindings = () =>
  useQuery({
    queryKey: keys.findings,
    queryFn: () => api.get<FindingRow[]>('qualiopi/constats'),
  });

export function useReevaluate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<Record<string, unknown>>('qualiopi/evaluate'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['qualiopi'] }),
  });
}

// Vue Qualiopi d'une formation (/qualiopi/formations/{id}) : par indicateur, l'état calculé par le moteur sur
// les contrôles de la formation et de ses sessions, ses preuves et ses écarts ouverts.
export interface FormationQualiopi {
  formation: { id: string; code: string; titre: string };
  sessions: number;
  indicateurs: {
    numero: number;
    nom: string;
    etat: ReadinessStatus;
    controles: Omit<ControlResultRow, 'indicateur' | 'controle'>[];
  }[];
  preuves: {
    total: number;
    exploitables: number;
    liste: {
      id: string;
      reference: string;
      libelle: string;
      type_libelle: string;
      statut: string;
      statut_libelle: string;
      cible: string;
      produite_le: string | null;
      document_id: string | null;
      indicateurs: number[];
    }[];
  };
  ecarts: {
    id: string;
    reference: string;
    indicateur: number;
    titre: string;
    a_faire: string;
    statut_libelle: string;
    session_id: string | null;
    constate_le: string | null;
  }[];
  avertissement: string;
}

export const useFormationQualiopi = (id: string | undefined, enabled = true) =>
  useQuery({
    queryKey: ['qualiopi', 'formation', id],
    queryFn: () => api.get<FormationQualiopi>(`qualiopi/formations/${id}`),
    enabled: enabled && !!id,
  });
