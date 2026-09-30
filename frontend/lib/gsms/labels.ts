// Vocabulaire métier affiché : un seul endroit pour les libellés et la couleur de chaque état.
import type {
  EnrollmentStatus,
  JourneyStepKey,
  ReadinessStatus,
  SessionStatus,
  StepState,
} from './types';

// Couleurs de badge : exactement celles du Badge Metronic en apparence « light »
// (components/ui/badge.tsx), comme les statuts de la démo store-inventory. Cinq tons, pas davantage.
const LIGHT = {
  secondary: 'bg-secondary dark:bg-secondary/50 text-secondary-foreground',
  primary:
    'text-[var(--color-primary-accent,var(--color-blue-700))] bg-[var(--color-primary-soft,var(--color-blue-50))] dark:bg-[var(--color-primary-soft,var(--color-blue-950))] dark:text-[var(--color-primary-soft,var(--color-blue-600))]',
  success:
    'text-[var(--color-success-accent,var(--color-green-800))] bg-[var(--color-success-soft,var(--color-green-100))] dark:bg-[var(--color-success-soft,var(--color-green-950))] dark:text-[var(--color-success-soft,var(--color-green-600))]',
  warning:
    'text-[var(--color-warning-accent,var(--color-yellow-700))] bg-[var(--color-warning-soft,var(--color-yellow-100))] dark:bg-[var(--color-warning-soft,var(--color-yellow-950))] dark:text-[var(--color-warning-soft,var(--color-yellow-600))]',
  destructive:
    'text-[var(--color-destructive-accent,var(--color-red-700))] bg-[var(--color-destructive-soft,var(--color-red-50))] dark:bg-[var(--color-destructive-soft,var(--color-red-950))] dark:text-[var(--color-destructive-soft,var(--color-red-600))]',
};

export const TONE = {
  neutral: LIGHT.secondary,
  info: LIGHT.primary,
  brand: LIGHT.primary,
  warn: LIGHT.warning,
  ok: LIGHT.success,
  danger: LIGHT.destructive,
} as const;

type Label = { label: string; color: string };

export const SESSION_STATUS: Record<SessionStatus, Label> = {
  PLANIFIEE: { label: 'Planifiée', color: TONE.neutral },
  CONFIRMEE: { label: 'Confirmée', color: TONE.info },
  EN_COURS: { label: 'En cours', color: TONE.brand },
  TERMINEE: { label: 'Terminée', color: TONE.warn },
  CLOTUREE: { label: 'Clôturée', color: TONE.ok },
  ANNULEE: { label: 'Annulée', color: TONE.danger },
};

export const ENROLLMENT_STATUS: Record<EnrollmentStatus, Label> = {
  INSCRIT: { label: 'Inscrit', color: TONE.neutral },
  CONFIRME: { label: 'Confirmé', color: TONE.info },
  TERMINE: { label: 'Terminé', color: TONE.ok },
  ABANDON: { label: 'Abandon', color: TONE.warn },
  ANNULE: { label: 'Annulé', color: TONE.danger },
};

export const STEP_LABEL: Record<
  JourneyStepKey,
  { label: string; short: string }
> = {
  analyse_besoin: { label: 'Analyse du besoin', short: 'Besoin' },
  positionnement: { label: 'Positionnement', short: 'Position.' },
  convention: { label: 'Convention ou contrat', short: 'Convention' },
  convocation: { label: 'Convocation', short: 'Convoc.' },
  emargement: { label: 'Émargement', short: 'Émarg.' },
  evaluations: { label: 'Évaluations des acquis', short: 'Éval.' },
  attestation: { label: 'Attestation de fin', short: 'Attest.' },
  satisfaction_chaud: { label: 'Satisfaction à chaud', short: 'Satisf. chaud' },
  satisfaction_froid: { label: 'Satisfaction à froid', short: 'Satisf. froid' },
};

export const STEP_STATE: Record<StepState, Label> = {
  FAIT: { label: 'Fait', color: TONE.ok },
  A_VENIR: { label: 'À venir', color: TONE.neutral },
  A_ECHEANCE: { label: 'À échéance', color: TONE.warn },
  EN_RETARD: { label: 'En retard', color: TONE.danger },
  SANS_OBJET: { label: 'Sans objet', color: TONE.neutral },
};

// Transitions de session (clés de l'API → libellé du bouton)
export const SESSION_TRANSITIONS: Record<string, string> = {
  confirm: 'Confirmer',
  start: 'Démarrer',
  finish: 'Terminer',
  close: 'Clôturer',
  cancel: 'Annuler la session',
};

export const READINESS: Record<ReadinessStatus, Label> = {
  DEMONTRABLE: { label: 'Démontrable', color: TONE.ok },
  A_RISQUE: { label: 'À risque', color: TONE.warn },
  PREUVES_INSUFFISANTES: { label: 'Preuves insuffisantes', color: TONE.danger },
  NON_EVALUABLE: { label: 'Revue humaine', color: TONE.info },
  NON_EVALUE: { label: 'Non évalué', color: TONE.neutral },
  NON_APPLICABLE: { label: 'Sans objet', color: TONE.neutral },
};

export const MILESTONE: Record<string, Label> = {
  FAIT: { label: 'Fait', color: TONE.ok },
  A_VENIR: { label: 'À venir', color: TONE.neutral },
  A_ECHEANCE: { label: 'À échéance', color: TONE.warn },
  EN_RETARD: { label: 'En retard', color: TONE.danger },
  SANS_OBJET: { label: 'Sans objet', color: TONE.neutral },
};

export const ATTENDANCE: Record<string, Label> = {
  PRESENT: { label: 'Présent', color: TONE.ok },
  ABSENT: { label: 'Absent', color: TONE.danger },
  MANQUANT: { label: 'Signature manquante', color: TONE.warn },
  A_VENIR: { label: 'À venir', color: TONE.neutral },
  NON_ATTENDU: { label: 'Non attendu', color: TONE.neutral },
};

export const QUALIFICATION_DEADLINE: Record<string, Label> = {
  EXPIRE: { label: 'Expiré', color: TONE.danger },
  A_RENOUVELER: { label: 'À renouveler', color: TONE.warn },
};

export const PERIOD: Record<string, string> = {
  MATIN: 'Matin',
  APRES_MIDI: 'Après-midi',
};

export const OWNER: Record<string, string> = {
  gestion: 'Gestion',
  qualite: 'Qualité',
  formateur: 'Formateur',
  direction: 'Direction',
  financement: 'Financement',
};
