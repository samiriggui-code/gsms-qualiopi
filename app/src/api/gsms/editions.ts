/**
 * API Documents professionnels : types et statuts (handler/editions.py).
 * Référence : docs/API.md (routes, droits). Rangé par domaine, comme api/<domaine>/ du template.
 */
import { http } from './http'

export interface EditionTypes {
  types: { code: string; libelle: string; disponible: boolean }[]
  statuts: Record<string, string> | string[]
  unites: Record<string, string> | string[]
}

/** GET /editions/types (`documents.read`). */
export const getEditionTypes = () => http.get<EditionTypes>('/editions/types')
