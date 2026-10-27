/**
 * Graphiques GSMS : données, couleurs et chargement différé de la bibliothèque.
 *
 * Les graphiques n'affichent que des chiffres renvoyés par l'API (compteurs, synthèses) ; le front peut seulement
 * regrouper pour l'affichage des lignes que l'API a déjà classées (par état, par semaine…). Aucune règle métier ici.
 *
 * Couleurs sobres : rouge pour une série d'alerte (retard, échec), vert pour une série satisfaisante (à jour, fait),
 * sinon couleur de marque et gris, tous lus dans les jetons du thème. Le mode suit l'attribut `theme-mode` de <html>.
 */
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import { stateTheme } from './format'

/** Bibliothèque chargée à la première carte affichée (morceau séparé, hors du chargement initial). */
export const ApexChart = defineAsyncComponent(() => import('vue3-apexcharts'))

/**
 * Rôle d'une couleur : un état (succès, vigilance, erreur), la marque, une information, ou neutre (sans objet).
 * Sans rôle, une donnée prend la couleur catégorielle de son rang (ordre fixe fourni par la page).
 */
export type ChartTone = 'success' | 'warning' | 'danger' | 'brand' | 'info' | 'neutral'

export interface ChartDatum {
  key: string
  label: string
  /** Valeur renvoyée par l'API (jamais calculée par le front). */
  value: number
  tone?: ChartTone
  /** Lien vers la liste filtrée correspondante. */
  to?: string
}

/** Une série d'un graphique en barres empilées ou d'une courbe : une valeur par catégorie. */
export interface ChartSeries {
  key: string
  label: string
  /** Une valeur par catégorie ; `null` = non mesuré par l'API (aucune barre, « — » dans le tableau, jamais 0). */
  values: (number | null)[]
  tone?: ChartTone
}

type Mode = 'light' | 'dark'

/**
 * Palette catégorielle (6 rangs, ordre fixe) : couleur de marque et gris seulement, lus sur la page pour suivre
 * `general.brand_color`. Le rouge et le vert restent réservés aux séries qui signifient un état (retard / à jour) ;
 * la légende et le tableau donnent toujours le libellé, la nuance n'est jamais le seul repère.
 */
const CATEGORICAL: Record<Mode, [string, string][]> = {
  light: [['--td-brand-color-4', '#5a2be0'], ['--td-gray-color-12', '#2c2c2c'], ['--td-brand-color-2', '#a58cf2'],
    ['--td-gray-color-8', '#777777'], ['--td-brand-color-6', '#371a94'], ['--td-gray-color-6', '#a6a6a6']],
  dark: [['--td-brand-color-7', '#7a55f0'], ['--td-gray-color-3', '#e7e7e7'], ['--td-brand-color-9', '#b9a6f3'],
    ['--td-gray-color-7', '#8b8b8b'], ['--td-brand-color-5', '#5a2be0'], ['--td-gray-color-5', '#c5c5c5']],
}

/**
 * Rôles → jetons du thème (lus sur <html>) ; valeur de secours si le jeton manque. Seuls `success` (vert) et `danger`
 * (rouge) sont colorés ; `warning` (état intermédiaire) est un gris foncé (jetons warning neutralisés dans theme.css),
 * `info` une nuance claire de la marque, `neutral` un gris clair.
 */
const TONE_TOKENS: Record<Mode, Record<ChartTone, [string, string]>> = {
  light: {
    success: ['--td-success-color-5', '#00a870'], warning: ['--td-gray-color-10', '#4b4b4b'], danger: ['--td-error-color-8', '#b11f26'],
    brand: ['--td-brand-color-4', '#5a2be0'], info: ['--td-brand-color-2', '#a58cf2'], neutral: ['--td-gray-color-6', '#a6a6a6'],
  },
  dark: {
    success: ['--td-success-color-7', '#46bf96'], warning: ['--td-gray-color-4', '#dcdcdc'], danger: ['--td-error-color-7', '#de6670'],
    brand: ['--td-brand-color-7', '#7a55f0'], info: ['--td-brand-color-9', '#b9a6f3'], neutral: ['--td-gray-color-7', '#8b8b8b'],
  },
}

export interface ChartPalette {
  mode: Mode
  tones: Record<ChartTone, string>
  categorical: string[]
  surface: string
  text: string
  muted: string
  grid: string
  font: string
}

function currentMode(): Mode {
  return document.documentElement.getAttribute('theme-mode') === 'dark' ? 'dark' : 'light'
}

function readPalette(): ChartPalette {
  const mode = currentMode()
  const css = getComputedStyle(document.documentElement)
  const token = (name: string, fallback: string) => (name && css.getPropertyValue(name).trim()) || fallback
  const tones = Object.fromEntries(
    (Object.entries(TONE_TOKENS[mode]) as [ChartTone, [string, string]][]).map(([tone, [name, fallback]]) => [tone, token(name, fallback)]),
  ) as Record<ChartTone, string>
  return {
    mode,
    tones,
    categorical: CATEGORICAL[mode].map(([name, fallback]) => token(name, fallback)),
    surface: token('--td-bg-color-container', mode === 'dark' ? '#242424' : '#ffffff'),
    text: token('--td-text-color-primary', mode === 'dark' ? '#ffffff' : 'rgba(0, 0, 0, 0.9)'),
    muted: token('--td-text-color-secondary', mode === 'dark' ? 'rgba(255, 255, 255, 0.55)' : 'rgba(0, 0, 0, 0.6)'),
    grid: token('--td-component-stroke', mode === 'dark' ? '#383838' : '#e7e7e7'),
    font: token('--app-font-family', 'sans-serif'),
  }
}

/** Palette du thème courant, relue quand l'attribut `theme-mode` change (bascule clair / sombre). */
export function useChartPalette(): Ref<ChartPalette> {
  const palette = ref(readPalette()) as Ref<ChartPalette>
  let observer: MutationObserver | null = null
  onMounted(() => {
    palette.value = readPalette()
    observer = new MutationObserver(() => { palette.value = readPalette() })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['theme-mode', 'class', 'style'] })
  })
  onBeforeUnmount(() => observer?.disconnect())
  return palette
}

/** Couleur d'une donnée : son rôle s'il en a un, sinon la teinte catégorielle de son rang. */
export function colorOf(palette: ChartPalette, tone: ChartTone | undefined, index: number): string {
  if (tone) return palette.tones[tone]
  return palette.categorical[index % palette.categorical.length]
}

/**
 * Rôles de couleur des états renvoyés par l'API, d'après la couleur d'affichage des statuts (`stateTheme`) :
 * succès, vigilance, erreur ; le premier état « en cours » prend la marque, le suivant le bleu d'information, les
 * autres le neutre. Présentation seulement.
 */
export function tonesForStates(codes: string[]): ChartTone[] {
  let primaries = 0
  return codes.map((code) => {
    const theme = stateTheme(code)
    if (theme === 'success') return 'success'
    if (theme === 'warning') return 'warning'
    if (theme === 'danger') return 'danger'
    if (theme === 'primary') return primaries++ === 0 ? 'brand' : 'info'
    return 'neutral'
  })
}

/** Icône accompagnant un rôle d'état dans une légende (la couleur n'est jamais le seul repère). */
export function toneIcon(tone: ChartTone | undefined): string | null {
  if (tone === 'success') return 'check-circle-filled'
  if (tone === 'warning') return 'time-filled'
  if (tone === 'danger') return 'error-circle-filled'
  if (tone === 'neutral') return 'minus-circle-filled'
  return null
}

/** Nombre au format français (espace fine des milliers). */
export const fmtNumber = (n: number) => new Intl.NumberFormat('fr-FR').format(n)

/** Options communes à tous les graphiques (thème, police, sans barre d'outils, animations sobres). */
export function baseOptions(palette: ChartPalette, onSelect?: (index: number) => void) {
  return {
    chart: {
      fontFamily: palette.font,
      foreColor: palette.muted,
      background: 'transparent',
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: { enabled: true, speed: 350, animateGradually: { enabled: false } },
      parentHeightOffset: 0,
      redrawOnParentResize: true,
      events: onSelect
        ? { dataPointSelection: (_e: unknown, _c: unknown, cfg: { dataPointIndex: number }) => onSelect(cfg.dataPointIndex) }
        : {},
    },
    theme: { mode: palette.mode },
    legend: { show: false },
    dataLabels: { enabled: false },
    tooltip: { theme: palette.mode, fillSeriesColor: false, style: { fontFamily: palette.font } },
    states: { active: { filter: { type: 'none' } } },
  }
}

/** Vrai quand aucune valeur n'est strictement positive (rien à dessiner). */
export const allZero = (values: (number | null)[]) => !values.some((v) => v != null && v > 0)

/** Calcul d'affichage seulement : la palette réactive et une couleur par donnée. */
export function useDatumColors(data: Ref<ChartDatum[]> | (() => ChartDatum[])) {
  const palette = useChartPalette()
  const read = typeof data === 'function' ? data : () => data.value
  const colors = computed(() => read().map((d, i) => colorOf(palette.value, d.tone, i)))
  return { palette, colors }
}

/**
 * Compteurs par code renvoyés par l'API → données d'un graphique, dans un ordre fixe (la couleur suit l'état,
 * jamais son rang) ; les codes inconnus de `order` suivent, dans l'ordre de l'API. `tones` impose un rôle à
 * tous les codes (une couleur unique) ou à certains d'entre eux ; sinon le rôle vient de la couleur de l'état.
 */
export function fromCounts(
  counts: Record<string, number>,
  order: string[],
  label: (code: string) => string,
  link?: (code: string) => string | undefined,
  tones?: ChartTone | Partial<Record<string, ChartTone>>,
): ChartDatum[] {
  const codes = [...order.filter((c) => c in counts), ...Object.keys(counts).filter((c) => !order.includes(c))]
  const stateTones = tonesForStates(codes)
  const toneOf = (code: string, i: number) => (typeof tones === 'string' ? tones : tones?.[code] ?? stateTones[i])
  return codes.map((code, i) => ({ key: code, label: label(code), value: counts[code], tone: toneOf(code, i), to: link?.(code) }))
}

/**
 * Regroupement d'affichage : nombre de lignes de l'API par valeur d'un champ qu'elle a déjà renseigné (état,
 * semaine…). Ne décide rien : il compte ce que l'API a classé.
 */
export function countBy<T>(rows: readonly T[], key: (row: T) => string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const row of rows) {
    const k = key(row)
    out[k] = (out[k] ?? 0) + 1
  }
  return out
}
