/**
 * API Parcours du stagiaire (handler/journey.py).
 * Référence : docs/API.md (routes, droits).
 */
import { http } from './http'
import type { Capabilities, Capability } from './common'

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

/** Document émis par le moteur (convocation, attestation). */
export interface JourneyDocument {
  id: string
  type: string
  titre: string
  version: number
  statut: string
  emis_le: string | null
  par: string | null
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
  documents: JourneyDocument[]
  questionnaires: Record<string, unknown>[]
  capabilities: Capabilities
}

const enc = encodeURIComponent

export const getSessionJourney = (sessionId: string) => http.get<SessionJourney>(`/sessions/${enc(sessionId)}/parcours`)
export const getLearnerJourney = (enrollmentId: string) => http.get<LearnerJourney>(`/inscriptions/${enc(enrollmentId)}/parcours`)
/** Exécute une étape ; le corps porte les saisies demandées par `a_saisir`. */
export const journeyAction = (enrollmentId: string, action: string, body: Record<string, unknown>) =>
  http.post<Record<string, unknown>>(`/inscriptions/${enc(enrollmentId)}/parcours/${enc(action)}`, body)

/** Chiffres de la vue d'ensemble du parcours (GET /parcours/synthese) : états par étape, inscriptions, examens. */
export interface JourneySummary {
  etapes: Record<string, Record<string, number>>
  inscriptions: Record<string, number>
  examens: { presentes: number; reussis: number }
  en_retard: { stagiaire: string; session: string; session_id: string; etape: string; echeance: string | null }[]
}

/** Registres disponibles (`VIEWS` de l'API) : une étape, ou les inscriptions, abandons, présentations à la certification. */
export const JOURNEY_REGISTERS = [
  'inscriptions', 'analyse_besoin', 'positionnement', 'convention', 'convocation', 'emargement', 'evaluations',
  'attestation', 'satisfaction_chaud', 'satisfaction_froid', 'abandons', 'certification',
] as const

export interface RegisterSession {
  id: string
  reference: string
  intitule: string | null
  debut: string
  fin: string
  statut: string
}

export interface RegisterProgress {
  faits: number
  applicables: number
  prochaine: { etape: string; etat: string; echeance: string | null } | null
}

export interface RegisterRow {
  inscription: string
  stagiaire: string
  /** Fiche du stagiaire (lien) et e-mail (avatar de démonstration). */
  stagiaire_id?: string | null
  stagiaire_email?: string | null
  statut: string
  session: RegisterSession
  entreprise: string | null
  financement: string | null
  /** Registre d'une étape : son état et l'action qui la fait avancer (décision de l'API). */
  etape?: { etat: string; echeance: string | null; le: string | null; detail: string | null }
  action?: (Capability & { cle: string }) | null
  /** Inscriptions et abandons. */
  inscrit_le?: string | null
  avancement?: RegisterProgress
  abandon?: { le: string | null; motif: string | null }
  /** Certification : épreuves d'examen. */
  epreuves?: { intitule: string; le: string; note: number | null; reussi: boolean | null }[]
}

export interface JourneyRegister {
  vue: string
  compteurs: Record<string, number>
  lignes: RegisterRow[]
}

export const getJourneySummary = () => http.get<JourneySummary>('/parcours/synthese')
/** GET /parcours/registres/{vue} : sessions visibles seulement, ce qui presse d'abord. */
export const getJourneyRegister = (vue: string) => http.get<JourneyRegister>(`/parcours/registres/${enc(vue)}`)
/** Chemin d'un document émis par le moteur pour une inscription (à télécharger avec downloadFile). */
export const journeyDocumentPath = (enrollmentId: string, documentId: string) =>
  `/inscriptions/${enc(enrollmentId)}/documents/${enc(documentId)}`

// ── Évaluations des acquis et résultats (GET /evaluations-acquis) ─────────────

/** Valeurs de filtre acceptées par l'API (`registry.STATE_ORDER` et `registry.RESULTS`) ; c'est elle qui les vérifie. */
export const ASSESSMENT_STATES = ['EN_RETARD', 'A_ECHEANCE', 'A_VENIR', 'FAIT', 'SANS_OBJET'] as const
export const ASSESSMENT_RESULTS = ['REUSSI', 'NON_REUSSI', 'EN_ATTENTE', 'AUCUN'] as const

type StepState = { etat: string; echeance: string | null; le: string | null; detail: string | null }
type StepAction = (Capability & { cle: string }) | null

export interface AssessmentRow {
  inscription: string
  stagiaire: string
  stagiaire_id?: string | null
  stagiaire_email?: string | null
  statut: string
  session: RegisterSession & { programme_id: string; programme_code: string | null; certifiante: boolean }
  entreprise: string | null
  financement: string | null
  evaluations: StepState & {
    action: StepAction
    liste: { id: string; nature: string; intitule: string; le: string; note: number | null; reussi: boolean | null }[]
  }
  attestation: StepState & { action: StepAction }
  certification: { resultat: string; epreuves: { intitule: string; le: string; note: number | null; reussi: boolean | null }[] }
}

export interface Assessments {
  /** Nombre d'inscriptions par état, calculé par l'API sur les lignes renvoyées. */
  compteurs: { evaluations: Record<string, number>; attestation: Record<string, number>; certification: Record<string, number> }
  lignes: AssessmentRow[]
}

export interface AssessmentQuery {
  session_id?: string
  programme?: string
  etat?: string
  resultat?: string
}

/** GET /evaluations-acquis : sessions visibles seulement ; filtre inconnu : 422. */
export const getAssessments = (query: AssessmentQuery = {}) => http.get<Assessments>('/evaluations-acquis', { query: { ...query } })
