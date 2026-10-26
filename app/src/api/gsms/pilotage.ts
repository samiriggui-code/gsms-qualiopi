/**
 * API Pilotage : feuille de route (handler/roadmap.py).
 * Référence : docs/API.md (routes, droits).
 */
import { http } from './http'

export interface RoadmapItem {
  source: string
  echeance: string
  semaine: string
  etat: string
  titre: string
  detail: string
  lien: string | null
  indicateurs: number[]
}

export interface Roadmap {
  aujourd_hui: string
  jusqu_au: string
  sources: string[]
  elements: RoadmapItem[]
}

/** GET /pilotage/feuille-de-route : contenu filtré par l'API selon les droits du compte. */
export const getRoadmap = (semaines = 6) => http.get<Roadmap>('/pilotage/feuille-de-route', { query: { semaines } })
