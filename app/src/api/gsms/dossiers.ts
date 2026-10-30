/**
 * API Dossiers de pièces : organisme et formateurs (handler/documents.py).
 * Référence : docs/API.md (routes, droits).
 */
import { http } from './http'
import { downloadFile, postForm } from './files'

export type DossierSubject = 'ORGANISME' | 'FORMATEUR'

export interface PieceGridPoint {
  code: string
  question: string
  exigence: string
  source?: string | null
  condition?: string | null
}

export interface PieceItem {
  code: string
  label: string
  required: boolean
  indicators: number[]
  /** MANQUANTE, DEMANDEE, EN_RETARD, A_COMPLETER, RECUE, VALIDEE, REJETEE, EXPIREE (calculé par l'API). */
  state: string
  modele: boolean
  grille: PieceGridPoint[]
  document: {
    id: string
    version: number
    name: string | null
    uploaded_at: string | null
    by: string | null
    support: string
    note_depot: string | null
  } | null
  evidence: { id: string; reference: string; status: string; issues: string[]; valid_until: string | null } | null
  request: { id: string; from: string; due_on: string } | null
}

export interface PieceDossier {
  subject: DossierSubject
  subject_id: string
  label: string
  items: PieceItem[]
  complete: number
  required: number
}

const enc = encodeURIComponent
const base = (s: DossierSubject, id: string) => `/dossiers/${s}/${enc(id)}`

export const getPieceDossier = (s: DossierSubject, id: string) => http.get<PieceDossier>(base(s, id))

export function uploadPiece(s: DossierSubject, id: string, requirement: string, file: File, grille: Record<string, string>, note?: string) {
  const form = new FormData()
  form.append('file', file)
  form.append('grille', JSON.stringify(grille))
  if (note) form.append('note', note)
  return postForm<{ id: string; version: number }>(`${base(s, id)}/pieces/${enc(requirement)}`, form)
}

export const declarePaperPiece = (s: DossierSubject, id: string, requirement: string, body: { grille: Record<string, string>; lieu: string; note?: string | null }) =>
  http.post<{ id: string }>(`${base(s, id)}/pieces/${enc(requirement)}/papier`, body)

export const requestPiece = (s: DossierSubject, id: string, requirement: string, body: { requested_from: string; due_on: string; message?: string | null }) =>
  http.post<{ id: string; status: string; due_on: string }>(`${base(s, id)}/demandes/${enc(requirement)}`, body)

export const downloadPieceModel = (s: DossierSubject, requirement: string) =>
  downloadFile(`/dossiers/${s}/modeles/${enc(requirement)}`, `${requirement}.md`)

export const downloadDocument = (documentId: string, name: string) =>
  downloadFile(`/documents/${enc(documentId)}/contenu`, name)
