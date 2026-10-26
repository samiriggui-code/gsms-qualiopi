/**
 * API EDOF : référentiel des pièces (handler/edof.py).
 * Référence : docs/API.md (routes, droits). Rangé par domaine, comme api/<domaine>/ du template.
 */
import { http } from './http'
import type { Capabilities } from './common'

const enc = encodeURIComponent

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
  dossier: EdofDossier
  formations: EdofFormationLine[]
}

/** Une formation et son dossier EDOF éventuel (GET /edof/etablissement). */
export interface EdofFormationLine {
  program_id: string
  code: string
  title: string
  dossier: { id: string; display_status: string; display_label: string; blocking: number; to_check: number } | null
}

/** GET /edof/etablissement (`edof.read`) : crée le profil à la première lecture. */
export const getEdofEstablishment = () => http.get<EdofEstablishmentView>('/edof/etablissement')
/** PATCH /edof/etablissement (`edof.write` ; attester une vérification exige `edof.validate`). */
export const updateEdofEstablishment = (patch: Record<string, unknown>) =>
  http.patch<EdofEstablishmentView>('/edof/etablissement', patch)

/** Anomalie d'un dossier EDOF (niveau BLOQUANT, A_VERIFIER ou INFO), calculée par l'API. */
export interface EdofAnomaly {
  code: string
  niveau: string
  controle: string
  message: string
  etape: string
  detail: string | null
  cible: Record<string, unknown>
}

export interface EdofPieceDeposit {
  id: string
  status: string
  issued_on: string | null
  valid_until: string | null
  validated_by: string | null
  validated_at: string | null
  rejection_reason: string | null
  note: string | null
  deposited_by: string | null
  deposited_at: string | null
  document: { id: string; name: string; version: number; status: string; has_file: boolean } | null
  /** Pièce sensible masquée faute de droit `edof.sensitive`. */
  restricted: boolean
}

export interface EdofDossierPiece {
  code: string
  label: string
  stage: string
  stage_label: string
  conditions: string[]
  applies: boolean | null
  group: string | null
  sensitive: boolean
  generated: boolean
  provided_by: string | null
  source: string
  note: string | null
  /** GENEREE, NON_APPLICABLE, A_PREPARER, A_DETERMINER, MANQUANTE, A_VALIDER, VALIDEE, REJETEE, EXPIREE. */
  state: string
  piece: EdofPieceDeposit | null
  history: EdofPieceDeposit[]
  anomalies: EdofAnomaly[]
}

export interface EdofDossier {
  id: string
  kind: string
  program_id: string | null
  parent_id: string | null
  status: string
  display_status: string
  display_label: string
  reminder: string
  validated_by: string | null
  validated_at: string | null
  submitted_on: string | null
  submitted_by: string | null
  cdc_reference: string | null
  decision: string | null
  decision_on: string | null
  decision_note: string | null
  anomalies: EdofAnomaly[]
  counts: Record<string, number>
  pieces: EdofDossierPiece[]
  complements: { id: string; label: string; requirement: string | null; requested_on: string; due_on: string | null; status: string; note: string | null }[]
  accompaniments: { id: string; kind: string; label: string; planned_on: string | null; done_on: string | null; participant: string | null; note: string | null }[]
  capabilities: Capabilities
  /** Libellé de chaque action du cycle de vie. */
  actions: Record<string, string>
  referentiel: { version: string; sources: Record<string, string> }
  program?: { id: string; code: string; title: string }
  version?: { state: string; version: number | null }
}

/** GET /edof/dossiers/{id} (`edof.read`) : pièces, anomalies, compléments, capacités. */
export const getEdofDossier = (id: string) => http.get<EdofDossier>(`/edof/dossiers/${enc(id)}`)
/** POST /edof/formations/{program_id}/dossier (`edof.write`) : 409 si la formation a déjà un dossier. */
export const createEdofFormationDossier = (programId: string) =>
  http.post<{ id: string }>(`/edof/formations/${enc(programId)}/dossier`)
/** POST /edof/dossiers/{id}/transitions/{action} : décision `capabilities[action]`, refus 409 motivé. */
export const edofTransition = (id: string, action: string, body: Record<string, unknown> = {}) =>
  http.post<EdofDossier>(`/edof/dossiers/${enc(id)}/transitions/${enc(action)}`, body)
/** Chemin du fichier d'une pièce (à télécharger avec downloadFile ; pièce sensible : `edof.sensitive`). */
export const edofPieceContentPath = (pieceId: string) => `/edof/pieces/${enc(pieceId)}/contenu`
