// Vocabulaire métier affiché : un seul endroit pour les libellés et le ton de chaque état.
import type { Tone } from "@/components/ui/badge";
import type { EnrollmentStatus, JourneyStepKey, SessionStatus } from "@/lib/types";

export const SESSION_STATUS: Record<SessionStatus, { label: string; tone: Tone }> = {
  PLANIFIEE: { label: "Planifiée", tone: "neutral" },
  CONFIRMEE: { label: "Confirmée", tone: "info" },
  EN_COURS: { label: "En cours", tone: "brand" },
  TERMINEE: { label: "Terminée", tone: "warn" },
  CLOTUREE: { label: "Clôturée", tone: "ok" },
  ANNULEE: { label: "Annulée", tone: "danger" },
};

export const ENROLLMENT_STATUS: Record<EnrollmentStatus, { label: string; tone: Tone }> = {
  INSCRIT: { label: "Inscrit", tone: "neutral" },
  CONFIRME: { label: "Confirmé", tone: "info" },
  TERMINE: { label: "Terminé", tone: "ok" },
  ABANDON: { label: "Abandon", tone: "warn" },
  ANNULE: { label: "Annulé", tone: "danger" },
};

export const STEP_LABEL: Record<JourneyStepKey, { label: string; short: string }> = {
  analyse_besoin: { label: "Analyse du besoin", short: "Besoin" },
  positionnement: { label: "Positionnement", short: "Position." },
  convention: { label: "Convention ou contrat", short: "Convention" },
  convocation: { label: "Convocation", short: "Convoc." },
  emargement: { label: "Émargement", short: "Émarg." },
  evaluations: { label: "Évaluations des acquis", short: "Éval." },
  attestation: { label: "Attestation de fin", short: "Attest." },
  satisfaction_chaud: { label: "Satisfaction à chaud", short: "Satisf. chaud" },
  satisfaction_froid: { label: "Satisfaction à froid", short: "Satisf. froid" },
};

// Transitions de session (clés de l'API → libellé du bouton).
export const SESSION_TRANSITIONS: Record<string, string> = {
  confirm: "Confirmer",
  start: "Démarrer",
  finish: "Terminer",
  close: "Clôturer",
  cancel: "Annuler la session",
};

export const READINESS: Record<string, { label: string; tone: Tone }> = {
  DEMONTRABLE: { label: "Démontrable", tone: "ok" },
  A_RISQUE: { label: "À risque", tone: "warn" },
  PREUVES_INSUFFISANTES: { label: "Preuves insuffisantes", tone: "danger" },
  NON_EVALUABLE: { label: "Revue humaine", tone: "info" },
  NON_EVALUE: { label: "Non évalué", tone: "neutral" },
  NON_APPLICABLE: { label: "Sans objet", tone: "neutral" },
};

export const MILESTONE: Record<string, { label: string; tone: Tone }> = {
  FAIT: { label: "Fait", tone: "ok" },
  A_VENIR: { label: "À venir", tone: "neutral" },
  A_ECHEANCE: { label: "À échéance", tone: "warn" },
  EN_RETARD: { label: "En retard", tone: "danger" },
  SANS_OBJET: { label: "Sans objet", tone: "neutral" },
};

export const PERIOD: Record<string, string> = { MATIN: "Matin", APRES_MIDI: "Après-midi" };

export const ROLE_LABEL: Record<string, string> = {
  admin: "Direction",
  qualite: "Responsable qualité",
  assistant_qualite: "Assistant qualité",
  gestion: "Gestion des formations",
  formateur: "Formateur",
  rh: "Ressources humaines",
  financement: "Financement",
  lecture: "Lecture seule",
};
