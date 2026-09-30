import { useCurrentUser } from '@/hooks/use-current-user';

// Permissions de l'interface → permissions de l'API (backend/app/auth/permissions.py).
// Le serveur reste seul juge : l'interface masque seulement ce que l'utilisateur ne peut pas faire.
const API_PERMISSIONS = {
  read: 'sessions.read',
  write_training: 'sessions.write',
  write_trainers: 'trainers.write',
  read_quality: 'quality.read',
  write_quality: 'quality.write',
  validate_evidence: 'evidence.validate',
  manage_referential: 'referential.manage',
  manage_users: 'users.manage',
  manage_communications: 'communications.manage',
} as const;

export type Permission = keyof typeof API_PERMISSIONS;

export function useCan() {
  const { data: user } = useCurrentUser();
  return (permission: Permission) => !!user && user.permissions.includes(API_PERMISSIONS[permission]);
}
