import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { TONE } from './labels';
import type { Decision } from './types';

// Documents professionnels (backend/app/editions) : devis préparés, relus, validés puis archivés en version
// figée. Les montants, les vérifications et les actions possibles viennent de l'API ; rien n'est recalculé ici.

export type DocStatus =
  | 'BROUILLON'
  | 'EN_RELECTURE'
  | 'VALIDE'
  | 'ENVOYE'
  | 'ARCHIVE'
  | 'ABANDONNE';

export type DocAction =
  | 'soumettre'
  | 'renvoyer'
  | 'valider'
  | 'envoyer'
  | 'reprendre'
  | 'archiver'
  | 'abandonner';

export interface DocSummary {
  id: string;
  reference: string;
  type: string;
  type_libelle: string;
  titre: string;
  statut: DocStatus;
  statut_libelle: string;
  client: { id: string; nom: string; code: string | null } | null;
  version: number;
  valide_jusqu_au: string | null;
  expire: boolean;
  envoye_le: string | null;
  cree_le: string;
  modifie_le: string;
  par: string | null;
}

export interface DocLine {
  id?: string;
  formation_id: string | null;
  formation?: {
    code: string;
    titre: string;
    prix_a_confirmer: boolean;
  } | null;
  libelle: string;
  detail: string | null;
  quantite: number;
  unite: string;
  prix_unitaire: number | null;
  remise_pct: number;
  montant_ht?: number | null;
}

export interface DocCheck {
  code: string;
  message: string;
  cible:
    | 'organisme'
    | 'parametres'
    | 'entreprise'
    | 'lignes'
    | 'formation'
    | 'document';
  id: string | null;
}

export interface DocDetail extends DocSummary {
  client: {
    id: string;
    nom: string;
    code: string | null;
    siret: string | null;
    adresse: string | null;
    code_postal: string | null;
    ville: string | null;
    contact: string | null;
    email: string | null;
  } | null;
  sections: { titre: string; texte: string }[];
  lignes: DocLine[];
  totaux: {
    total_ht: number;
    tva_regime: 'NON_RENSEIGNE' | 'EXONERE' | 'ASSUJETTI';
    tva_taux: number | null;
    tva: number | null;
    total_ttc: number | null;
    complet: boolean;
    mention_tva: string | null;
  };
  verifications: DocCheck[];
  historique: {
    action: string;
    de: string;
    vers: string;
    par: string;
    le: string;
    motif: string | null;
    version: number | null;
  }[];
  versions: {
    id: string;
    version: number;
    statut: string;
    sha256: string;
    emis_le: string;
    par: string | null;
  }[];
  capabilities: Record<DocAction | 'modifier', Decision>;
}

export interface DocOverview {
  total: number;
  statuts: Record<DocStatus, number>;
  types: { code: string; libelle: string; nombre: number }[];
  valides_par_mois: { mois: string; nombre: number }[];
  alertes: {
    niveau: 'danger' | 'warning' | 'info';
    message: string;
    id: string;
  }[];
  recents: DocSummary[];
}

export interface DocKinds {
  types: { code: string; libelle: string; disponible: boolean }[];
  statuts: Record<DocStatus, string>;
  unites: Record<string, string>;
}

export interface QuoteProgram {
  id: string;
  code: string;
  titre: string;
  prix: number | null;
  prix_a_confirmer: boolean;
  duree_heures: number | null;
}

export interface QuoteClient {
  id: string;
  nom: string;
  code: string | null;
  adresse_complete: boolean;
}

export const DOC_STATUS_TONE: Record<DocStatus, string> = {
  BROUILLON: TONE.neutral,
  EN_RELECTURE: TONE.info,
  VALIDE: TONE.ok,
  ENVOYE: TONE.ok,
  ARCHIVE: TONE.neutral,
  ABANDONNE: TONE.danger,
};

export const DOC_STATUS_COLOR: Record<DocStatus, string> = {
  BROUILLON: 'var(--color-slate-400)',
  EN_RELECTURE: 'var(--color-sky-500)',
  VALIDE: 'var(--color-emerald-500)',
  ENVOYE: 'var(--color-violet-500)',
  ARCHIVE: 'var(--color-amber-500)',
  ABANDONNE: 'var(--color-rose-500)',
};

export const euros = (value: number | null | undefined) =>
  value == null
    ? '—'
    : new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'EUR',
      }).format(value);

// Aperçu imprimable (filigrane tant que le document n'est pas validé) et versions archivées
export const previewUrl = (id: string) =>
  `/api/backend/v1/editions/${id}/apercu`;
export const versionUrl = (id: string, documentId: string) =>
  `/api/backend/v1/editions/${id}/versions/${documentId}`;

const keys = {
  all: ['editions'] as const,
  list: ['editions', 'liste'] as const,
  overview: ['editions', 'synthese'] as const,
  kinds: ['editions', 'types'] as const,
  programs: ['editions', 'formations'] as const,
  clients: ['editions', 'clients'] as const,
  detail: (id: string) => ['editions', 'detail', id] as const,
};

export const useDocuments = () =>
  useQuery({
    queryKey: keys.list,
    queryFn: () => api.get<DocSummary[]>('editions'),
  });

export const useDocumentsOverview = () =>
  useQuery({
    queryKey: keys.overview,
    queryFn: () => api.get<DocOverview>('editions/synthese'),
  });

export const useDocKinds = () =>
  useQuery({
    queryKey: keys.kinds,
    queryFn: () => api.get<DocKinds>('editions/types'),
    staleTime: Infinity,
  });

export const useQuotePrograms = (enabled = true) =>
  useQuery({
    queryKey: keys.programs,
    queryFn: () => api.get<QuoteProgram[]>('editions/formations'),
    enabled,
  });

export const useQuoteClients = (enabled = true) =>
  useQuery({
    queryKey: keys.clients,
    queryFn: () => api.get<QuoteClient[]>('editions/clients'),
    enabled,
  });

export const useDocument = (id: string | null) =>
  useQuery({
    queryKey: keys.detail(id ?? ''),
    queryFn: () => api.get<DocDetail>(`editions/${id}`),
    enabled: !!id,
  });

function useRefresh() {
  const qc = useQueryClient();
  return (doc: DocDetail) => {
    qc.setQueryData(keys.detail(doc.id), doc);
    qc.invalidateQueries({ queryKey: keys.list });
    qc.invalidateQueries({ queryKey: keys.overview });
  };
}

export function useCreateDocument() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (body: { client_id: string; titre?: string; type?: string }) =>
      api.post<DocDetail>('editions', body),
    onSuccess: refresh,
  });
}

export function useUpdateDocument(id: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (body: {
      titre?: string;
      valide_jusqu_au?: string | null;
      sections?: { titre: string; texte: string }[];
    }) => api.patch<DocDetail>(`editions/${id}`, body),
    onSuccess: refresh,
  });
}

export function useSaveLines(id: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (lines: DocLine[]) =>
      api.put<DocDetail>(
        `editions/${id}/lignes`,
        lines.map((l) => ({
          formation_id: l.formation_id,
          libelle: l.libelle,
          detail: l.detail,
          quantite: l.quantite,
          unite: l.unite,
          prix_unitaire: l.prix_unitaire,
          remise_pct: l.remise_pct,
        })),
      ),
    onSuccess: refresh,
  });
}

export function useDocumentAction(id: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({
      action,
      motif,
      date_envoi,
    }: {
      action: DocAction;
      motif?: string;
      date_envoi?: string;
    }) =>
      api.post<DocDetail>(`editions/${id}/actions/${action}`, {
        motif,
        date_envoi,
      }),
    onSuccess: refresh,
  });
}
