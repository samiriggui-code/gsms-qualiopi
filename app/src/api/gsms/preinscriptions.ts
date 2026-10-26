/**
 * API Préinscriptions : demandes reçues du formulaire du site (handler/preinscriptions.py).
 * Lecture `leads.read` (l'API ne renvoie les données des candidats qu'avec ce droit), traitement `leads.write`.
 * Référence : docs/API.md, section « Préinscriptions ».
 */
import { http } from './http'
import type { Capability } from './common'

export interface PreinscriptionRow {
  id: string
  reference: string
  /** NOUVELLE, EN_COURS, CONVERTIE, REFUSEE. */
  statut: string
  statut_libelle: string
  civilite: string | null
  prenom: string
  nom: string
  nom_usage: string | null
  email: string
  telephone: string | null
  formation: { slug: string | null; nom: string | null; id: string | null; code: string | null }
  session_souhaitee: string | null
  financement: string | null
  situation: string | null
  origine: string | null
  recue_le: string | null
  statut_change_le: string | null
  traitee_par: string | null
}

export interface PreinscriptionList {
  total: number
  statuts: Record<string, string>
  compteurs: Record<string, number>
  demandes: PreinscriptionRow[]
}

/** Session inscriptible de la formation, avec la décision d'inscription de l'API (TrainingPolicy). */
export interface ProposedSession {
  id: string
  reference: string
  debut: string | null
  fin: string | null
  lieu: string | null
  statut: string
  places: number | null
  inscrits: number
  inscription: Capability
}

export interface PreinscriptionDetail extends PreinscriptionRow {
  civilite_libelle: string | null
  naissance: { date: string | null; ville: string | null; departement: string | null; pays: string | null }
  nationalite: string | null
  adresse: { adresse: string | null; code_postal: string | null; ville: string | null }
  experience: string | null
  motivation: string | null
  declarations: { code: string; libelle: string; cochee: boolean }[]
  declarations_le: string | null
  motif_refus: string | null
  conversion: {
    le: string | null
    stagiaire: { id: string; nom: string } | null
    session: { id: string; reference: string } | null
    inscription_id: string | null
  } | null
  stagiaire_existant: { id: string; nom: string } | null
  sessions_proposees: ProposedSession[]
  /** `EN_COURS`, `REFUSEE` (saisie `motif`) et `convertir`. */
  capabilities: { EN_COURS: Capability; REFUSEE: Capability; convertir: Capability }
}

export interface ConversionResult extends PreinscriptionDetail {
  resultat: { stagiaire_id: string; stagiaire_existant: boolean; inscription_id: string | null; session_id: string | null }
}

/** GET /preinscriptions (`leads.read`) : plus récentes d'abord ; filtre et recherche faits par l'API, 500 au plus. */
export const listPreinscriptions = (query: { statut?: string; recherche?: string } = {}, signal?: AbortSignal) =>
  http.get<PreinscriptionList>('/preinscriptions', { query: { ...query, limite: 500 }, signal })

/** GET /preinscriptions/{id} (`leads.read`). */
export const getPreinscription = (id: string) => http.get<PreinscriptionDetail>(`/preinscriptions/${encodeURIComponent(id)}`)

/** POST /preinscriptions/{id}/statut (`leads.write`) : EN_COURS ou REFUSEE (motif). */
export const setPreinscriptionStatus = (id: string, statut: 'EN_COURS' | 'REFUSEE', motif?: string | null) =>
  http.post<PreinscriptionDetail>(`/preinscriptions/${encodeURIComponent(id)}/statut`, { statut, motif: motif || null })

/** POST /preinscriptions/{id}/conversion (`leads.write`) : stagiaire, puis inscription si une session est choisie. */
export const convertPreinscription = (id: string, sessionId: string | null) =>
  http.post<ConversionResult>(`/preinscriptions/${encodeURIComponent(id)}/conversion`, { session_id: sessionId })
