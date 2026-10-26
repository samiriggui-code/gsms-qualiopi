/**
 * API Formation : sessions, cycle de vie, inscriptions (handler/training.py).
 * Référence : docs/API.md (routes, droits).
 */
import { http } from './http'
import type { Capabilities } from './common'

export interface SessionRow {
  id: string
  reference: string
  program_id: string
  start_date: string
  end_date: string
  location: string | null
  room: string | null
  trainer_id: string | null
  capacity: number | null
  status: string
  cancel_reason: string | null
  program_code: string | null
  program_title: string | null
  trainer_name: string | null
  /** Vignette de la formation, héritée par la session (chemin de la médiathèque). */
  program_image_url?: string | null
  trainer_photo_url?: string | null
  learners_count: number
}

export interface SessionInscription {
  id: string
  learner_id: string
  stagiaire: string
  photo_url?: string | null
  statut: string
  financement: string | null
}

export interface SessionDetail {
  session: SessionRow
  inscriptions: SessionInscription[]
  capabilities: Capabilities
}

export interface ActivityRow {
  [key: string]: unknown
}

export interface LearnerRow {
  id: string
  first_name: string
  last_name: string
  email: string | null
  photo_url?: string | null
  [extra: string]: unknown
}

/** Sessions dans la portée du compte ; `formateur` (id) limite la liste aux sessions d'un formateur. */
export const listSessions = (query: { statut?: string; du?: string; au?: string; formateur?: string } = {}) =>
  http.get<SessionRow[]>('/sessions', { query })
export const getSession = (id: string) => http.get<SessionDetail>(`/sessions/${encodeURIComponent(id)}`)
export const getSessionActivity = (id: string) =>
  http.get<ActivityRow[]>(`/sessions/${encodeURIComponent(id)}/activite`)
/** Actions : confirm, start, finish, close, cancel (motif). */
export const sessionTransition = (id: string, action: string, motif?: string | null) =>
  http.post<SessionRow>(`/sessions/${encodeURIComponent(id)}/transitions/${encodeURIComponent(action)}`, {
    motif: motif || null,
  })
export const enrollLearner = (id: string, learnerId: string) =>
  http.post<{ id: string; statut: string }>(`/sessions/${encodeURIComponent(id)}/inscriptions`, { learner_id: learnerId })
/** GET /stagiaires (`sessions.read`). */
export const listLearners = () => http.get<LearnerRow[]>('/stagiaires')


/** DELETE /sessions/{id} : session planifiée sans inscription (TrainingPolicy, refus 409). */
export const deleteSession = (id: string) => http.delete<void>(`/sessions/${encodeURIComponent(id)}`)

/** Fiche apprenant de la ressource CRUD /learners (`sessions.read`) : identité, entreprise, nombre d'inscriptions. */
export interface LearnerRecord {
  id: string
  first_name: string
  last_name: string
  full_name: string
  email: string | null
  /** Photo : chemin de la médiathèque (media/…), ou null (initiales). */
  photo_url?: string | null
  phone: string | null
  company_id: string | null
  company_name: string | null
  enrollments: number
  created_at: string | null
}

/** GET /learners (`sessions.read`) ; `entreprise` (id) limite la liste aux stagiaires d'une entreprise. */
export const listLearnerRecords = (entreprise?: string) => http.get<LearnerRecord[]>('/learners', { query: { entreprise } })
/** GET /learners/{id} (`sessions.read`). */
export const getLearner = (id: string) => http.get<LearnerRecord>(`/learners/${encodeURIComponent(id)}`)

/** Inscription d'un stagiaire avec le résumé de sa session (GET /learners/{id}/inscriptions). */
export interface LearnerInscription {
  id: string
  statut: string
  financement: string | null
  entreprise_id: string | null
  abandon_le: string | null
  session: {
    id: string
    reference: string
    statut: string
    debut: string
    fin: string
    formation_id: string | null
    formation_code: string | null
    formation_titre: string | null
    formation_image_url?: string | null
    formateur_id: string | null
    formateur: string | null
    formateur_photo_url?: string | null
  }
}

/** Inscriptions d'un stagiaire, session la plus récente d'abord (`sessions.read`) ; 404 si stagiaire inconnu. */
export const listLearnerInscriptions = (id: string) =>
  http.get<LearnerInscription[]>(`/learners/${encodeURIComponent(id)}/inscriptions`)
