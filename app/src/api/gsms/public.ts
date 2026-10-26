/**
 * Pages publiques par lien signé (sans compte) : questionnaire, espace du stagiaire, émargement.
 * Routes : handler/questionnaires.py (`/public/…`) et handler/attendance.py (`/emargement/signer`), docs/API.md §1.
 * Aucun jeton de session n'est envoyé (`auth: false`) : un 401 ne renvoie jamais vers la connexion.
 */
import { http } from './http'

export type QuestionType = 'texte' | 'choix' | 'note' | 'oui_non'
export type AnswerValue = string | number | boolean

export interface PublicQuestion {
  id: string
  libelle: string
  type: QuestionType
  requis?: boolean
  options?: string[] | null
  aide?: string | null
  si?: Record<string, AnswerValue> | null
}

export interface PublicQuestionnaire {
  organisme: string | null
  formation: string
  session: { reference: string; debut: string; fin: string }
  pour: string | null
  expire_le: string
  questionnaire: { code: string; titre: string; introduction: string; questions: PublicQuestion[] }
}

export interface Espace {
  organisme: {
    nom: string | null
    contact: string | null
    referent_handicap: { nom: string; email: string | null } | null
  }
  stagiaire: { prenom: string; statut: string }
  formation: {
    intitule: string
    reference: string
    debut: string
    fin: string
    statut: string
    lieu: string | null
    salle: string | null
    formateur: string | null
  }
  creneaux: { jour: string; periode: string; debut: string | null; fin: string | null; present: boolean | null }[]
  assiduite: { prevues: number; suivies: number; heures_prevues: string | null; heures_suivies: string | null }
  a_faire: { titre: string; jusqu_au: string; lien: string }[]
  questionnaires_repondus: { titre: string; repondu_le: string }[]
  documents: { type: string; titre: string; emis_le: string | null; lien: string }[]
  convention: { signee_le: string } | null
  expire_le: string
}

const tok = (jeton: string) => encodeURIComponent(jeton)
const pub = { auth: false } as const

export const getPublicQuestionnaire = (jeton: string) =>
  http.get<PublicQuestionnaire>(`/public/questionnaires/${tok(jeton)}`, pub)
export const answerPublicQuestionnaire = (jeton: string, reponses: Record<string, AnswerValue>) =>
  http.post<{ merci: boolean; questionnaire: string }>(`/public/questionnaires/${tok(jeton)}`, { reponses }, pub)
export const getEspace = (jeton: string) => http.get<Espace>(`/public/espace/${tok(jeton)}`, pub)
export const signAttendance = (code: string, jeton: string) =>
  http.post<{ signe_le: string | null }>('/emargement/signer', { code, jeton }, pub)
