/**
 * API Comptes et droits : connexion, profil, comptes, rôles, permissions (handler/auth.py).
 * Référence : docs/API.md (routes, droits). Rangé par domaine, comme api/<domaine>/ du template.
 */
import { http } from './http'

export interface UserOut {
  id: string
  email: string
  full_name: string
  roles: string[]
  is_active: boolean
}

export interface Me extends UserOut {
  permissions: string[]
}

export interface LoginOut {
  access_token: string
  token_type: string
  user: UserOut
}

export const login = (email: string, password: string) =>
  http.post<LoginOut>('/auth/login', { email, password }, { auth: false })

export const getMe = () => http.get<Me>('/auth/me')
export const updateMe = (full_name: string) => http.patch<UserOut>('/auth/me', { full_name })
/**
 * Change son mot de passe : l'API révoque tous les jetons du compte et rend un jeton neuf pour la session
 * courante, que l'appelant doit enregistrer (tokenStorage) pour continuer sans se reconnecter.
 */
export const changePassword = (actuel: string, nouveau: string) =>
  http.post<LoginOut>('/auth/me/password', { actuel, nouveau })
/** Révoque toutes ses sessions, celle-ci comprise (204) : l'appelant doit ensuite se déconnecter localement. */
export const logoutEverywhere = () => http.post<void>('/auth/me/deconnexion-partout')

export interface Permission {
  code: string
  label: string
  feature: string
}

export interface Role {
  code: string
  label: string
  description?: string | null
  system: boolean
  permissions: string[]
}

export const listPermissions = () => http.get<Permission[]>('/auth/permissions')
export const listRoles = () => http.get<Role[]>('/auth/roles')
export const createRole = (role: { code: string; label: string; description?: string | null; permissions: string[] }) =>
  http.post<{ code: string; permissions: string[] }>('/auth/roles', role)
export const updateRole = (code: string, patch: { label?: string; description?: string | null; permissions?: string[] }) =>
  http.put<{ code: string; permissions: string[] }>(`/auth/roles/${encodeURIComponent(code)}`, patch)
export const deleteRole = (code: string) => http.delete<void>(`/auth/roles/${encodeURIComponent(code)}`)

export const listUsers = () => http.get<UserOut[]>('/auth/users')
export const createUser = (user: { email: string; full_name: string; password: string; roles: string[] }) =>
  http.post<UserOut>('/auth/users', user)
export const setUserRoles = (id: string, roles: string[]) =>
  http.put<UserOut>(`/auth/users/${encodeURIComponent(id)}/roles`, { roles })
export const setUserActive = (id: string, is_active: boolean) =>
  http.put<UserOut>(`/auth/users/${encodeURIComponent(id)}/active`, { is_active })

// ── Moteur IA : session WeKnora ouverte par l'API qualiopi (connexion unique) ──────

/** Réponse de connexion WeKnora (jeton, utilisateur, espace), à enregistrer comme l'écran WeKnora. */
export const openIaSession = () => http.post<Record<string, any>>('/ia/session', {})
