/**
 * API Formation : ressources CRUD (moyens et partenaires, handler/training_resources.py).
 * Référence : docs/API.md (routes, droits). Rangé par domaine, comme api/<domaine>/ du template.
 */
import { http } from './http'

/** Ressources CRUD de « Moyens et partenaires ». */
export type MoyenResource = 'premises' | 'equipment' | 'subcontractors' | 'partners' | 'watch-items'
export type MoyenRow = Record<string, unknown> & { id: string }

export const listMoyens = (resource: MoyenResource) => http.get<MoyenRow[]>(`/${resource}`)
export const createMoyen = (resource: MoyenResource, data: Record<string, unknown>) =>
  http.post<MoyenRow>(`/${resource}`, data)
export const updateMoyen = (resource: MoyenResource, id: string, data: Record<string, unknown>) =>
  http.patch<MoyenRow>(`/${resource}/${encodeURIComponent(id)}`, data)
export const deleteMoyen = (resource: MoyenResource, id: string) =>
  http.delete<void>(`/${resource}/${encodeURIComponent(id)}`)
