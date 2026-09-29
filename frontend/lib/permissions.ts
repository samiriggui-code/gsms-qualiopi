import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useCurrentUser } from '@/hooks/use-current-user';

// Miroir de backend/app/auth/security.py (PERMISSIONS). Le serveur reste seul juge :
// l'interface masque seulement les actions que l'utilisateur ne peut pas faire.

export type Permission =
  | 'read'
  | 'write_training'
  | 'write_quality'
  | 'validate_evidence'
  | 'manage_referential'
  | 'manage_users';

export interface PermissionsMatrix {
  roles: { key: string; label: string }[];
  permissions: { key: Permission; label: string }[];
  grants: Record<string, Permission[]>;
}

export function usePermissionsMatrix() {
  return useQuery({
    queryKey: ['auth', 'permissions'],
    queryFn: () => apiFetch<PermissionsMatrix>('/v1/auth/permissions'),
    staleTime: Infinity,
  });
}

export function useCan() {
  const { data: user } = useCurrentUser();
  const { data: matrix } = usePermissionsMatrix();
  return (permission: Permission) =>
    !!user && !!matrix && (matrix.grants[user.role] ?? []).includes(permission);
}
