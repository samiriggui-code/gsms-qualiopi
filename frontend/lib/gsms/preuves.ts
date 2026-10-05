import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { TONE } from './labels';
import type { Decision } from './types';

// Preuves du moteur Qualiopi (backend/app/qualiopi/ecrans.py) et décision humaine
// (POST /evidence/{id}/validation). Les décisions possibles viennent de l'API.

export type EvidenceStatus =
  | 'DETECTEE'
  | 'DOCUMENTEE'
  | 'EXPLOITABLE'
  | 'VALIDEE'
  | 'EXPIREE'
  | 'REJETEE'
  | 'RETIREE';

export interface EvidenceRow {
  id: string;
  reference: string;
  libelle: string;
  type: string;
  type_libelle: string;
  statut: EvidenceStatus;
  statut_libelle: string;
  portee: string;
  portee_libelle: string;
  cible: string;
  session_id: string | null;
  produite_le: string | null;
  valide_jusqu_au: string | null;
  par: string | null;
  indicateurs: number[];
  problemes: string[];
  document_id: string | null;
  detectee_le: string | null;
  capabilities: { valider: Decision; rejeter: Decision };
}

export interface EvidenceList {
  total: number;
  affichees: number;
  par_statut: { statut: EvidenceStatus; libelle: string; nombre: number }[];
  types: { type: string; libelle: string }[];
  preuves: EvidenceRow[];
}

export type GridAnswer = 'OUI' | 'NON' | 'SANS_OBJET';

export interface EvidenceDetail extends EvidenceRow {
  liens: {
    indicateur: number;
    titre: string | null;
    origine: string;
    statut: string;
    raison: string | null;
  }[];
  grille: {
    code: string;
    question: string;
    exigence: string;
    sans_objet_possible: boolean;
  }[];
  decisions: {
    decision: 'VALIDEE' | 'REJETEE';
    commentaire: string | null;
    par: string;
    le: string | null;
    auto_validee: boolean;
    grille: Record<string, { reponse: GridAnswer; question: string }>;
  }[];
  historique: {
    le: string | null;
    type: string;
    libelle: string;
    de: string | null;
    vers: string | null;
    detail: string | null;
    par: string | null;
  }[];
}

export interface EvidenceFilters {
  statut: EvidenceStatus[];
  type?: string;
  indicateur?: number;
  recherche?: string;
}

// Statut d'une preuve → couleur de badge (cycle de vie de la preuve, pas un verdict de conformité).
export const EVIDENCE_TONE: Record<EvidenceStatus, string> = {
  DETECTEE: TONE.neutral,
  DOCUMENTEE: TONE.info,
  EXPLOITABLE: TONE.ok,
  VALIDEE: TONE.ok,
  EXPIREE: TONE.warn,
  REJETEE: TONE.danger,
  RETIREE: TONE.neutral,
};

export const EVIDENCE_STATUS_HELP: Record<EvidenceStatus, string> = {
  DETECTEE: 'La donnée existe, il manque un élément de forme.',
  DOCUMENTEE: 'Un document est rattaché, un point de forme reste à corriger.',
  EXPLOITABLE:
    'Les contrôles de forme passent : en attente de relecture humaine.',
  VALIDEE: 'Relue et acceptée par un membre de l’équipe.',
  EXPIREE: 'Sa date de validité est dépassée.',
  REJETEE: 'Refusée par un membre de l’équipe, avec son motif.',
  RETIREE: 'La donnée source a été supprimée.',
};

const keys = {
  all: ['qualiopi', 'preuves'] as const,
  list: (f: EvidenceFilters) => ['qualiopi', 'preuves', 'liste', f] as const,
  detail: (id: string) => ['qualiopi', 'preuves', id] as const,
};

function query(f: EvidenceFilters) {
  const p = new URLSearchParams();
  f.statut.forEach((s) => p.append('statut', s));
  if (f.type) p.set('type', f.type);
  if (f.indicateur) p.set('indicateur', String(f.indicateur));
  if (f.recherche?.trim()) p.set('recherche', f.recherche.trim());
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const useEvidenceList = (filters: EvidenceFilters) =>
  useQuery({
    queryKey: keys.list(filters),
    queryFn: () => api.get<EvidenceList>(`qualiopi/preuves${query(filters)}`),
    placeholderData: (previous) => previous,
  });

export const useEvidence = (id: string | null) =>
  useQuery({
    queryKey: keys.detail(id ?? ''),
    queryFn: () => api.get<EvidenceDetail>(`qualiopi/preuves/${id}`),
    enabled: !!id,
  });

export function useEvidenceDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      decision,
      comment,
      checklist,
    }: {
      id: string;
      decision: 'VALIDEE' | 'REJETEE';
      comment?: string;
      checklist?: Record<string, GridAnswer>;
    }) =>
      api.post<{ id: string; reference: string; status: string }>(
        `evidence/${id}/validation`,
        { decision, comment: comment || null, checklist: checklist ?? null },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.all });
      qc.invalidateQueries({ queryKey: ['qualiopi'] });
    },
  });
}
