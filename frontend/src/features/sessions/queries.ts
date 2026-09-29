"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { AttendanceSheet, LearnerJourney, SessionDetail, SessionDossier, SessionJourney } from "@/lib/types";

export const keys = {
  session: (id: string) => ["session", id] as const,
  journey: (id: string) => ["session", id, "parcours"] as const,
  attendance: (id: string) => ["session", id, "emargement"] as const,
  dossier: (id: string) => ["session", id, "dossier"] as const,
  learner: (id: string) => ["inscription", id] as const,
};

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
    queryKey: keys.learner(enrollmentId ?? ""),
    queryFn: () => api.get<LearnerJourney>(`inscriptions/${enrollmentId}/parcours`),
    enabled: !!enrollmentId,
  });

/** Après toute écriture, la session et tout ce qui en dépend sont relus : l'écran reflète le moteur. */
function useRefreshSession(sessionId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["session", sessionId] });
    void qc.invalidateQueries({ queryKey: ["inscription"] });
    void qc.invalidateQueries({ queryKey: ["sessions"] });
  };
}

export function useSessionTransition(sessionId: string) {
  const refresh = useRefreshSession(sessionId);
  return useMutation({
    mutationFn: ({ action, reason }: { action: string; reason?: string }) =>
      api.post(`sessions/${sessionId}/transitions/${action}`, reason ? { motif: reason } : {}),
    onSuccess: refresh,
  });
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
