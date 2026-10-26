/**
 * API Formation : ressources CRUD (moyens et partenaires, handler/training_resources.py).
 * Référence : docs/API.md (routes, droits). Rangé par domaine, comme api/<domaine>/ du template.
 */
import { http } from './http'

/** Ressources CRUD lues dans « Moyens et partenaires » (écriture non branchée dans la coque). */
export type MoyenResource = 'premises' | 'equipment' | 'subcontractors' | 'partners' | 'watch-items'
export const listMoyens = (resource: MoyenResource) => http.get<Record<string, unknown>[]>(`/${resource}`)
