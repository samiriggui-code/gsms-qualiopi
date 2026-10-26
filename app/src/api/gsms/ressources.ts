/**
 * Types des ressources « Moyens et partenaires » (CRUD /premises, /equipment, /subcontractors, /partners,
 * handler/training_resources.py) lues par les pages Lieux, Équipements, Sous-traitants et Partenaires. Les appels
 * sont ceux du panneau Paramètres (`listMoyens`, `createMoyen`… dans training.ts) : ce fichier ne fait que les typer.
 * Référence : docs/API.md (routes, droits).
 */
import { createMoyen, deleteMoyen, listMoyens, updateMoyen, type MoyenResource, type MoyenRow } from './training'

export interface Premises extends MoyenRow {
  code: string | null
  name: string | null
  kind: string
  /** Libellés renvoyés par l'API. */
  kind_label: string
  status: string
  status_label: string
  parent_id: string | null
  parent_name: string | null
  address: string | null
  floor: string | null
  capacity: number | null
  accessibility: string | null
  checked_on: string | null
  note: string | null
  /** Nombre d'équipements rangés dans ce lieu. */
  equipment: number
}

export interface Equipment extends MoyenRow {
  code: string | null
  label: string | null
  category: string
  category_label: string
  quantity: number
  premises_id: string | null
  premises_name: string | null
  regulatory_ref: string | null
  status: string
  status_label: string
  last_check_on: string | null
  next_check_on: string | null
  /** Prochaine vérification dépassée, décidé par l'API. */
  check_overdue: boolean
  note: string | null
}

export interface Subcontractor extends MoyenRow {
  name: string
  siret: string | null
  qualiopi_certified: boolean
  contract_signed_on: string | null
  last_review_on: string | null
}

export interface Partner extends MoyenRow {
  /** HANDICAP ou SOCIO_ECONOMIQUE. */
  kind: string
  name: string
  last_contact_on: string | null
}

interface Rows {
  premises: Premises
  equipment: Equipment
  subcontractors: Subcontractor
  partners: Partner
}
export type RessourceKind = keyof Rows & MoyenResource

export const listRessources = <K extends RessourceKind>(kind: K) => listMoyens(kind) as Promise<Rows[K][]>
export const createRessource = <K extends RessourceKind>(kind: K, data: Record<string, unknown>) =>
  createMoyen(kind, data) as Promise<Rows[K]>
export const updateRessource = <K extends RessourceKind>(kind: K, id: string, data: Record<string, unknown>) =>
  updateMoyen(kind, id, data) as Promise<Rows[K]>
export const deleteRessource = (kind: RessourceKind, id: string) => deleteMoyen(kind, id)
