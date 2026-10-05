import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiFetch } from '@/lib/api';
import type { Capabilities, Decision } from './types';

// Fiche formation versionnée et dossiers de référencement EDOF (backend/app/edof/router.py).
// Le front n'applique aucune règle : contrôles, états et autorisations viennent de l'API.

export type Level = 'BLOQUANT' | 'A_VERIFIER' | 'INFO';
export type Step =
  | 'etablissement'
  | 'programme'
  | 'contenus'
  | 'certification'
  | 'pieces'
  | 'suivi';

export interface Anomaly {
  code: string;
  niveau: Level;
  controle: 'AUTO' | 'HUMAIN';
  message: string;
  etape: Step;
  detail: string | null;
  cible: {
    type?: string;
    code?: string;
    champ?: string;
    id?: string;
    quoi?: string;
    piece_id?: string;
  };
}

export type DisplayStatus =
  | 'INCOMPLET'
  | 'PRET_VALIDATION_INTERNE'
  | 'VALIDE_INTERNE'
  | 'DEPOSE'
  | 'COMPLEMENTS_DEMANDES'
  | 'DECISION_RECUE';

export type DossierAction =
  | 'valider'
  | 'rouvrir'
  | 'declarer_depot'
  | 'enregistrer_complements'
  | 'declarer_complements_transmis'
  | 'enregistrer_decision';

export interface PieceDoc {
  id: string;
  status: 'A_VALIDER' | 'VALIDEE' | 'REJETEE';
  shared: boolean;
  issued_on: string | null;
  valid_until: string | null;
  siret_on_document: string | null;
  validated_by: string | null;
  validated_at: string | null;
  rejection_reason: string | null;
  note: string | null;
  deposited_by: string | null;
  deposited_at: string;
  document: {
    id: string;
    name: string | null;
    version: number;
    sha256: string | null;
    status: string;
    owner: string | null;
    mime: string;
    has_file: boolean;
  } | null;
  restricted: boolean;
}

export type PieceState =
  | 'MANQUANTE'
  | 'A_PREPARER'
  | 'A_DETERMINER'
  | 'NON_APPLICABLE'
  | 'A_VALIDER'
  | 'VALIDEE'
  | 'REJETEE'
  | 'EXPIREE'
  | 'GENEREE';

export interface PieceRow {
  code: string;
  label: string;
  stage: 'FORMULAIRE' | 'AVANT_DEPOT' | 'COMPLEMENT' | 'SUIVI';
  stage_label: string;
  conditions: string[];
  applies: boolean | null;
  group: string | null;
  max_age_days: number | null;
  expires: boolean;
  siret: boolean;
  sensitive: boolean;
  generated: boolean;
  provided_by: string;
  source: string;
  note: string | null;
  state: PieceState;
  piece: PieceDoc | null;
  history: PieceDoc[];
  anomalies: Anomaly[];
}

export interface Complement {
  id: string;
  label: string;
  requirement: string | null;
  requested_on: string;
  due_on: string | null;
  status: 'DEMANDEE' | 'FOURNIE' | 'ANNULEE';
  piece_id: string | null;
  note: string | null;
}

export interface Accompaniment {
  id: string;
  kind: 'WEBINAIRE' | 'PARCOURS' | 'DOCUMENTATION' | 'AUTRE';
  label: string;
  planned_on: string | null;
  done_on: string | null;
  participant: string | null;
  note: string | null;
}

export interface VersionState {
  state: 'JAMAIS_VALIDEE' | 'VALIDEE' | 'MODIFIEE';
  version: number | null;
  version_id?: string;
  validated_by?: string;
  validated_at?: string;
}

export interface Dossier {
  id: string;
  kind: 'ETABLISSEMENT' | 'FORMATION';
  program_id: string | null;
  parent_id: string | null;
  status: string;
  display_status: DisplayStatus;
  display_label: string;
  reminder: string;
  validated_by: string | null;
  validated_at: string | null;
  submitted_on: string | null;
  submitted_by: string | null;
  cdc_reference: string | null;
  decision: 'ACCEPTEE' | 'REFUSEE' | null;
  decision_on: string | null;
  decision_note: string | null;
  submission_snapshot: {
    date: string;
    programme?: { version: number; sha256: string } | null;
  } | null;
  anomalies: Anomaly[];
  counts: Record<Level, number>;
  pieces: PieceRow[];
  complements: Complement[];
  accompaniments: Accompaniment[];
  capabilities: Record<DossierAction, Decision>;
  actions: Record<DossierAction, string>;
  referentiel: { version: string; sources: Record<string, string> };
  program?: { id: string; code: string; title: string };
  version?: VersionState;
  submitted_version?: { id: string; version: number; sha256: string };
}

export interface FormationEntry {
  program_id: string;
  code: string;
  title: string;
  dossier: {
    id: string;
    display_status: DisplayStatus;
    display_label: string;
    blocking: number;
    to_check: number;
  } | null;
}

export interface EstablishmentView {
  organization: {
    id: string;
    name: string;
    siret: string | null;
    nda_number: string | null;
    action_categories: string[];
  };
  establishment: Record<string, unknown> & {
    legal_name: string | null;
    structure_type: string | null;
    representative_kind: string | null;
    efp_connect_status: string;
    qualiopi_categories: string[];
    note: string | null;
    identity_source: string | null;
  };
  dossier: Dossier;
  formations: FormationEntry[];
}

export interface ProgramModule {
  code: string;
  title: string;
  details: string[];
  hours?: number | null;
}

export interface ReviewNote {
  champ: string;
  message: string;
  source: string;
}

export interface Fiche {
  program: Record<string, unknown> & {
    id: string;
    code: string;
    title: string;
    modules: ProgramModule[];
    review_notes: ReviewNote[];
  };
  certification:
    | (Record<string, unknown> & {
        id: string;
        basis: string;
        habilitation: string;
        competence_mapping: {
          competence: string;
          modules: string[];
          evaluation: string;
        }[];
        other_requirements: {
          label: string;
          reference?: string;
          source?: string;
          verified_on?: string;
          verified_by?: string;
        }[];
        checked_on: string | null;
        checked_by: string | null;
        habilitation_checked_on: string | null;
        habilitation_checked_by: string | null;
      })
    | null;
  certification_bases: Record<string, string>;
  habilitations: Record<string, string>;
  delivery_modes: Record<string, string>;
  roles: Record<string, string>;
  trainers: {
    id: string;
    trainer_id: string;
    name: string;
    role: string;
    modules: string[];
    qualifications: {
      label: string;
      kind: string;
      valid_until: string | null;
    }[];
  }[];
  resources: (Record<string, unknown> & {
    id: string;
    title: string;
    kind: string;
    module_code: string | null;
    origin: string;
    rights: string;
    status: string;
    note: string | null;
    source_ref: string | null;
    rights_note: string | null;
  })[];
  missing: { field: string; label: string; message: string }[];
  version_state: VersionState;
  versions: {
    id: string;
    version: number;
    sha256: string;
    validated_by: string;
    validated_at: string;
    note: string | null;
  }[];
  capabilities: Capabilities;
  dossier: { id: string } | null;
}

export interface PublicPreview {
  version: number;
  intitule: string;
  code: string;
  public: string | null;
  objectifs: string[];
  competences: string[];
  prerequis: string[];
  duree_heures: number | null;
  modalite: string | null;
  modules: ProgramModule[];
  methodes: string | null;
  moyens: string | null;
  evaluation: string | null;
  delai_acces: string | null;
  accessibilite: string | null;
  tarif_eur: number | null;
  certification: {
    code: string;
    intitule: string | null;
    certificateur: string | null;
  } | null;
  mention_cpf: string | null;
}

export interface PedagogySummary {
  sessions: {
    session_id: string;
    reference: string;
    start_date: string;
    end_date: string;
    status: string;
    learners: number;
    slots: number;
    attendance: { present: number; expected: number; rate: number | null };
    assessed_learners: number;
    certificates: number;
    abandons: number;
  }[];
  limits: string[];
}

export interface ReusableDocument {
  id: string;
  title: string;
  name: string | null;
  owner: string;
  version: number;
  created_at: string;
}

// --- Lectures ---

export const useEstablishment = () =>
  useQuery({
    queryKey: ['edof', 'etablissement'],
    queryFn: () => api.get<EstablishmentView>('edof/etablissement'),
  });

export const useEdofDossier = (id: string | undefined) =>
  useQuery({
    queryKey: ['edof', 'dossier', id],
    queryFn: () => api.get<Dossier>(`edof/dossiers/${id}`),
    enabled: !!id,
  });

export const useFiche = (programId: string) =>
  useQuery({
    queryKey: ['fiche', programId],
    queryFn: () => api.get<Fiche>(`fiches/${programId}`),
  });

export const usePublicPreview = (
  programId: string,
  versionId: string | undefined,
) =>
  useQuery({
    queryKey: ['fiche', programId, 'apercu', versionId],
    queryFn: () =>
      api.get<PublicPreview>(
        `fiches/${programId}/versions/${versionId}/apercu-public`,
      ),
    enabled: !!versionId,
  });

export const usePedagogy = (programId: string) =>
  useQuery({
    queryKey: ['fiche', programId, 'suivi'],
    queryFn: () =>
      api.get<PedagogySummary>(`fiches/${programId}/suivi-pedagogique`),
  });

export const useReusableDocuments = (dossierId: string, enabled: boolean) =>
  useQuery({
    queryKey: ['edof', 'reutilisables', dossierId],
    queryFn: () =>
      api.get<ReusableDocument[]>(
        `edof/documents-reutilisables?dossier_id=${dossierId}`,
      ),
    enabled,
  });

export const useTrainerOptions = () =>
  useQuery({
    queryKey: ['formateurs'],
    queryFn: () =>
      api.get<{ id: string; first_name: string; last_name: string }[]>(
        'formateurs',
      ),
  });

export const programmeUrl = (
  programId: string,
  versionId: string,
  download = false,
) =>
  `/api/backend/v1/fiches/${programId}/versions/${versionId}/programme${download ? '?telecharger=true' : ''}`;

export const pieceUrl = (pieceId: string) =>
  `/api/backend/v1/edof/pieces/${pieceId}/contenu`;

// --- Écritures : chaque succès relit la fiche et les dossiers (les contrôles changent) ---

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['edof'] });
    qc.invalidateQueries({ queryKey: ['fiche'] });
    qc.invalidateQueries({ queryKey: ['resource', 'programs'] });
  };
}

export function useEdofMutation<V>(fn: (vars: V) => Promise<unknown>) {
  const refresh = useRefresh();
  return useMutation({ mutationFn: fn, onSuccess: refresh });
}

export const edofApi = {
  patchEstablishment: (body: Record<string, unknown>) =>
    api.patch('edof/etablissement', body),
  createDossier: (programId: string) =>
    api.post<{ id: string }>(`edof/formations/${programId}/dossier`),
  transition: (
    dossierId: string,
    action: DossierAction,
    body: Record<string, unknown> = {},
  ) =>
    api.post<Dossier>(`edof/dossiers/${dossierId}/transitions/${action}`, body),
  upload: (
    dossierId: string,
    code: string,
    file: File,
    meta: Record<string, string | undefined>,
  ) => {
    const form = new FormData();
    form.append('file', file);
    Object.entries(meta).forEach(([k, v]) => v && form.append(k, v));
    return apiFetch(`/v1/edof/dossiers/${dossierId}/pieces/${code}`, {
      method: 'POST',
      body: form,
    });
  },
  link: (dossierId: string, code: string, body: Record<string, unknown>) =>
    api.post(`edof/dossiers/${dossierId}/pieces/${code}/lien`, body),
  approve: (pieceId: string) => api.post(`edof/pieces/${pieceId}/valider`),
  reject: (pieceId: string, reason: string) =>
    api.post(`edof/pieces/${pieceId}/rejeter`, { reason }),
  addAccompaniment: (dossierId: string, body: Record<string, unknown>) =>
    api.post(`edof/dossiers/${dossierId}/accompagnements`, body),
  patchAccompaniment: (id: string, body: Record<string, unknown>) =>
    api.patch(`edof/accompagnements/${id}`, body),
  closeComplement: (id: string, reason: string) =>
    api.post(`edof/complements/${id}/clore`, { reason }),
  patchProgram: (programId: string, body: Record<string, unknown>) =>
    api.patch(`programs/${programId}`, body),
  putCertification: (programId: string, body: Record<string, unknown>) =>
    api.put(`fiches/${programId}/certification`, body),
  verify: (programId: string, quoi: string, index?: number) =>
    api.post(`fiches/${programId}/verifications`, { quoi, index }),
  addTrainer: (programId: string, body: Record<string, unknown>) =>
    api.post(`fiches/${programId}/intervenants`, body),
  removeTrainer: (programId: string, linkId: string) =>
    api.delete(`fiches/${programId}/intervenants/${linkId}`),
  addResource: (programId: string, body: Record<string, unknown>) =>
    api.post(`fiches/${programId}/ressources`, body),
  patchResource: (
    programId: string,
    id: string,
    body: Record<string, unknown>,
  ) => api.patch(`fiches/${programId}/ressources/${id}`, body),
  deleteResource: (programId: string, id: string) =>
    api.delete(`fiches/${programId}/ressources/${id}`),
  validateFiche: (programId: string, note?: string) =>
    api.post(`fiches/${programId}/versions`, { note }),
};
