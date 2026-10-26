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
