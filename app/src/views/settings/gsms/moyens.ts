/**
 * Description des ressources « Moyens et partenaires » (CRUD /premises, /equipment, /subcontractors, /partners,
 * /watch-items). Les codes d'un champ à choix et leurs libellés viennent de GET /listes-de-valeurs (store
 * gsmsValueLists) : l'API reste juge et refuse un code inconnu.
 * Libellés des ressources et des champs : clés i18n gsms.parametres.moyens.(ressources|champs).…
 */
import type { ValueListCode } from '@/api/gsms/platform'
import type { MoyenResource } from '@/api/gsms/training'

export type MoyenFieldType = 'text' | 'textarea' | 'int' | 'date' | 'bool' | 'select' | 'premises'

export interface MoyenField {
  /** Champ de l'API ; libellé gsms.parametres.moyens.champs.<key>. */
  key: string
  type: MoyenFieldType
  /** Champ exigé par le schéma de l'API (sinon 422). */
  required?: boolean
  /** Liste de GET /listes-de-valeurs qui donne les codes acceptés et leurs libellés (champ `select`). */
  list?: ValueListCode
}

export interface MoyenColumn {
  key: string
  /** Clé du titre dans gsms.parametres.moyens.champs. */
  title: string
  /** Champ affiché à la place (libellé calculé par l'API). */
  display?: string
  width?: number
}

export interface MoyenDef {
  resource: MoyenResource
  /** Clé dans gsms.parametres.moyens.ressources. */
  i18nKey: string
  /** Droit d'écriture exigé par l'API. */
  write: string
  columns: MoyenColumn[]
  fields: MoyenField[]
  title: (row: Record<string, unknown>) => string
}

export const MOYENS: MoyenDef[] = [
  {
    resource: 'premises', i18nKey: 'premises', write: 'sessions.write',
    title: (r) => String(r.name ?? r.code ?? ''),
    columns: [
      { key: 'name', title: 'lieu' },
      { key: 'kind', title: 'kind', display: 'kind_label', width: 150 },
      { key: 'capacity', title: 'capacite', width: 90 },
      { key: 'status', title: 'status', display: 'status_label', width: 150 },
    ],
    fields: [
      { key: 'code', type: 'text' },
      { key: 'name', type: 'text' },
      { key: 'kind', type: 'select', list: 'types_de_lieu' },
      { key: 'parent_id', type: 'premises' },
      { key: 'address', type: 'text' },
      { key: 'floor', type: 'text' },
      { key: 'capacity', type: 'int' },
      { key: 'accessibility', type: 'textarea' },
      { key: 'status', type: 'select', list: 'statuts_de_lieu' },
      { key: 'checked_on', type: 'date' },
      { key: 'note', type: 'textarea' },
    ],
  },
  {
    resource: 'equipment', i18nKey: 'equipment', write: 'sessions.write',
    title: (r) => String(r.label ?? r.code ?? ''),
    columns: [
      { key: 'label', title: 'equipement' },
      { key: 'category', title: 'category', display: 'category_label', width: 160 },
      { key: 'quantity', title: 'quantite', width: 70 },
      { key: 'next_check_on', title: 'next_check_on', width: 140 },
    ],
    fields: [
      { key: 'code', type: 'text' },
      { key: 'label', type: 'text' },
      { key: 'category', type: 'select', list: 'categories_d_equipement' },
      { key: 'quantity', type: 'int' },
      { key: 'premises_id', type: 'premises' },
      { key: 'regulatory_ref', type: 'text' },
      { key: 'status', type: 'select', list: 'statuts_de_lieu' },
      { key: 'last_check_on', type: 'date' },
      { key: 'next_check_on', type: 'date' },
      { key: 'note', type: 'textarea' },
    ],
  },
  {
    resource: 'subcontractors', i18nKey: 'subcontractors', write: 'quality.write',
    title: (r) => String(r.name ?? ''),
    columns: [
      { key: 'name', title: 'sousTraitant' },
      { key: 'siret', title: 'siret', width: 150 },
      { key: 'qualiopi_certified', title: 'qualiopi', width: 90 },
      { key: 'contract_signed_on', title: 'contrat', width: 130 },
    ],
    fields: [
      { key: 'name', type: 'text' },
      { key: 'siret', type: 'text' },
      { key: 'qualiopi_certified', type: 'bool' },
      { key: 'contract_signed_on', type: 'date' },
      { key: 'last_review_on', type: 'date' },
    ],
  },
  {
    resource: 'partners', i18nKey: 'partners', write: 'quality.write',
    title: (r) => String(r.name ?? ''),
    columns: [
      { key: 'name', title: 'partenaire' },
      { key: 'kind', title: 'kind', width: 160 },
      { key: 'last_contact_on', title: 'dernierContact', width: 140 },
    ],
    fields: [
      { key: 'name', type: 'text', required: true },
      { key: 'kind', type: 'select', list: 'types_de_partenaire', required: true },
      { key: 'last_contact_on', type: 'date' },
    ],
  },
  {
    resource: 'watch-items', i18nKey: 'watchItems', write: 'quality.write',
    title: (r) => String(r.title ?? ''),
    columns: [
      { key: 'title', title: 'veille' },
      { key: 'domain', title: 'domain', width: 170 },
      { key: 'noted_on', title: 'noted_on', width: 120 },
      { key: 'exploited_on', title: 'exploited_on', width: 120 },
    ],
    fields: [
      { key: 'title', type: 'text' },
      { key: 'domain', type: 'select', list: 'domaines_de_veille' },
      { key: 'source', type: 'text' },
      { key: 'noted_on', type: 'date' },
      { key: 'exploitation', type: 'textarea' },
      { key: 'exploited_on', type: 'date' },
    ],
  },
]
