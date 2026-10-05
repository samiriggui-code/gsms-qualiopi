// Passage des états calculés par l'API aux statuts des composants d'audit (couleurs et libellés).
// Aucun calcul ici : le moteur décide de l'état, le front choisit seulement comment l'afficher.
import { READINESS } from '@/lib/gsms/labels';
import type { AuditStatus, StatusLabels } from '@/components/audit/status';

// État de préparation d'un indicateur → statut. Sans objet et à venir n'ont pas de statut : non affichés.
export const READINESS_STATUS: Partial<Record<string, AuditStatus>> = {
  DEMONTRABLE: 'ok',
  A_RISQUE: 'warn',
  PREUVES_INSUFFISANTES: 'ko',
  NON_EVALUABLE: 'info',
  NON_EVALUE: 'none',
};

// Libellés du moteur : jamais « Conforme », seul l'organisme certificateur décide de la conformité.
export const READINESS_LABELS: StatusLabels = {
  ok: READINESS.DEMONTRABLE.label,
  warn: READINESS.A_RISQUE.label,
  ko: READINESS.PREUVES_INSUFFISANTES.label,
  info: READINESS.NON_EVALUABLE.label,
  none: READINESS.NON_EVALUE.label,
};

// Gravité d'un écart → statut du plan d'action.
export function findingStatus(gravite: string): AuditStatus {
  return gravite === 'majeure' ? 'ko' : 'warn';
}

export const FINDING_LABELS: StatusLabels = {
  ko: 'Écart majeur',
  warn: 'Écart mineur',
};

// Statuts de preuve que le moteur retient comme exploitables (USABLE_STATUSES côté API).
const USABLE_EVIDENCE = new Set(['EXPLOITABLE', 'VALIDEE']);

export function isUsableEvidence(statut: string) {
  return USABLE_EVIDENCE.has(statut);
}
