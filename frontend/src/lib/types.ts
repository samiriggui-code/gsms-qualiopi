// Types des réponses de l'API GSMS utilisées par le front (écrits à la main pour l'instant :
// beaucoup de routes renvoient des objets libres ; à générer depuis l'OpenAPI une fois typées).

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

export type Bootstrap = {
  user: { id: string; email: string; full_name: string; roles: string[] };
  permissions: string[];
  features: string[];
  organization: { id: string; name: string; short_name: string; brand_color: string } | null;
  navigation: { key: string; label: string }[];
};

export type SessionStatus = "PLANIFIEE" | "CONFIRMEE" | "EN_COURS" | "TERMINEE" | "CLOTUREE" | "ANNULEE";

export type SessionRow = {
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
};

export type EnrollmentStatus = "INSCRIT" | "CONFIRME" | "TERMINE" | "ABANDON" | "ANNULE";

export type SessionDetail = {
  session: SessionRow;
  inscriptions: {
    id: string;
    learner_id: string;
    stagiaire: string;
    statut: EnrollmentStatus;
    financement: string | null;
  }[];
  capabilities: Capabilities;
};

export const JOURNEY_STEPS = [
  "analyse_besoin",
  "positionnement",
  "convention",
  "convocation",
  "emargement",
  "evaluations",
  "attestation",
  "satisfaction_chaud",
  "satisfaction_froid",
] as const;
export type JourneyStepKey = (typeof JOURNEY_STEPS)[number];

export type SessionJourney = {
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
};

export type GeneratedDocument = {
  id: string;
  type: "CONVOCATION" | "ATTESTATION_FIN";
  titre: string;
  version: number;
  statut: "EMIS" | "REMPLACE";
  sha256: string;
  emis_le: string | null;
  par: string | null;
  motif: string | null;
};

/** État d'une étape pour un stagiaire, calculé par l'API avec les échéances de l'échéancier. */
export type StepState = "FAIT" | "A_VENIR" | "A_ECHEANCE" | "EN_RETARD" | "SANS_OBJET";

export type JourneyStep = {
  etape: JourneyStepKey;
  fait: boolean;
  etat: StepState;
  echeance: string | null;
  le: string | null;
  detail: string | null;
  manque?: string[];
  adaptation?: string | null;
  prerequis_ok?: boolean | null;
};

export type LearnerJourney = {
  inscription: string;
  stagiaire: string;
  session: string;
  statut: EnrollmentStatus;
  abandon: { le: string | null; motif: string | null } | null;
  etapes: JourneyStep[];
  assiduite: { prevues: number; suivies: number; heures_prevues: string | null; heures_suivies: string | null };
  documents: GeneratedDocument[];
  capabilities: Capabilities;
};

export type AttendanceCell = {
  enrollment_id: string;
  stagiaire: string;
  etat: "PRESENT" | "ABSENT" | "MANQUANT" | "A_VENIR" | "NON_ATTENDU";
  heure: string | null;
  procede: string | null;
  note: string | null;
};

export type AttendanceSheet = {
  session: string;
  demi_journees: {
    id: string;
    jour: string;
    periode: "MATIN" | "APRES_MIDI";
    horaires: string | null;
    contre_validee: { le: string; par: string } | null;
    code_actif: boolean;
    presences: AttendanceCell[];
    capabilities: Capabilities;
  }[];
};

export type ReadinessStatus =
  | "DEMONTRABLE"
  | "A_RISQUE"
  | "PREUVES_INSUFFISANTES"
  | "NON_EVALUABLE"
  | "NON_EVALUE"
  | "NON_APPLICABLE";

export type SessionDossier = {
  session: { id: string; reference: string; status: SessionStatus; learners: number };
  checklist: { label: string; done: number; total: number; applicable: boolean; complete?: boolean }[];
  echeancier: {
    key: string;
    label: string;
    owner: string;
    due_on: string;
    status: string;
    done: number;
    total: number;
    explanation: string;
    indicators: number[];
  }[];
  summary: Record<string, unknown>;
  indicators: {
    number: number;
    code: string;
    title: string;
    status: ReadinessStatus;
    results: { control: string; status: string; explanation: string; missing: unknown[] }[];
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
};
