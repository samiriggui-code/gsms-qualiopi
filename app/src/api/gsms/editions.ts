/**
 * API Documents professionnels : types et statuts, devis (liste, fiche, lignes, circuit, aperçu) — handler/editions.py.
 * Référence : docs/API.md (routes, droits). Rangé par domaine, comme api/<domaine>/ du template.
 */
import { http } from './http'
import { downloadFile } from './files'
import type { Capability } from './common'

export interface EditionTypes {
  types: { code: string; libelle: string; disponible: boolean }[]
  statuts: Record<string, string> | string[]
  unites: Record<string, string> | string[]
}

/** GET /editions/types (`documents.read`). */
export const getEditionTypes = () => http.get<EditionTypes>('/editions/types')

// ── Devis : liste, fiche, circuit (docs/API.md, « Documents professionnels ») ──────────────────

export interface EditionRow {
  id: string
  reference: string
  type: string
  type_libelle: string
  titre: string | null
  statut: string
  statut_libelle: string
  client: { id: string; nom: string; code: string | null } | null
  version: number
  valide_jusqu_au: string | null
  /** Validité dépassée d'un document validé ou envoyé, décidé par l'API. */
  expire: boolean
  envoye_le: string | null
  cree_le: string
  modifie_le: string
  par: string | null
}

export interface EditionLine {
  id: string
  formation_id: string | null
  formation: { code: string; titre: string; prix_a_confirmer: boolean } | null
  libelle: string
  detail: string | null
  quantite: number
  unite: string
  prix_unitaire: number | null
  remise_pct: number
  montant_ht: number | null
}

/** Point qui empêche la soumission ou la validation, avec où le corriger (`cible`). */
export interface EditionCheck {
  code: string
  message: string
  cible: string
  id: string | null
}

export interface EditionDetail extends Omit<EditionRow, 'client'> {
  client: {
    id: string; nom: string; code: string | null; siret: string | null; adresse: string | null
    code_postal: string | null; ville: string | null; contact: string | null; email: string | null
  } | null
  sections: { titre: string; texte: string }[]
  lignes: EditionLine[]
  totaux: {
    total_ht: number | null; tva_regime: string | null; tva_taux: number | null; tva: number | null
    total_ttc: number | null; complet: boolean; mention_tva: string | null
  }
  verifications: EditionCheck[]
  historique: { action: string; de: string; vers: string; par: string | null; le: string; motif: string | null; version: number | null }[]
  versions: { id: string; version: number; statut: string; sha256: string; emis_le: string; par: string | null }[]
  /** `modifier` et une décision par action du circuit (`soumettre`, `valider`…), avec `libelle` et `a_saisir`. */
  capabilities: Record<string, Capability>
}

export interface EditionClient { id: string; nom: string; code: string | null; adresse_complete: boolean }
export interface EditionProgram {
  id: string; code: string; titre: string; prix: number | null; prix_a_confirmer: boolean; duree_heures: number | null
}

export interface EditionLineInput {
  formation_id: string | null
  libelle: string
  detail: string | null
  quantite: number
  unite: string
  prix_unitaire: number | null
  remise_pct: number
}

/** Actions du circuit, dans l'ordre où elles s'enchaînent (POST /editions/{id}/actions/{action}). */
export const EDITION_ACTIONS = ['soumettre', 'renvoyer', 'valider', 'envoyer', 'reprendre', 'archiver', 'abandonner'] as const

const path = (id: string) => `/editions/${encodeURIComponent(id)}`

/** GET /editions (`documents.read`), plus récemment modifiés d'abord. */
export const listEditions = () => http.get<EditionRow[]>('/editions')
/** GET /editions/{id} (`documents.read`) : contrôles et capacités. */
export const getEdition = (id: string) => http.get<EditionDetail>(path(id))
/** GET /editions/clients (`documents.read`). */
export const listEditionClients = () => http.get<EditionClient[]>('/editions/clients')
/** GET /editions/formations (`documents.read`) : tarif et « à confirmer ». */
export const listEditionPrograms = () => http.get<EditionProgram[]>('/editions/formations')
/** POST /editions (`documents.write`). */
export const createEdition = (clientId: string, titre?: string | null) =>
  http.post<EditionDetail>('/editions', { type: 'DEVIS', client_id: clientId, titre: titre || null })
/** PATCH /editions/{id} (`documents.write`, brouillon seulement). */
export const updateEdition = (id: string, data: { titre?: string; valide_jusqu_au?: string | null }) =>
  http.patch<EditionDetail>(path(id), data)
/** PUT /editions/{id}/lignes (`documents.write`, brouillon seulement). */
export const putEditionLines = (id: string, lines: EditionLineInput[]) => http.put<EditionDetail>(`${path(id)}/lignes`, lines)
/** POST /editions/{id}/actions/{action} : la politique de l'API juge (refus 409). */
export const editionAction = (id: string, action: string, body: { motif?: string | null; date_envoi?: string | null } = {}) =>
  http.post<EditionDetail>(`${path(id)}/actions/${encodeURIComponent(action)}`, body)
/** Aperçu A4 (filigrane tant que non validé), téléchargé en fichier : jamais injecté dans la page. */
export const downloadEditionPreview = (id: string, reference: string) => downloadFile(`${path(id)}/apercu`, `${reference}-apercu.html`)
/** Version validée archivée (empreinte vérifiée par l'API). */
export const downloadEditionVersion = (id: string, documentId: string, name: string) =>
  downloadFile(`${path(id)}/versions/${encodeURIComponent(documentId)}`, `${name}.html`)
