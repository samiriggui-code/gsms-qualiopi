/**
 * API Financement : dispositifs (handler/funding.py).
 * Référence : docs/API.md (routes, droits). Rangé par domaine, comme api/<domaine>/ du template.
 */
import { http } from './http'
import type { Capability } from './common'

export interface FundingScheme {
  code: string
  libelle: string
  financeur: string
  payeur: string
  prorata: boolean
  etats: string[] | Record<string, unknown>
  actions: Record<string, string>
}

export const listFundingSchemes = () => http.get<FundingScheme[]>('/financement/dispositifs')

export interface FundingRuleValue {
  key: string
  value: unknown
  since: string
  source: string
}

/** GET /financement/regles/{key}?le= (`funding.read`) : aucune route ne liste les clés disponibles. */
export const getFundingRule = (key: string, le?: string) =>
  http.get<FundingRuleValue>(`/financement/regles/${encodeURIComponent(key)}`, { query: { le } })

/** Source de financement d'un dossier (dispositif, état, montants, capacités du circuit). */
export interface FundingSource {
  id: string
  dispositif: string
  libelle: string
  etat: string
  financeur: string | null
  montants: { demande: string | null; accorde: string | null; regle: string | null }
  references: { financeur: string | null; facture: string | null }
  motif: string | null
  historique: { action: string; de: string; vers: string; le: string; portail: string | null; par: string | null; note: string | null }[]
  signataire?: string | null
  destinataire_facture?: string | null
  payeur?: { type: string | null; nom: string | null }
  /** Pièces du dossier financeur, lues par l'API dans les données existantes. */
  pieces?: { piece: string; etat: string; detail: string }[]
  /** Une décision par action du circuit (`a_saisir`, `portail`, `echeance` éventuels). */
  capabilities?: Record<string, FundingCapability>
  /** Dispositif au prorata : demi-journées tenues / prévues, montant facturable estimé par l'API. */
  realisation?: { presentes: number; prevues: number; montant_facturable_estime?: string }
  [extra: string]: unknown
}

export interface FundingCapability extends Capability {
  portail?: string
  echeance?: string
}

/** Dossier de financement d'une inscription (même vue que GET /inscriptions/{id}/financement). */
export interface FundingCase {
  id: string
  inscription_id: string
  stagiaire: string
  session: string
  /** PENDING, UNFUNDED, PARTIALLY_FUNDED, FUNDED, OVERFUNDED : calculé par l'API. */
  statut: string
  cout: string
  accorde: string
  regle: string
  reste_a_financer: string
  sources: FundingSource[]
  [extra: string]: unknown
}

/** GET /financement/dossiers (`funding.read`) : tous les dossiers, chacun rattaché à son inscription. */
export const listFundingCases = () => http.get<FundingCase[]>('/financement/dossiers')

const enc = encodeURIComponent

/** GET /inscriptions/{id}/financement (`funding.read`) : 404 tant qu'aucun dossier n'est ouvert. */
export const getEnrollmentFunding = (enrollmentId: string) => http.get<FundingCase>(`/inscriptions/${enc(enrollmentId)}/financement`)

/** POST /inscriptions/{id}/financement (`funding.write`) : coût par défaut, le prix de la formation. */
export const openFundingCase = (enrollmentId: string, cout?: string | null) =>
  http.post<FundingCase>(`/inscriptions/${enc(enrollmentId)}/financement`, { cout: cout || undefined })

export interface FundingSourceInput {
  dispositif: string
  financeur?: string | null
  montant_demande?: string | null
  signataire?: string | null
  destinataire_facture?: string | null
  payeur?: string | null
}

/** POST /financement/dossiers/{id}/sources (`funding.write`). */
export const addFundingSource = (caseId: string, body: FundingSourceInput) =>
  http.post<FundingSource>(`/financement/dossiers/${enc(caseId)}/sources`, body)

/** POST /financement/sources/{id}/actions/{action} (`funding.write`, `FundingPolicy` : refus 409 motivé). */
export const applyFundingAction = (sourceId: string, action: string, body: Record<string, unknown>) =>
  http.post<FundingSource>(`/financement/sources/${enc(sourceId)}/actions/${enc(action)}`, body)

export interface FundingDeadline {
  source_id: string
  dispositif: string
  action: string
  libelle: string
  portail: string | null
  echeance: string
  etat: 'EN_RETARD' | 'A_ECHEANCE'
  stagiaire: string
  session: string
}

/** GET /financement/echeances?jours= (`funding.read`) : actions en retard ou sous `jours` jours. */
export const listFundingDeadlines = (jours = 15) => http.get<FundingDeadline[]>('/financement/echeances', { query: { jours } })
