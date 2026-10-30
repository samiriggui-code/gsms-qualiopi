/**
 * Mise en forme propre aux pages Finances (présentation seulement) : les montants arrivent de l'API en centimes
 * entiers (facturation) ou en euros décimaux (financement) ; aucun total ni aucune TVA n'est calculé ici.
 */

const EUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })

/** 480000 → « 4 800,00 € ». */
export function centimes(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return EUR.format(value / 100)
}

/** « 1200.00 » (financement) → « 1 200,00 € ». */
export function euros(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const n = Number(value)
  return Number.isNaN(n) ? String(value) : EUR.format(n)
}

/** Saisie en euros (champ numérique) → centimes entiers attendus par l'API ; rien d'autre n'est vérifié ici. */
export function toCentimes(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n * 100) : undefined
}

/** Date du jour au format AAAA-MM-JJ (valeur proposée par défaut dans un formulaire). */
export function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
