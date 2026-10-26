/**
 * API Formation : ressources CRUD (moyens et partenaires, handler/training_resources.py), catalogue
 * (handler/training_offre.py) et fiche formation (handler/edof.py, routes /fiches).
 * Référence : docs/API.md (routes, droits). Rangé par domaine, comme api/<domaine>/ du template.
 */
import { http } from './http'
import type { Capabilities, Capability } from './common'

const enc = encodeURIComponent

/** Ressources CRUD de « Moyens et partenaires ». */
export type MoyenResource = 'premises' | 'equipment' | 'subcontractors' | 'partners' | 'watch-items'
export type MoyenRow = Record<string, unknown> & { id: string }

export const listMoyens = (resource: MoyenResource) => http.get<MoyenRow[]>(`/${resource}`)
export const createMoyen = (resource: MoyenResource, data: Record<string, unknown>) =>
  http.post<MoyenRow>(`/${resource}`, data)
export const updateMoyen = (resource: MoyenResource, id: string, data: Record<string, unknown>) =>
  http.patch<MoyenRow>(`/${resource}/${encodeURIComponent(id)}`, data)
export const deleteMoyen = (resource: MoyenResource, id: string) =>
  http.delete<void>(`/${resource}/${encodeURIComponent(id)}`)

// ── Offre de formation : catalogue et fiche formation (handler/training_offre.py, handler/edof.py) ──


export interface CatalogueFormation {
  id: string
  code: string
  title: string
  catalog_slug: string | null
  /** Vignette : chemin de la médiathèque (media/…), ou null. */
  image_url?: string | null
  track: string | null
  track_label: string | null
  pathway: string | null
  pathway_label: string | null
  delivery_label: string | null
  duration_hours: number | null
  price_eur: number | null
  is_certifying: boolean
  certification: { basis: string; basis_label: string; code: string | null }
  modules: number
  prerequisites: number
  sessions: { total: number; a_venir: number; prochaine: { id: string; reference: string; start_date: string } | null }
  ressources: { total: number; a_rediger: number }
  points_a_arbitrer: number
  rubriques_manquantes: number
  /** État de la fiche : VALIDEE, MODIFIEE ou JAMAIS_VALIDEE. */
  fiche: string
  fiche_relue_le: string | null
  publie: { taux_reussite: number | null; taux_satisfaction: number | null; base: unknown }
}

export interface Catalogue {
  formations: CatalogueFormation[]
  totaux: {
    formations: number
    certification_identifiee: number
    sessions_a_venir: number
    points_a_arbitrer: number
    formations_a_arbitrer: number
    fiches_validees: number
  }
  filieres: { value: string; label: string; count: number }[]
  parcours: { value: string; label: string; count: number }[]
  capabilities: Capabilities
}

/** GET /formation/catalogue (`sessions.read` ou `quality.read`). */
export const getCatalogue = () => http.get<Catalogue>('/formation/catalogue')

/** Totaux mesurés par l'API sur la période (I2, I3) ; un taux vaut `null` quand rien n'a été mesuré. */
export interface ResultsTotals {
  sessions: number
  stagiaires: number
  examines: number
  repondants: number
  taux_reussite: number | null
  taux_abandon: number | null
  taux_satisfaction: number | null
}

/** Mesure d'une formation sur la période ; un taux vaut `null` quand rien n'a été mesuré. */
export interface ResultsMeasure extends ResultsTotals {
  abandons: number
  reussis: number
  enquetes: number
  satisfaits: number
  taux_reponse: number | null
  note_moyenne: number | null
}

/** Une formation du catalogue : `mesure` vaut `null` sans session terminée sur la période. */
export interface ResultsFormation {
  id: string
  code: string | null
  title: string
  is_certifying: boolean
  mesure: ResultsMeasure | null
  publie: { taux_reussite: number | null; taux_satisfaction: number | null; base: unknown }
  ecarts: unknown[]
}

export interface Results {
  periode: { du: string; au: string; mois: number }
  methode: Record<string, string>
  totaux: ResultsTotals
  formations_mesurees: number
  formations?: ResultsFormation[]
}

/** GET /formation/resultats (`sessions.read` ou `quality.read`) : résultats mesurés sur `mois` mois. */
export const getResults = (mois = 12) => http.get<Results>('/formation/resultats', { query: { mois } })

export interface ProgramModule {
  code?: string | null
  title?: string | null
  details?: string[]
  [extra: string]: unknown
}

/** Colonnes de la formation, renvoyées telles quelles par GET /fiches/{id}. */
export interface Program {
  id: string
  code: string
  title: string
  image_url?: string | null
  action_category: string | null
  is_certifying: boolean
  rncp_code: string | null
  duration_hours: string | number | null
  price_eur: string | number | null
  prerequisites: string[]
  objectives: string[]
  skills: string[]
  audience: string | null
  content: string | null
  modules: ProgramModule[]
  teaching_methods: string | null
  teaching_means: string | null
  evaluation_methods: string | null
  access_delay: string | null
  accessibility_info: string | null
  delivery_mode: string | null
  certification_alignment: string | null
  public_info_reviewed_on: string | null
  [extra: string]: unknown
}

export interface ProgramCertification {
  basis: string
  code: string | null
  title: string | null
  certifier: string | null
  registration_end: string | null
  source_url: string | null
  checked_on: string | null
  checked_by: string | null
  habilitation: string
  partner_siret: string | null
  habilitation_checked_on: string | null
  habilitation_checked_by: string | null
  evaluator_name: string | null
  note: string | null
  [extra: string]: unknown
}

export interface ProgramTrainer {
  id: string
  trainer_id: string
  name: string
  photo_url?: string | null
  role: string
  modules: string[]
  qualifications: { label: string; kind: string; valid_until: string | null }[]
}

export interface ProgramResource {
  id: string
  title: string
  kind: string
  module_code: string | null
  origin: string
  rights: string
  status: string
  note: string | null
  [extra: string]: unknown
}

export interface ProgramVersion {
  id: string
  version: number
  sha256: string
  validated_by: string | null
  validated_at: string | null
  note: string | null
}

export interface ProgramSheet {
  program: Program
  certification: ProgramCertification | null
  certification_bases: Record<string, string>
  habilitations: Record<string, string>
  delivery_modes: Record<string, string>
  roles: Record<string, string>
  trainers: ProgramTrainer[]
  resources: ProgramResource[]
  missing: { field: string; label: string; message: string }[]
  version_state: { state: string; version: number | null; version_id?: string; validated_by?: string; validated_at?: string }
  versions: ProgramVersion[]
  capabilities: { edit: Capability; validate: Capability; verify: Capability }
  dossier: { id: string } | null
}

export interface ProgramPedagogy {
  sessions: {
    session_id: string
    reference: string
    start_date: string
    end_date: string
    status: string
    learners: number
    attendance: { present: number; expected: number; rate: number | null }
    assessed_learners: number
    certificates: number
    abandons: number
  }[]
  limits: string[]
}

/** GET /fiches/{id} (`sessions.read` ou `edof.read`) : fiche complète et capacités. */
export const getProgramSheet = (id: string) => http.get<ProgramSheet>(`/fiches/${enc(id)}`)
/** GET /fiches/{id}/suivi-pedagogique. */
export const getProgramPedagogy = (id: string) => http.get<ProgramPedagogy>(`/fiches/${enc(id)}/suivi-pedagogique`)
/** PUT /fiches/{id}/certification (`sessions.write`) : les vérifications tombent si les valeurs changent. */
export const putProgramCertification = (id: string, body: Record<string, unknown>) =>
  http.put<ProgramCertification>(`/fiches/${enc(id)}/certification`, body)
/** POST /fiches/{id}/verifications (`programs.validate`) : `quoi` = certification ou habilitation. */
export const attestProgramVerification = (id: string, quoi: 'certification' | 'habilitation') =>
  http.post<ProgramCertification>(`/fiches/${enc(id)}/verifications`, { quoi })
/** POST /fiches/{id}/versions (`programs.validate`) : fige une nouvelle version (refus 409 motivé). */
export const validateProgramVersion = (id: string, note?: string | null) =>
  http.post<{ id: string; version: number; sha256: string }>(`/fiches/${enc(id)}/versions`, { note: note || null })
/** Chemin du programme imprimable d'une version validée (à télécharger avec downloadFile). */
export const programmePath = (id: string, versionId: string) =>
  `/fiches/${enc(id)}/versions/${enc(versionId)}/programme?telecharger=true`
/** POST /programs (`sessions.write`) : nouvelle formation (code, intitulé…). */
export const createProgram = (body: Record<string, unknown>) => http.post<{ id: string }>('/programs', body)
/** PATCH /programs/{id} (`sessions.write`) : complète les rubriques de la fiche. */
export const updateProgram = (id: string, body: Record<string, unknown>) => http.patch<Program>(`/programs/${enc(id)}`, body)
