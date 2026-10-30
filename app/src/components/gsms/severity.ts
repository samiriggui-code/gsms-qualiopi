/**
 * Gravité à trois niveaux renvoyée par l'API (alertes et conflits du planning, ou toute gravité HAUTE / MOYENNE /
 * BASSE) : « haute » en rouge plein, « moyenne » en contour rouge sans fond, « basse » en gris. Présentation
 * seulement : la gravité vient de l'API, rien n'est recalculé.
 */
export type Severity = 'HAUTE' | 'MOYENNE' | 'BASSE'

export interface SeverityTag {
  theme: 'danger' | 'default'
  variant: 'light' | 'outline'
}

export function severityTag(gravite: string | null | undefined): SeverityTag {
  const g = (gravite ?? '').toUpperCase()
  if (g === 'HAUTE') return { theme: 'danger', variant: 'light' }
  if (g === 'MOYENNE') return { theme: 'danger', variant: 'outline' }
  return { theme: 'default', variant: 'light' }
}

/** Classe CSS partagée (`gsms-severity--haute|moyenne|basse`, définie dans tdesign-overrides.less). */
export function severityClass(gravite: string | null | undefined): string {
  const g = (gravite ?? '').toUpperCase()
  return `gsms-severity--${g === 'HAUTE' ? 'haute' : g === 'MOYENNE' ? 'moyenne' : 'basse'}`
}
