/**
 * API Journal des modifications (handler/journal.py).
 * Référence : docs/API.md (routes, droits).
 */
import { http } from './http'

export interface JournalLine {
  id: number
  table: string
  entite: string
  action: string
  champs: string[]
  changes: Record<string, [unknown, unknown]> | null
  actor: string | null
  at: string
}

export interface JournalPage {
  lignes: JournalLine[]
  tables: string[]
  suite: number | null
}

export const getRecentJournal = (query: { table?: string; acteur?: string; avant?: number | null; limite?: number } = {}) =>
  http.get<JournalPage>('/journal/recent', { query })

/** Une modification d'une donnée précise (GET /journal?table=&entity_id=, `journal.read`), la plus ancienne d'abord. */
export interface EntityJournalLine {
  /** CREATION, MODIFICATION ou SUPPRESSION. */
  action: string
  /** Modification : {champ: [avant, après]} ; création et suppression : instantané {champ: valeur}. */
  changes: Record<string, unknown> | null
  actor: string | null
  at: string
}

export const getEntityJournal = (table: string, entityId: string) =>
  http.get<EntityJournalLine[]>('/journal', { query: { table, entity_id: entityId } })
