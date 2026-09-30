import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

// Échéances affichées au tableau de bord (backend/app/qualiopi/router.py, backend/app/hr).

export interface SessionMilestone {
  session: string;
  session_id: string;
  key: string;
  label: string;
  owner: string;
  due_on: string;
  status: string;
  done: number;
  total: number;
  missing: { who: string; enrollment_id: string }[];
  indicators: number[];
  explanation: string;
}

export interface QualificationDeadline {
  formateur: string;
  formateur_id: string;
  type: string;
  libelle: string;
  fin: string;
  etat: string;
}

export const useMilestones = (days = 15, enabled = true) =>
  useQuery({
    queryKey: ['qualiopi', 'echeances', days],
    queryFn: () =>
      api.get<SessionMilestone[]>(`qualiopi/echeances?days=${days}`),
    enabled,
  });

export const useQualificationDeadlines = (enabled = true) =>
  useQuery({
    queryKey: ['rh', 'echeances'],
    queryFn: () => api.get<QualificationDeadline[]>('rh/echeances'),
    enabled,
  });
