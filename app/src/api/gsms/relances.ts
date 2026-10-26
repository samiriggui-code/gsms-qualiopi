/**
 * API Relances et communications (handler/relances.py).
 * Référence : docs/API.md (routes, droits). Rangé par domaine, comme api/<domaine>/ du template.
 */
import { http } from './http'

export interface RelanceRule {
  cle: string
  libelle: string
  portee: string
  destinataire?: string | null
  ancre?: string | null
  decalages?: number[] | null
  jour?: string | null
  modele?: string | null
  externe?: boolean
  [extra: string]: unknown
}

export const listRelanceRules = () => http.get<RelanceRule[]>('/communications/regles')
