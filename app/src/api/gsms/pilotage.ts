/**
 * API Pilotage : feuille de route (handler/roadmap.py), planning et bilans (handler/pilotage.py).
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
  /** Personne citée par l'échéance (formateur, stagiaire), avec sa photo (chemin de la médiathèque). */
  personne?: { nom: string; photo_url: string | null } | null
}

export interface Roadmap {
  aujourd_hui: string
  jusqu_au: string
  sources: string[]
  elements: RoadmapItem[]
}

/** GET /pilotage/feuille-de-route : contenu filtré par l'API selon les droits du compte. */
export const getRoadmap = (semaines = 6) => http.get<Roadmap>('/pilotage/feuille-de-route', { query: { semaines } })

// ── Planning (handler/pilotage.py, service pilotage/planning.py) ──────────────

/** Conflit d'un créneau avec un autre (même formateur ou même salle), calculé par l'API, jamais bloquant. */
export interface PlanningSlotConflict {
  type: 'FORMATEUR' | 'SALLE' | string
  avec: string
  sessions: string[]
  certitude: 'CERTAIN' | 'A_VERIFIER' | string
}

export interface PlanningSlot {
  id: string
  /** DEMI_JOURNEE (émargement) ou SESSION (session entière, sans demi-journées). */
  type: 'DEMI_JOURNEE' | 'SESSION' | string
  debut: string
  fin: string
  periode: 'MATIN' | 'APRES_MIDI' | string | null
  heure_debut: string | null
  heure_fin: string | null
  session: { id: string; reference: string; statut: string }
  programme: { id: string; code: string | null; intitule: string | null; image_url?: string | null }
  formateur: { id: string; nom: string | null; photo_url?: string | null } | null
  lieu: string | null
  salle: string | null
  effectif: number
  capacite: number | null
  conflits: PlanningSlotConflict[]
  /** Salle rapprochée des lieux (nom de la salle et du site), avec sa capacité ; `null` sans rapprochement. */
  salle_lieu?: PlanningRoom | null
  /** Identifiants des alertes qui concernent ce créneau (voir `Planning.alertes`). */
  alertes?: string[]
  /** Gravité la plus haute parmi ces alertes (décidée par l'API). */
  alerte_max?: PlanningSeverity | null
}

export type PlanningSeverity = 'HAUTE' | 'MOYENNE' | 'BASSE'

export interface PlanningRoom { id: string; code: string; nom: string; capacite: number | null }

/** Jalon du circuit de session, tel que le moteur l'a évalué (échéancier). */
export interface PlanningMilestone {
  cle: string
  libelle: string
  echeance: string
  etat: 'FAIT' | 'A_ECHEANCE' | 'EN_RETARD' | 'A_VENIR' | 'SANS_OBJET' | string
  fait: number
  total: number
  responsable: string
  indicateurs: number[]
  explication: string
}

export interface PlanningSession {
  id: string
  reference: string
  statut: string
  debut: string
  fin: string
  formation: { id: string; code: string | null; intitule: string | null; image_url: string | null }
  formateur: { id: string; nom: string | null; photo_url: string | null } | null
  lieu: string | null
  salle: string | null
  salle_lieu: PlanningRoom | null
  capacite: number | null
  inscrits: number
  places_restantes: number | null
  echeances: PlanningMilestone[]
  echeances_evaluees_le: string | null
  alertes: string[]
}

/** Où agir : le front traduit la cible en écran (fiche session, émargement, formateur, lieux). */
export interface PlanningLink { cible: 'SESSION' | 'EMARGEMENT' | 'FORMATEUR' | 'SALLE' | string; id: string | null; onglet: string | null }

export interface PlanningAlert {
  id: string
  code: string
  gravite: PlanningSeverity
  message: string
  le: string
  sessions: { id: string; reference: string }[]
  creneaux: string[]
  lien: PlanningLink
}

export interface PlanningResourceDay { jour: string; creneaux: number; sessions: string[] }
export interface PlanningResources {
  formateurs: { id: string | null; nom: string | null; photo_url: string | null; creneaux: number; jours: PlanningResourceDay[] }[]
  salles: { cle: string | null; lieu: string | null; salle: string | null; salle_lieu: PlanningRoom | null; creneaux: number; jours: PlanningResourceDay[] }[]
}

export interface PlanningConflict {
  type: 'FORMATEUR' | 'SALLE' | string
  creneaux: string[]
  sessions: string[]
  ressource: string | null
  le: string
  certitude: 'CERTAIN' | 'A_VERIFIER' | string
}

export interface Planning {
  du: string
  au: string
  aujourd_hui?: string
  compteurs: {
    creneaux: number; sessions: number; conflits: number
    alertes?: number; alertes_par_gravite?: Record<PlanningSeverity, number>
  }
  creneaux: PlanningSlot[]
  conflits: PlanningConflict[]
  sessions?: PlanningSession[]
  alertes?: PlanningAlert[]
  ressources?: PlanningResources
  filtres: { formateurs: { id: string; nom: string | null }[]; programmes: { id: string; intitule: string | null }[]; lieux: string[] }
  avertissement: string
  avertissement_alertes?: string
}

export interface PlanningQuery {
  du: string
  au: string
  formateur?: string
  lieu?: string
  programme?: string
  annulees?: boolean
}

/** GET /planning : 93 jours au plus (422 au-delà) ; sessions visibles seulement. */
export const getPlanning = (query: PlanningQuery) => http.get<Planning>('/planning', { query: { ...query } })

// ── Bilans et rapports ────────────────────────────────────────────────────────

export interface ReportEntry {
  code: string
  intitule: string
  /** Route de l'API qui produit le rapport. */
  route: string
  nature: 'LECTURE' | 'IMPRESSION' | 'AIDE' | string
  /** Accessible à ce compte (décidé par l'API d'après ses permissions). */
  disponible: boolean
  permissions: string[]
}

export const getReports = () => http.get<{ rapports: ReportEntry[] }>('/bilans')

/** États d'un cadre de l'aide au BPF (docs/bilans/SOURCES.md). */
export type BpfState = 'CALCULE' | 'INDICATIF' | 'PARTIEL' | 'NON_CALCULABLE'

/** Valeurs d'un cadre : nombres, textes ou sous-tableaux, telles que l'API les compose. */
export type BpfValue = string | number | boolean | null | BpfValue[] | { [key: string]: BpfValue }

export interface BpfBlock {
  cadre: string
  intitule: string
  etat: BpfState | string
  valeurs: Record<string, BpfValue>
  manque: string | null
  methode: string | null
}

export interface BpfHelp {
  exercice: number
  du: string
  au: string
  exercice_clos: boolean
  synthese: {
    sessions: number
    stagiaires: number
    personnes: number
    heures_stagiaires: number
    dont_heures_estimees: number
    inscriptions_sans_heures: number
    presences_sans_horaires: number
  }
  cadres: BpfBlock[]
  avertissement: string
  sources: string[]
}

/** GET /bilans/bpf : aide au BPF (ne produit pas le BPF) ; exercice à venir : 422. */
export const getBpfHelp = (exercice: number) => http.get<BpfHelp>('/bilans/bpf', { query: { exercice } })
