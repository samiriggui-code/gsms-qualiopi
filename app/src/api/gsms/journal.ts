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
