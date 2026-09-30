// Vocabulaire métier affiché : un seul endroit pour les libellés et la couleur de chaque état.
import type { EnrollmentStatus, JourneyStepKey, ReadinessStatus, SessionStatus, StepState } from './types';

// Couleurs de badge (thème clair et sombre)
export const TONE = {
  neutral: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  info: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  brand: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  warn: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  ok: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  danger: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
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

export const STEP_LABEL: Record<JourneyStepKey, { label: string; short: string }> = {
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

export const PERIOD: Record<string, string> = { MATIN: 'Matin', APRES_MIDI: 'Après-midi' };

export const OWNER: Record<string, string> = {
  gestion: 'Gestion',
  qualite: 'Qualité',
  formateur: 'Formateur',
  direction: 'Direction',
  financement: 'Financement',
};
