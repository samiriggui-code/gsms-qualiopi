import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from '@/lib/api';

// Administration et compte : équipe et rôles (backend/app/auth/router.py), journal
// (core/journal_api.py), organisme (platform/router.py), référentiels (qualiopi/router.py).

export interface TeamUser {
  id: string;
  email: string;
  full_name: string;
  roles: string[];
  is_active: boolean;
}

export interface Role {
  code: string;
  label: string;
  description?: string | null;
  system: boolean;
  permissions: string[];
}

export const useUsers = () =>
  useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => api.get<TeamUser[]>('auth/users'),
  });

export const useRoles = () =>
  useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: () => api.get<Role[]>('auth/roles'),
  });

function useRefreshUsers() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ['admin', 'users'] });
}

export function useCreateUser() {
  const refresh = useRefreshUsers();
  return useMutation({
    mutationFn: (body: {
      email: string;
      full_name: string;
      password: string;
      roles: string[];
    }) => api.post<TeamUser>('auth/users', body),
    onSuccess: refresh,
  });
}

export function useSetUserRoles() {
  const refresh = useRefreshUsers();
  return useMutation({
    mutationFn: ({ id, roles }: { id: string; roles: string[] }) =>
      api.put<TeamUser>(`auth/users/${id}/roles`, { roles }),
    onSuccess: refresh,
  });
}

export function useSetUserActive() {
  const refresh = useRefreshUsers();
  return useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api.put<TeamUser>(`auth/users/${id}/active`, { is_active }),
    onSuccess: refresh,
  });
}

export interface JournalLine {
  id: number;
  table: string;
  entite: string;
  action: 'CREATION' | 'MODIFICATION' | 'SUPPRESSION' | string;
  champs: string[];
  changes: Record<string, [unknown, unknown]>;
  actor: string;
  at: string;
}

export const useJournal = (table: string | null) =>
  useInfiniteQuery({
    queryKey: ['admin', 'journal', table],
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) => {
      const q = new URLSearchParams({ limite: '50' });
      if (table) q.set('table', table);
      if (pageParam != null) q.set('avant', String(pageParam));
      return api.get<{
        lignes: JournalLine[];
        tables: string[];
        suite: number | null;
      }>(`journal/recent?${q}`);
    },
    getNextPageParam: (last) => last.suite,
  });

export interface Organization {
  existe: boolean;
  name: string | null;
  nda_number: string | null;
  siret: string | null;
  action_categories: string[] | null;
  is_new_entrant: boolean | null;
  disability_referent_name: string | null;
  disability_referent_email: string | null;
  mobility_referent_name: string | null;
  categories_possibles: { code: string; libelle: string }[];
}

export const useOrganization = () =>
  useQuery({
    queryKey: ['admin', 'organisme'],
    queryFn: () => api.get<Organization>('organisme'),
  });

export function useUpdateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      body: Partial<Omit<Organization, 'existe' | 'categories_possibles'>>,
    ) => api.patch<Organization>('organisme', body),
    onSuccess: (org) => qc.setQueryData(['admin', 'organisme'], org),
  });
}

export interface ReferentialVersion {
  id: string;
  code: string;
  version: string;
  title: string;
  effective_from: string;
  source_label: string;
  source_sha256: string;
  normative_sha256: string;
  source_url: string | null;
  imported_at: string | null;
  is_active: boolean;
  indicators: number;
  criteria: { number: number; title: string }[];
}

export const useReferentials = () =>
  useQuery({
    queryKey: ['admin', 'referentiels'],
    queryFn: () =>
      api.get<{ versions: ReferentialVersion[]; dossiers: string[] }>(
        'referentials',
      ),
  });

export function useImportReferential() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { folder: string; activate: boolean }) =>
      api.post<ReferentialVersion>('referentials/import', body),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ['admin', 'referentiels'] }),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (full_name: string) => api.patch('auth/me', { full_name }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['auth', 'me'] }),
  });
}

export const useChangePassword = () =>
  useMutation({
    mutationFn: (body: { actuel: string; nouveau: string }) =>
      api.post('auth/me/password', body),
  });
