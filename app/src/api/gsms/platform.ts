/**
 * API Socle : démarrage (/bootstrap), santé, modules, réglages datés, organisme (handler/platform.py).
 * Référence : docs/API.md (routes, droits). Rangé par domaine, comme api/<domaine>/ du template.
 */
import { http } from './http'

export interface NavEntry {
  key: string
  label: string
}

export interface Bootstrap {
  user: { id: string; email: string; full_name: string; roles: string[] }
  permissions: string[]
  features: string[]
  organization: { id: string; name: string; short_name: string; brand_color: string | null } | null
  navigation: NavEntry[]
}

export const getBootstrap = () => http.get<Bootstrap>('/bootstrap')
export const getHealth = () => http.get<{ status: string }>('/health', { auth: false })

export interface Feature {
  code: string
  label: string
  enabled: boolean
  available: boolean
  depends_on: string[]
}

export const listFeatures = () => http.get<Feature[]>('/features')
export const setFeature = (code: string, enabled: boolean) =>
  http.put<{ code: string; enabled: boolean }>(`/features/${encodeURIComponent(code)}`, { enabled })

export interface JsonSchema {
  type?: string | string[]
  enum?: unknown[]
  const?: unknown
  items?: JsonSchema
  properties?: Record<string, JsonSchema>
  anyOf?: JsonSchema[]
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  title?: string
  $defs?: Record<string, JsonSchema>
  $ref?: string
  [extra: string]: unknown
}

export interface SettingView {
  key: string
  domain: string
  label: string
  help: string
  regulatory: boolean
  schema: JsonSchema
  default: unknown
  value: unknown
  since: string | null
  next: { value: unknown; from: string } | null
}

export interface SettingHistoryRow {
  value: unknown
  effective_from: string
  reason: string | null
  by: string | null
  at: string
}

export const listSettings = () => http.get<SettingView[]>('/settings')
export const settingHistory = (key: string) =>
  http.get<SettingHistoryRow[]>(`/settings/${encodeURIComponent(key)}/history`)
export const changeSetting = (key: string, value: unknown, effective_from?: string | null, reason?: string | null) =>
  http.put<{ key: string; value: unknown; effective_from: string }>(`/settings/${encodeURIComponent(key)}`, {
    value,
    effective_from: effective_from || null,
    reason: reason || null,
  })

export interface Organisme {
  existe: boolean
  id: string | null
  name: string | null
  nda_number: string | null
  siret: string | null
  action_categories: string[] | null
  is_new_entrant: boolean | null
  disability_referent_name: string | null
  disability_referent_email: string | null
  mobility_referent_name: string | null
  categories_possibles: { code: string; libelle: string }[]
}

export type OrganismePatch = Partial<Omit<Organisme, 'existe' | 'id' | 'categories_possibles'>>

export const getOrganisme = () => http.get<Organisme>('/organisme')
export const updateOrganisme = (patch: OrganismePatch) => http.patch<Organisme>('/organisme', patch)
