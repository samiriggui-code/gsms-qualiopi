import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

// Types alignés sur backend/app/training/router.py

export type SessionStatus =
  | 'PLANIFIEE'
  | 'CONFIRMEE'
  | 'EN_COURS'
  | 'TERMINEE'
  | 'CLOTUREE'
  | 'ANNULEE';

export interface ProgramRef {
  id: string;
  code: string;
  title: string;
  is_certifying: boolean;
  duration_hours: number | null;
}

export interface TrainerRef {
  id: string;
  full_name: string;
  is_external: boolean;
}

export interface SessionRow {
  id: string;
  reference: string;
  program: ProgramRef;
  trainer: TrainerRef | null;
  start_date: string;
  end_date: string;
  location: string | null;
  room: string | null;
  capacity: number | null;
  status: SessionStatus;
  enrolled: number;
  slots_total: number;
  slots_signed: number;
  subcontracted: boolean;
}

export interface EnrollmentRow {
  id: string;
  learner_id: string;
  learner_name: string;
  learner_email: string | null;
  company_name: string | null;
  status: string;
  funding: string | null;
  needs_analysis_done: boolean;
  adaptation_required: boolean;
  positioning_done: boolean;
  convocation_sent_on: string | null;
  agreement_signed_on: string | null;
  attendance_present: number;
  attendance_total: number;
  assessments: number;
  certificate_issued_on: string | null;
}

export interface SlotRow {
  id: string;
  day: string;
  period: 'MATIN' | 'APRES_MIDI';
  trainer_signed_at: string | null;
  present: number;
  signed: number;
}

export interface DocumentRow {
  id: string;
  kind: string;
  title: string;
  version: number;
  status: string;
  created_at: string;
  signed_at: string | null;
}

export interface SessionDetail extends SessionRow {
  enrollments: EnrollmentRow[];
  slots: SlotRow[];
  documents: DocumentRow[];
}

export interface SessionInput {
  reference: string;
  program_id: string;
  start_date: string;
  end_date: string;
  location?: string;
  room?: string;
  trainer_id?: string;
  capacity?: number;
  status?: SessionStatus;
}

export function useSessions() {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: () => apiFetch<SessionRow[]>('/v1/sessions'),
  });
}

export function useSession(id: string) {
  return useQuery({
    queryKey: ['sessions', id],
    queryFn: () => apiFetch<SessionDetail>(`/v1/sessions/${id}`),
  });
}

export function usePrograms() {
  return useQuery({
    queryKey: ['programs'],
    queryFn: () => apiFetch<ProgramRef[]>('/v1/programs'),
  });
}

export function useTrainers() {
  return useQuery({
    queryKey: ['trainers'],
    queryFn: () => apiFetch<TrainerRef[]>('/v1/trainers'),
  });
}

export function useCreateSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SessionInput) =>
      apiFetch<SessionRow>('/v1/sessions', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions'] }),
  });
}

// --- Libellés ---

export const SESSION_STATUS: Record<SessionStatus, { label: string; color: string }> = {
  PLANIFIEE: { label: 'Planifiée', color: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300' },
  CONFIRMEE: { label: 'Confirmée', color: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300' },
  EN_COURS: { label: 'En cours', color: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  TERMINEE: { label: 'Terminée', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
  CLOTUREE: { label: 'Clôturée', color: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300' },
  ANNULEE: { label: 'Annulée', color: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' },
};

export const ENROLLMENT_STATUS: Record<string, string> = {
  INSCRIT: 'Inscrit',
  CONFIRME: 'Confirmé',
  ANNULE: 'Annulé',
  ABANDON: 'Abandon',
  TERMINE: 'Terminé',
};

export const PERIOD_LABELS: Record<SlotRow['period'], string> = {
  MATIN: 'Matin',
  APRES_MIDI: 'Après-midi',
};

export const DOCUMENT_KINDS: Record<string, string> = {
  PROGRAMME: 'Programme',
  CONVOCATION: 'Convocation',
  CONVENTION: 'Convention',
  EMARGEMENT: 'Émargement',
  ATTESTATION: 'Attestation',
  PROCEDURE: 'Procédure',
};

export const DOCUMENT_STATUS: Record<string, string> = {
  BROUILLON: 'Brouillon',
  EMIS: 'Émis',
  SIGNE: 'Signé',
  REMPLACE: 'Remplacé',
};
