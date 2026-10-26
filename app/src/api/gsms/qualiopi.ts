/**
 * API Moteur Qualiopi : référentiels et cycles de certification (handler/qualiopi*.py).
 * Référence : docs/API.md (routes, droits). Rangé par domaine, comme api/<domaine>/ du template.
 */
import { http } from './http'

export interface ReferentialVersion {
  id: string
  code: string
  version: string
  title: string
  effective_from: string
  source_label: string | null
  source_url: string | null
  imported_at: string | null
  is_active?: boolean
  [extra: string]: unknown
}

export const listReferentials = () =>
  http.get<{ versions: ReferentialVersion[]; dossiers: string[] }>('/referentials')

export interface CertificationCycle {
  id: string
  label: string
  kind: string
  period_start: string
  period_end: string | null
  audit_on: string | null
  certifier: string | null
}

export const listCycles = () => http.get<CertificationCycle[]>('/qualiopi/cycles')

export type CycleKind = 'INITIAL' | 'SURVEILLANCE' | 'RENOUVELLEMENT' | 'INTERNE'

export interface CycleIn {
  label: string
  kind: CycleKind
  period_start: string
  period_end?: string | null
  audit_on?: string | null
  certifier?: string | null
  notes?: string | null
}

/** POST /qualiopi/cycles (`quality.write`) : pas de modification ni de suppression côté API. */
export const createCycle = (cycle: CycleIn) => http.post<{ id: string; label: string }>('/qualiopi/cycles', cycle)

export interface ActiveReferential extends ReferentialVersion {
  indicators: number
  criteria: { number: number; title: string }[]
}

export const getActiveReferential = () => http.get<ActiveReferential>('/referentials/active')

export interface IndicatorSummary {
  number: number
  code: string
  criterion_number: number
  criterion_name: string
  title: string
  short_title: string
  scope: string
  ponderation: string | null
  new_entrant_adapted: boolean
  subcontracting: boolean
  applicability: Record<string, unknown>
  expected_evidence: string[]
  controls_count: number
}

export const listActiveIndicators = () => http.get<IndicatorSummary[]>('/referentials/active/indicators')
