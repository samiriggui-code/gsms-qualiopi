/** Types des patrons de page GSMS (vues d'ensemble). Les valeurs viennent toujours de l'API, fournies par la page. */

export type Tone = 'danger' | 'warning' | 'success' | 'muted'

export interface KpiItem {
  key: string
  label: string
  value: string | number
  subtitle?: string
  icon: string
  /** Lien vers la liste filtrée. */
  to?: string
  tone?: Tone
  /**
   * Jauge sous le chiffre quand l'API donne une part et son tout (ex. indicateurs démontrables sur le total) :
   * les deux nombres viennent de l'API, la jauge ne fait que les dessiner.
   */
  meter?: { value: number; max: number }
}

export interface AlertItem {
  id: string
  title: string
  subtitle?: string
  /** Source du point (session, preuve, action…). */
  kind?: string
  when?: string
  tone?: Tone
  to?: string | null
}

export interface ModuleFigure {
  label: string
  value: string | number
}

export interface ModuleItem {
  key: string
  title: string
  icon: string
  description?: string
  figures: ModuleFigure[]
  to: string
  loading?: boolean
  /** Refus de l'API pour les chiffres de ce module (affiché à la place des chiffres). */
  error?: unknown
}

export interface EngineRow {
  numero: number
  nom: string
  etat: string
  detail?: string
  to: string
}
