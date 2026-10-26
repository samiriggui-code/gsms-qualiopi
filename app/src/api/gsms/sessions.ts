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
  learners_count: number
}

export interface SessionInscription {
  id: string
  learner_id: string
  stagiaire: string
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
  [extra: string]: unknown
}

export const listSessions = (query: { statut?: string; du?: string; au?: string } = {}) =>
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
