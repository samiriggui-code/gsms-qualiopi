import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';

// Hooks génériques pour les ressources CRUD du backend (app/core/crud.py).
// path : segment après /api/v1, ex. « companies ».

export interface Row {
  id: string;
  [key: string]: unknown;
}

export function useResourceList<T extends Row>(path: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [path],
    queryFn: () => apiFetch<T[]>(`/v1/${path}`),
    enabled: options?.enabled ?? true,
  });
}

export function useResourceItem<T extends Row>(path: string, id: string | undefined) {
  return useQuery({
    queryKey: [path, id],
    queryFn: () => apiFetch<T>(`/v1/${path}/${id}`),
    enabled: !!id,
  });
}

// Libellés utilisés dans les notifications, ex. { one: "L'entreprise", created: 'créée' }
export interface ResourceLabels {
  one: string;
  created: string;
  updated: string;
  deleted: string;
}

export function useResourceMutations<T extends Row>(path: string, labels: ResourceLabels) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: [path] });
  const fail = (error: Error) => toast.error(error.message);

  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiFetch<T>(`/v1/${path}`, { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      toast.success(`${labels.one} a été ${labels.created}.`);
      refresh();
    },
    onError: fail,
  });

  const update = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      apiFetch<T>(`/v1/${path}/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    onSuccess: () => {
      toast.success(`${labels.one} a été ${labels.updated}.`);
      refresh();
    },
    onError: fail,
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch<null>(`/v1/${path}/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success(`${labels.one} a été ${labels.deleted}.`);
      refresh();
    },
    onError: fail,
  });

  return { create, update, remove };
}
