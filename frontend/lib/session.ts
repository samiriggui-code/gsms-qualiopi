// Session côté Next : le JWT émis par l'API FastAPI est stocké dans un cookie
// httpOnly. Le navigateur n'y a jamais accès ; les appels à l'API passent par
// les route handlers Next (/api/auth/*, /api/backend/*) qui ajoutent le Bearer.

export const SESSION_COOKIE = 'gsms_token';

// Aligné sur jwt_ttl_minutes du backend (12 h).
export const SESSION_MAX_AGE = 12 * 60 * 60;

export const API_URL = process.env.API_URL || 'http://localhost:8000';

export interface SessionUser {
  id: string;
  email: string;
  full_name: string;
  roles: string[];
  is_active: boolean;
  // Permissions effectives calculées par l'API (backend/app/auth/permissions.py)
  permissions: string[];
}

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Direction',
  qualite: 'Responsable qualité',
  gestion: 'Gestion',
  formateur: 'Formateur',
  lecture: 'Lecture seule',
};

// N'accepte qu'un chemin interne, pour éviter les redirections ouvertes.
export function safeCallbackUrl(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}
