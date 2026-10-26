/**
 * API Financement : dispositifs (handler/funding.py).
 * Référence : docs/API.md (routes, droits). Rangé par domaine, comme api/<domaine>/ du template.
 */
import { http } from './http'

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
  [extra: string]: unknown
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
