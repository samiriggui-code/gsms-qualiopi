// Types des réponses de l'API GSMS (écrits à la main ; beaucoup de routes renvoient des objets libres).
// Repris du front d'origine du backend (branche cloud) pour rester alignés sur l'API.

// Décision du moteur pour une action : autorisée, ou refusée avec un motif lisible.
export type Decision =
  | { allowed: true; libelle?: string; a_saisir?: string[] }
  | {
      allowed: false;
      code: string;
      message: string;
      details?: Record<string, unknown>[];
      libelle?: string;
      a_saisir?: string[];
    };

export type Capabilities = Record<string, Decision>;

export type SessionStatus = 'PLANIFIEE' | 'CONFIRMEE' | 'EN_COURS' | 'TERMINEE' | 'CLOTUREE' | 'ANNULEE';

export interface SessionRow {
  id: string;
  reference: string;
  program_id: string;
  program_code: string | null;
  program_title: string | null;
  start_date: string;
  end_date: string;
  location: string | null;
  room: string | null;
  trainer_id: string | null;
  trainer_name: string | null;
  capacity: number | null;
  learners_count: number;
  status: SessionStatus;
  cancel_reason: string | null;
}

export type EnrollmentStatus = 'INSCRIT' | 'CONFIRME' | 'TERMINE' | 'ABANDON' | 'ANNULE';

export interface SessionDetail {
  session: SessionRow;
  inscriptions: {
    id: string;
    learner_id: string;
    stagiaire: string;
    statut: EnrollmentStatus;
    financement: string | null;
  }[];
  capabilities: Capabilities;
}

export const JOURNEY_STEPS = [
  'analyse_besoin',
  'positionnement',
  'convention',
  'convocation',
  'emargement',
  'evaluations',
  'attestation',
  'satisfaction_chaud',
  'satisfaction_froid',
] as const;
export type JourneyStepKey = (typeof JOURNEY_STEPS)[number];

// État d'une étape pour un stagiaire, calculé par l'API avec les échéances de l'échéancier.
export type StepState = 'FAIT' | 'A_VENIR' | 'A_ECHEANCE' | 'EN_RETARD' | 'SANS_OBJET';

export interface SessionJourney {
  session: string;
  statut: SessionStatus;
  stagiaires: {
    inscription: string;
    stagiaire: string;
    statut: EnrollmentStatus;
    etapes: Record<JourneyStepKey, boolean>;
    etats: Record<JourneyStepKey, StepState>;
    possible: string[];
  }[];
  etapes: JourneyStepKey[];
  actions: Record<string, string>;
}

export interface GeneratedDocument {
  id: string;
  type: 'CONVOCATION' | 'ATTESTATION_FIN';
  titre: string;
  version: number;
  statut: 'EMIS' | 'REMPLACE';
  sha256: string;
  emis_le: string | null;
  par: string | null;
  motif: string | null;
}

export interface JourneyStep {
  etape: JourneyStepKey;
  fait: boolean;
  etat: StepState;
  echeance: string | null;
  le: string | null;
  detail: string | null;
  manque?: string[];
  adaptation?: string | null;
  prerequis_ok?: boolean | null;
}

export interface LearnerJourney {
  inscription: string;
  stagiaire: string;
  session: string;
  statut: EnrollmentStatus;
  abandon: { le: string | null; motif: string | null } | null;
  etapes: JourneyStep[];
  assiduite: { prevues: number; suivies: number; heures_prevues: string | null; heures_suivies: string | null };
  documents: GeneratedDocument[];
  capabilities: Capabilities;
}

export interface AttendanceCell {
  enrollment_id: string;
  stagiaire: string;
  etat: 'PRESENT' | 'ABSENT' | 'MANQUANT' | 'A_VENIR' | 'NON_ATTENDU';
  heure: string | null;
  procede: string | null;
  note: string | null;
}

export interface AttendanceSheet {
  session: string;
  demi_journees: {
    id: string;
    jour: string;
    periode: 'MATIN' | 'APRES_MIDI';
    horaires: string | null;
    contre_validee: { le: string; par: string } | null;
    code_actif: boolean;
    presences: AttendanceCell[];
    capabilities: Capabilities;
  }[];
  sign_path?: string;
}

export type ReadinessStatus =
  | 'DEMONTRABLE'
  | 'A_RISQUE'
  | 'PREUVES_INSUFFISANTES'
  | 'NON_EVALUABLE'
  | 'NON_EVALUE'
  | 'NON_APPLICABLE';

export interface SessionDossier {
  session: {
    id: string;
    reference: string;
    status: SessionStatus;
    start_date: string;
    end_date: string;
    location: string | null;
    trainer: string | null;
    program: { id: string; code: string; title: string; certifying: boolean };
    learners: number;
  };
  checklist: { label: string; done: number; total: number; applicable: boolean; complete?: boolean }[];
  echeancier: {
    key: string;
    label: string;
    owner: string;
    due_on: string;
    status: string;
    done: number;
    total: number;
    missing: { who: string; enrollment_id: string }[];
    explanation: string;
    indicators: number[];
  }[];
  summary: {
    preuves_manquantes: number;
    preuves_expirees: number;
    preuves_non_exploitables: number;
    preuves_a_valider: number;
    conventions_non_signees: number;
    indicateurs: Partial<Record<ReadinessStatus, number>>;
  };
  indicators: {
    number: number;
    code: string;
    criterion: number;
    title: string;
    status: ReadinessStatus;
    human_validation_required?: boolean;
    evidence_to_validate?: boolean;
    results: {
      control: string;
      status: string;
      expected?: string;
      observed?: string;
      explanation: string;
      missing: unknown[];
    }[];
  }[];
  findings: {
    id: string;
    reference: string;
    indicator: number;
    title: string;
    severity: string;
    status: string;
    explanation: string;
    remediation: string | null;
  }[];
  disclaimer: string;
}

export interface Formation {
  id: string;
  code: string;
  title: string;
  is_certifying: boolean;
  duration_hours: string | null;
  price_eur: string | null;
}

export interface Formateur {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  is_external: boolean;
  specialties: string[];
  qualifications: { id: string; label: string; obtained_on: string | null; valid_until: string | null }[];
}

export interface Stagiaire {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  company_id: string | null;
}
