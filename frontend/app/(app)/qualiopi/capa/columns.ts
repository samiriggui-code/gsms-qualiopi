import type { CapaStatus, CapaStep } from '@/lib/gsms/capa';
import { TONE } from '@/lib/gsms/labels';

// Colonnes du tableau et étape d'API qui fait entrer une action dans chacune.
export const CAPA_STATUS: Record<
  CapaStatus,
  { label: string; color: string; dot: string }
> = {
  OUVERTE: { label: 'Ouverte', color: TONE.neutral, dot: 'bg-zinc-400' },
  EN_COURS: { label: 'En cours', color: TONE.brand, dot: 'bg-blue-500' },
  A_VERIFIER: { label: 'À vérifier', color: TONE.warn, dot: 'bg-amber-500' },
  CLOTUREE: { label: 'Clôturée', color: TONE.ok, dot: 'bg-emerald-500' },
  ANNULEE: { label: 'Annulée', color: TONE.danger, dot: 'bg-red-500' },
};

export const STEP_INTO: Partial<Record<CapaStatus, CapaStep>> = {
  EN_COURS: 'demarrer',
  A_VERIFIER: 'realiser',
  CLOTUREE: 'verifier',
  ANNULEE: 'annuler',
};

export const STEPS: CapaStep[] = [
  'demarrer',
  'realiser',
  'verifier',
  'annuler',
];
