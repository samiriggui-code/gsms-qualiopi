import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  EnrollmentStatus,
  JourneyStepKey,
  SessionStatus,
  StepState,
} from './types';

// Registres du parcours, toutes sessions visibles (backend/app/journey/registry.py).
// Les états et les actions possibles sont décidés par l'API, comme dans le dossier de session.

export type RegistryView =
  | JourneyStepKey
  | 'inscriptions'
  | 'abandons'
  | 'certification';

interface Base {
  inscription: string;
  stagiaire: string;
  statut: EnrollmentStatus;
  session: {
    id: string;
    reference: string;
    intitule: string | null;
    debut: string;
    fin: string;
    statut: SessionStatus;
  };
  entreprise: string | null;
  financement: string | null;
}

export interface Progress {
  faits: number;
  applicables: number;
  prochaine: {
    etape: JourneyStepKey;
    etat: StepState;
    echeance: string | null;
  } | null;
}

export interface StepRow extends Base {
  etape: {
    etat: StepState;
    echeance: string | null;
    le: string | null;
    detail: string | null;
  };
  action: {
    cle: string;
    allowed: boolean;
    libelle: string;
    message?: string;
  } | null;
}

export interface EnrollmentRow extends Base {
  inscrit_le: string | null;
  avancement: Progress;
  possible: string[];
}

export interface AbandonRow extends Base {
  abandon: { le: string | null; motif: string | null };
  avancement: Progress;
}

export interface ExamRow extends Base {
  epreuves: {
    intitule: string;
    le: string;
    note: number | null;
    reussi: boolean | null;
  }[];
}

export type RegistryRow = StepRow | EnrollmentRow | AbandonRow | ExamRow;

export const useRegistry = <T extends RegistryRow>(view: RegistryView) =>
  useQuery({
    queryKey: ['registres', view],
    queryFn: () =>
      api.get<{
        vue: RegistryView;
        compteurs: Record<string, number>;
        lignes: T[];
      }>(`parcours/registres/${view}`),
  });
