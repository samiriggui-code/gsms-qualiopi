import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiFetch } from '@/lib/api';

// Financeurs (backend/app/funding/router.py), dossiers de pièces (documents/router.py) et besoins
// d'adaptation (journey/router.py). Les états viennent de l'API ; l'écran ne fait que les montrer.

export interface FundingSource {
  id: string;
  dispositif: string;
  libelle: string;
  etat: string;
  financeur: string | null;
  payeur: { type: string; nom: string | null };
  montants: {
    demande: string | null;
    accorde: string | null;
    regle: string | null;
  };
  references: { financeur: string | null; facture: string | null };
  motif: string | null;
}

export interface FundingCase {
  id: string;
  inscription_id: string;
  stagiaire: string;
  session: string;
  statut: 'PENDING' | 'UNFUNDED' | 'PARTIALLY_FUNDED' | 'FUNDED' | 'OVERFUNDED';
  cout: string;
  accorde: string;
  regle: string;
  reste_a_financer: string;
  sources: FundingSource[];
}

export interface FundingDeadline {
  source_id: string;
  dispositif: string;
  action: string;
  libelle: string;
  portail: string | null;
  echeance: string;
  etat: 'EN_RETARD' | 'A_ECHEANCE';
  stagiaire: string;
  session: string;
}

export const useFundingCases = (enabled = true) =>
  useQuery({
    queryKey: ['financement', 'dossiers'],
    queryFn: () => api.get<FundingCase[]>('financement/dossiers'),
    enabled,
    retry: false,
  });

export const useFundingDeadlines = (days = 15, enabled = true) =>
  useQuery({
    queryKey: ['financement', 'echeances', days],
    queryFn: () =>
      api.get<FundingDeadline[]>(`financement/echeances?jours=${days}`),
    enabled,
    retry: false,
  });

export type PieceState =
  | 'MANQUANTE'
  | 'DEMANDEE'
  | 'EN_RETARD'
  | 'A_COMPLETER'
  | 'RECUE'
  | 'VALIDEE'
  | 'REJETEE'
  | 'EXPIREE';

export interface GridPoint {
  code: string;
  question: string;
  exigence: 'REFERENTIEL' | 'GSMS';
  source?: string;
}

export interface DossierItem {
  code: string;
  label: string;
  required: boolean;
  indicators: number[];
  state: PieceState;
  modele: boolean;
  grille: GridPoint[];
  document: {
    id: string;
    version: number;
    name: string;
    uploaded_at: string;
    by: string | null;
    support: string | null;
  } | null;
  evidence: {
    reference: string;
    status: string;
    valid_until: string | null;
  } | null;
  request: { from: string; due_on: string } | null;
}

export interface Dossier {
  subject: string;
  subject_id: string;
  label: string;
  items: DossierItem[];
  complete: number;
  required: number;
}

export const useDossier = (subject: string, id: string | null | undefined) =>
  useQuery({
    queryKey: ['dossier', subject, id],
    queryFn: () => api.get<Dossier>(`dossiers/${subject}/${id}`),
    enabled: !!id,
  });

export function useUploadPiece(subject: string, id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      requirement,
      file,
      grille,
      note,
    }: {
      requirement: string;
      file: File;
      grille: Record<string, string>;
      note?: string;
    }) => {
      const form = new FormData();
      form.append('file', file);
      form.append('grille', JSON.stringify(grille));
      if (note) form.append('note', note);
      return apiFetch(`/v1/dossiers/${subject}/${id}/pieces/${requirement}`, {
        method: 'POST',
        body: form,
      });
    },
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ['dossier', subject, id] }),
  });
}

export const modelUrl = (subject: string, requirement: string) =>
  `/api/backend/v1/dossiers/${subject}/modeles/${requirement}`;
export const contentUrl = (documentId: string) =>
  `/api/backend/v1/documents/${documentId}/contenu`;

export interface Adaptation {
  inscription: string;
  session_id: string;
  session: string;
  stagiaire: string;
  statut: 'AUCUNE' | 'A_TRAITER' | 'VALIDEE' | 'MISE_EN_OEUVRE';
  besoin: string | null;
  recueilli_le: string | null;
}

export const useAdaptations = () =>
  useQuery({
    queryKey: ['parcours', 'adaptations'],
    queryFn: () => api.get<Adaptation[]>('parcours/adaptations'),
  });
