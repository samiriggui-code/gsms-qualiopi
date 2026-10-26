/**
 * Regroupements d'affichage de la page « Bilans et rapports » (synthèse et aperçus) : ils rangent ce que l'API a
 * déjà classé (état d'un indicateur, taux mesurés), sans rien recalculer ni décider.
 */
import type { ChartSeries, ChartTone } from '@/components/gsms/chartTheme'
import { stateLabel } from '@/components/gsms/format'
import type { ResultsFormation } from '@/api/gsms/training'

/** États d'un indicateur, du plus préoccupant au plus serein (même ordre que la page Indicateurs). */
export const INDICATOR_STATES: [string, ChartTone][] = [
  ['PREUVES_INSUFFISANTES', 'danger'], ['A_RISQUE', 'warning'], ['NON_EVALUABLE', 'info'], ['NON_EVALUE', 'brand'],
  ['DEMONTRABLE', 'success'], ['NON_APPLICABLE', 'neutral'],
]

export interface CriterionRow { critere: number; critereNom: string; etat: string }

/** Une barre empilée par critère (nom d'usage), une série par état ; lien vers le critère dans la page Indicateurs. */
export function criterionChart(rows: CriterionRow[], label: (n: number, nom: string) => string) {
  const byCrit = new Map<number, { nom: string; counts: Record<string, number> }>()
  for (const r of rows) {
    const g = byCrit.get(r.critere) ?? { nom: r.critereNom, counts: {} }
    g.counts[r.etat] = (g.counts[r.etat] ?? 0) + 1
    byCrit.set(r.critere, g)
  }
  const crits = [...byCrit.entries()].sort(([a], [b]) => a - b)
  const known = INDICATOR_STATES.map(([e]) => e)
  const extra = [...new Set(rows.map((r) => r.etat))].filter((e) => !known.includes(e))
  const states: [string, ChartTone | undefined][] = [...INDICATOR_STATES, ...extra.map((e): [string, undefined] => [e, undefined])]
  const series: ChartSeries[] = states
    .filter(([etat]) => crits.some(([, g]) => g.counts[etat]))
    .map(([etat, tone]) => ({ key: etat, label: stateLabel(etat), tone, values: crits.map(([, g]) => g.counts[etat] ?? 0) }))
  return {
    categories: crits.map(([n, g]) => label(n, g.nom)),
    links: crits.map(([n]) => `/platform/qualite/indicateurs#crit-${n}`),
    series,
  }
}

/** Taux mesurés par formation (réussite, satisfaction, abandon) ; un taux non mesuré reste `null`, jamais 0. */
export function resultsChart(formations: ResultsFormation[], labels: { reussite: string; satisfaction: string; abandon: string }) {
  const measured = formations.filter((f) => f.mesure)
  const series: ChartSeries[] = [
    { key: 'reussite', label: labels.reussite, tone: 'success', values: measured.map((f) => f.mesure!.taux_reussite) },
    { key: 'satisfaction', label: labels.satisfaction, tone: 'brand', values: measured.map((f) => f.mesure!.taux_satisfaction) },
    { key: 'abandon', label: labels.abandon, tone: 'danger', values: measured.map((f) => f.mesure!.taux_abandon) },
  ]
  return { rows: measured, categories: measured.map((f) => f.code || f.title), series }
}

export const pct = (n: number) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(n)} %`
