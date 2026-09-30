'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  AttendanceSheet,
  Formateur,
  Formation,
  LearnerJourney,
  SessionDetail,
  SessionDossier,
  SessionJourney,
  SessionRow,
  Stagiaire,
} from './types';

export const keys = {
  sessions: ['sessions'] as const,
  session: (id: string) => ['session', id] as const,
  journey: (id: string) => ['session', id, 'parcours'] as const,
  attendance: (id: string) => ['session', id, 'emargement'] as const,
  dossier: (id: string) => ['session', id, 'dossier'] as const,
  learner: (id: string) => ['inscription', id] as const,
};

export const useSessions = () =>
  useQuery({ queryKey: keys.sessions, queryFn: () => api.get<SessionRow[]>('sessions') });

export const useSession = (id: string) =>
  useQuery({ queryKey: keys.session(id), queryFn: () => api.get<SessionDetail>(`sessions/${id}`) });

export const useSessionJourney = (id: string) =>
  useQuery({ queryKey: keys.journey(id), queryFn: () => api.get<SessionJourney>(`sessions/${id}/parcours`) });

export const useAttendance = (id: string, enabled = true) =>
  useQuery({
    queryKey: keys.attendance(id),
    queryFn: () => api.get<AttendanceSheet>(`sessions/${id}/emargement`),
    enabled,
  });

export const useDossier = (id: string, enabled = true) =>
  useQuery({ queryKey: keys.dossier(id), queryFn: () => api.get<SessionDossier>(`sessions/${id}/dossier`), enabled });

export const useLearnerJourney = (enrollmentId: string | null) =>
  useQuery({
    queryKey: keys.learner(enrollmentId ?? ''),
    queryFn: () => api.get<LearnerJourney>(`inscriptions/${enrollmentId}/parcours`),
    enabled: !!enrollmentId,
  });

export const useFormations = () =>
  useQuery({ queryKey: ['formations'], queryFn: () => api.get<Formation[]>('formations') });

export const useFormateurs = () =>
  useQuery({ queryKey: ['formateurs'], queryFn: () => api.get<Formateur[]>('formateurs') });

export const useStagiaires = () =>
  useQuery({ queryKey: ['stagiaires'], queryFn: () => api.get<Stagiaire[]>('stagiaires') });

// Après toute écriture, la session et tout ce qui en dépend sont relus : l'écran reflète le moteur.
function useRefreshSession(sessionId?: string) {
  const qc = useQueryClient();
  return () => {
    if (sessionId) void qc.invalidateQueries({ queryKey: ['session', sessionId] });
    void qc.invalidateQueries({ queryKey: ['inscription'] });
    void qc.invalidateQueries({ queryKey: keys.sessions });
  };
}

export interface SessionInput {
  reference: string;
  program_id: string;
  start_date: string;
  end_date: string;
  location?: string | null;
  room?: string | null;
  trainer_id?: string | null;
  capacity?: number | null;
}

export function useCreateSession() {
  const refresh = useRefreshSession();
  return useMutation({
    mutationFn: (input: SessionInput) => api.post<SessionRow>('sessions', input),
    onSuccess: refresh,
  });
}

export function useUpdateSession(sessionId: string) {
  const refresh = useRefreshSession(sessionId);
  return useMutation({
    mutationFn: (input: Partial<SessionInput>) => api.patch<SessionRow>(`sessions/${sessionId}`, input),
    onSuccess: refresh,
  });
}

export function useDeleteSession(sessionId: string) {
  const refresh = useRefreshSession(sessionId);
  return useMutation({ mutationFn: () => api.delete(`sessions/${sessionId}`), onSuccess: refresh });
}

export function useSessionTransition(sessionId: string) {
  const refresh = useRefreshSession(sessionId);
  return useMutation({
    mutationFn: ({ action, reason }: { action: string; reason?: string }) =>
      api.post(`sessions/${sessionId}/transitions/${action}`, reason ? { motif: reason } : {}),
    onSuccess: refresh,
  });
}

export function useEnroll(sessionId: string) {
  const refresh = useRefreshSession(sessionId);
  return useMutation({
    mutationFn: (input: { learner_id: string; company_id?: string | null; financement?: string | null }) =>
      api.post(`sessions/${sessionId}/inscriptions`, input),
    onSuccess: refresh,
  });
}

export function usePlanSlots(sessionId: string) {
  const refresh = useRefreshSession(sessionId);
  return useMutation({ mutationFn: () => api.post(`sessions/${sessionId}/creneaux`), onSuccess: refresh });
}

export function useJourneyAction(sessionId: string, enrollmentId: string) {
  const refresh = useRefreshSession(sessionId);
  return useMutation({
    mutationFn: ({ action, body }: { action: string; body: Record<string, unknown> }) =>
      api.post<{ produit: Record<string, unknown>; parcours: LearnerJourney }>(
        `inscriptions/${enrollmentId}/parcours/${action}`,
        body,
      ),
    onSuccess: refresh,
  });
}
