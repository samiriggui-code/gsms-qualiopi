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

/** Profil EDOF de l'établissement (table edof.establishment) : champs renvoyés tels quels par l'API. */
export type EdofEstablishment = Record<string, unknown> & {
  legal_name?: string | null
  efp_connect_status?: string | null
}

export interface EdofEstablishmentView {
  organization: { id: string; name: string; siret: string | null; nda_number: string | null; action_categories: string[] | null }
  establishment: EdofEstablishment
  dossier: { id: string; status: string; [extra: string]: unknown }
  formations: unknown[]
}

/** GET /edof/etablissement (`edof.read`) : crée le profil à la première lecture. */
export const getEdofEstablishment = () => http.get<EdofEstablishmentView>('/edof/etablissement')
/** PATCH /edof/etablissement (`edof.write` ; attester une vérification exige `edof.validate`). */
export const updateEdofEstablishment = (patch: Record<string, unknown>) =>
  http.patch<EdofEstablishmentView>('/edof/etablissement', patch)
