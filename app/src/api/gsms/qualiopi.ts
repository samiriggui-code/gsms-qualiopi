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
