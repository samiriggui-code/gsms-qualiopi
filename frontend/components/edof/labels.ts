import type { DisplayStatus, Level, PieceState, Step } from '@/lib/gsms/edof';
import { TONE } from '@/lib/gsms/labels';

type Label = { label: string; color: string };

// États du dossier : calculés par l'API (incomplet / prêt) ou saisis (validé, déposé, compléments, décision).
export const DOSSIER_STATUS: Record<DisplayStatus, Label> = {
  INCOMPLET: { label: 'Dossier incomplet', color: TONE.danger },
  PRET_VALIDATION_INTERNE: {
    label: 'Prêt pour validation interne',
    color: TONE.warn,
  },
  VALIDE_INTERNE: { label: 'Validé en interne, à déposer', color: TONE.info },
  DEPOSE: { label: 'Déposé', color: TONE.brand },
  COMPLEMENTS_DEMANDES: { label: 'Compléments demandés', color: TONE.warn },
  DECISION_RECUE: { label: 'Décision officielle reçue', color: TONE.ok },
};

export const LEVEL: Record<Level, Label> = {
  BLOQUANT: { label: 'Bloquant', color: TONE.danger },
  A_VERIFIER: { label: 'À vérifier', color: TONE.warn },
  INFO: { label: 'Information', color: TONE.neutral },
};

export const PIECE_STATE: Record<PieceState, Label> = {
  MANQUANTE: { label: 'Manquante', color: TONE.danger },
  A_PREPARER: { label: 'À préparer', color: TONE.neutral },
  A_DETERMINER: { label: 'À déterminer', color: TONE.warn },
  NON_APPLICABLE: { label: 'Non applicable', color: TONE.neutral },
  A_VALIDER: { label: 'À valider', color: TONE.warn },
  VALIDEE: { label: 'Validée', color: TONE.ok },
  REJETEE: { label: 'Rejetée', color: TONE.danger },
  EXPIREE: { label: 'Expirée', color: TONE.danger },
  GENEREE: { label: 'Produite par GSMS', color: TONE.info },
};

export const STEP_LABEL: Record<Step, string> = {
  etablissement: 'Situation de l’établissement',
  programme: 'Programme',
  contenus: 'Contenus et intervenants',
  certification: 'Certification et habilitations',
  pieces: 'Pièces',
  suivi: 'Transmission et suivi',
};

export const STRUCTURE_TYPES = [
  { value: 'ENTREPRISE', label: 'Entreprise (société)' },
  {
    value: 'ENTREPRISE_ARTISANALE_LIBERALE',
    label: 'Entreprise artisanale ou libérale',
  },
  { value: 'ASSOCIATION', label: 'Association' },
];
export const REPRESENTATIVE_KINDS = [
  { value: 'PERSONNE_PHYSIQUE', label: 'Personne physique' },
  { value: 'PERSONNE_MORALE', label: 'Personne morale' },
];
export const EFP_CONNECT = [
  { value: 'AUCUN', label: 'Aucun compte' },
  { value: 'COMPTE_CREE', label: 'Compte EFP Connect créé' },
  {
    value: 'HABILITATION_DEMANDEE',
    label: 'Habilitation EDOF demandée à la CDC',
  },
  { value: 'HABILITE', label: 'Habilité à EDOF pour ce SIRET' },
];
export const RESOURCE_KINDS = [
  { value: 'COURS', label: 'Cours' },
  { value: 'QUIZ', label: 'Quiz' },
  { value: 'CAS_PRATIQUE', label: 'Cas pratique' },
  { value: 'EVALUATION', label: 'Évaluation' },
  { value: 'SUPPORT', label: 'Support' },
  { value: 'AUTRE', label: 'Autre' },
];
export const RESOURCE_ORIGINS = [
  { value: 'INTERNE', label: 'Rédigé par Form’SSI' },
  { value: 'ACHETE', label: 'Acheté' },
  { value: 'GSMS_SCHOOL', label: 'LMS GSMS School' },
  { value: 'AUTRE', label: 'Autre' },
];
export const RESOURCE_RIGHTS = [
  { value: 'PROPRIETAIRE', label: 'Propriétaire' },
  { value: 'LICENCE', label: 'Sous licence' },
  { value: 'A_VERIFIER', label: 'À vérifier' },
  { value: 'INTERDIT', label: 'Réutilisation interdite' },
];
export const RESOURCE_STATUS = [
  { value: 'A_REDIGER', label: 'À rédiger' },
  { value: 'BROUILLON', label: 'Brouillon' },
  { value: 'VALIDE', label: 'Validé' },
];
export const optionLabel = (
  options: { value: string; label: string }[],
  value: unknown,
) =>
  options.find((o) => o.value === value)?.label ??
  (value ? String(value) : '—');
