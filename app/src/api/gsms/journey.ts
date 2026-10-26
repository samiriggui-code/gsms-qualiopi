/**
 * API Parcours du stagiaire (handler/journey.py).
 * Référence : docs/API.md (routes, droits).
 */
import { http } from './http'
import type { Capabilities } from './common'

export interface SessionJourneyRow {
  inscription: string
  stagiaire: string
  statut: string
  etapes: Record<string, boolean>
  etats: Record<string, string>
  possible: string[]
}

export interface SessionJourney {
  session: string
  statut: string
  stagiaires: SessionJourneyRow[]
  etapes: string[]
  actions: Record<string, string>
  ouvertes: string[]
}

export interface JourneyStep {
  etape: string
  fait: boolean
  le: string | null
  detail: string | null
  etat: string
  echeance: string | null
  manque?: string[]
  [extra: string]: unknown
}

export interface LearnerJourney {
  inscription: string
  stagiaire: string
  session: string
  statut: string
  contact: { email: string | null; telephone: string | null; entreprise: string | null; financement: string | null; inscrit_le: string | null }
  abandon: unknown
  etapes: JourneyStep[]
  assiduite: { prevues: number; suivies: number; heures_prevues: number | null; heures_suivies: number | null }
  documents: { id: string; [extra: string]: unknown }[]
  questionnaires: Record<string, unknown>[]
  capabilities: Capabilities
}

const enc = encodeURIComponent

export const getSessionJourney = (sessionId: string) => http.get<SessionJourney>(`/sessions/${enc(sessionId)}/parcours`)
export const getLearnerJourney = (enrollmentId: string) => http.get<LearnerJourney>(`/inscriptions/${enc(enrollmentId)}/parcours`)
/** Exécute une étape ; le corps porte les saisies demandées par `a_saisir`. */
export const journeyAction = (enrollmentId: string, action: string, body: Record<string, unknown>) =>
  http.post<Record<string, unknown>>(`/inscriptions/${enc(enrollmentId)}/parcours/${enc(action)}`, body)
