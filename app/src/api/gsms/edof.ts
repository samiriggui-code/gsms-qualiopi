/**
 * API EDOF : référentiel des pièces (handler/edof.py).
 * Référence : docs/API.md (routes, droits). Rangé par domaine, comme api/<domaine>/ du template.
 */
import { http } from './http'

export interface EdofPiece {
  code: string
  label: string
  scope: string
  stage?: string | null
  sensitive?: boolean
  [extra: string]: unknown
}

export const getEdofReferential = () =>
  http.get<{ version: string; sources: unknown; pieces: EdofPiece[] }>('/edof/referentiel')
