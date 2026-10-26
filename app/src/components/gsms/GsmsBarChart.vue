<template>
  <EmptyState v-if="empty" icon="chart-bar" compact :title="emptyText || t('gsms.graphiques.vide')" />
  <div v-else class="bars">
    <GsmsChartLegend v-if="stackSeries.length > 1" :items="legend" inline />
    <!-- Dessin masqué aux lecteurs d'écran : le tableau ci-dessous donne les mêmes valeurs. -->
    <div class="bars-plot" aria-hidden="true">
      <ApexChart type="bar" :height="height" width="100%" :options="options" :series="apexSeries" />
    </div>
    <GsmsChartTable :caption="caption" :categories="categoryLabels" :series="tableSeries" :format="format" />
  </div>
</template>

<script setup lang="ts">
/**
 * Barres d'un graphique : soit une série (`data`, une barre par catégorie, couleur par rôle et valeur au bout),
 * soit plusieurs séries empilées (`categories` + `series`, ex. étapes du parcours par état). Valeurs de l'API.
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import EmptyState from '@/components/EmptyState.vue'
import GsmsChartLegend, { type LegendItem } from './GsmsChartLegend.vue'
import GsmsChartTable from './GsmsChartTable.vue'
import { ApexChart, allZero, baseOptions, colorOf, fmtNumber, useChartPalette, type ChartDatum, type ChartSeries } from './chartTheme'

const props = withDefaults(defineProps<{
  /** Accessible : intitulé du tableau de valeurs lu par les lecteurs d'écran. */
  caption: string
  data?: ChartDatum[]
  categories?: string[]
  series?: ChartSeries[]
  /** Liens par catégorie (barres empilées). */
  links?: (string | undefined)[]
  horizontal?: boolean
  format?: (n: number) => string
  /** Borne de l'axe des valeurs (ex. 100 pour des pourcentages). */
  max?: number
  emptyText?: string
}>(), { data: () => [], categories: () => [], series: () => [], links: () => [], horizontal: false, format: fmtNumber })
const { t } = useI18n()
const router = useRouter()
const palette = useChartPalette()

const single = computed(() => props.data.length > 0)
const categoryLabels = computed(() => (single.value ? props.data.map((d) => d.label) : props.categories))
const stackSeries = computed(() => (single.value ? [] : props.series))
const empty = computed(() => (single.value
  ? allZero(props.data.map((d) => d.value))
  : allZero(props.series.flatMap((s) => s.values))))

const seriesColors = computed(() => props.series.map((s, i) => colorOf(palette.value, s.tone, i)))
const dataColors = computed(() => props.data.map((d, i) => colorOf(palette.value, d.tone, i)))
const legend = computed<LegendItem[]>(() => props.series.map((s, i) => ({ key: s.key, label: s.label, color: seriesColors.value[i], tone: s.tone })))
const tableSeries = computed(() => (single.value
  ? [{ key: 'v', label: t('gsms.graphiques.valeur'), values: props.data.map((d) => d.value) }]
  : props.series))

const apexSeries = computed(() => (single.value
  ? [{ name: props.caption, data: props.data.map((d) => d.value) }]
  : props.series.map((s) => ({ name: s.label, data: s.values }))))

// Hauteur : une rangée de 34 px par catégorie en horizontal (texte lisible à 390 px), 220 px en colonnes.
const height = computed(() => (props.horizontal ? Math.max(120, categoryLabels.value.length * 34 + 36) : 220))

/** Borne ronde juste au-dessus de la plus haute pile, découpée en 4 graduations rondes (ex. 22 → 24). */
function niceCeil(n: number): number {
  if (n <= 4) return 4
  const step = 10 ** Math.floor(Math.log10(n / 4))
  // Graduations entières seulement (des comptes) : 2,5 serait affiché « 3 ».
  const interval = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * step)
    .filter((v) => Number.isInteger(v)).find((v) => v * 4 >= n) ?? 10 * step
  return interval * 4
}

const options = computed(() => {
  const p = palette.value
  const base = baseOptions(p, (i) => {
    const to = single.value ? props.data[i]?.to : props.links[i]
    if (to) void router.push(to)
  })
  // En empilé, la borne suit la plus haute pile (mise à l'échelle du dessin seulement).
  const top = props.max ?? (single.value
    ? Math.max(0, ...props.data.map((d) => d.value))
    : Math.max(0, ...categoryLabels.value.map((_, i) => props.series.reduce((n, s) => n + (s.values[i] ?? 0), 0))))
  // Une seule série : marge au bout de l'axe pour écrire la valeur après la plus longue barre (ApexCharts ramène
  // sinon l'étiquette dans la barre) ; plus l'étiquette est longue, plus la marge est grande.
  const longest = single.value ? Math.max(...props.data.map((d) => props.format(d.value).length), 1) : 0
  const max = single.value ? Math.max(1, top) * (1.15 + Math.min(longest, 12) * 0.035) : niceCeil(top)
  // Chaque barre porte sa valeur (une seule série) : l'échelle des valeurs serait redondante, elle est masquée.
  const labelled = single.value
  const valueAxis = { min: 0, max, tickAmount: 4, forceNiceScale: false,
    labels: { show: !labelled, formatter: (v: number) => props.format(Math.round(v)) } }
  const categoryAxis = { categories: categoryLabels.value, axisBorder: { show: false }, axisTicks: { show: false } }
  return {
    ...base,
    chart: { ...base.chart, type: 'bar', stacked: !single.value },
    colors: single.value ? dataColors.value : seriesColors.value,
    plotOptions: {
      bar: {
        horizontal: props.horizontal,
        distributed: single.value,
        borderRadius: 4,
        borderRadiusApplication: 'end',
        borderRadiusWhenStacked: 'last',
        barHeight: '56%',
        columnWidth: '46%',
        dataLabels: { position: 'top' },
      },
    },
    // Valeur au bout de la barre (une seule série) ; en empilé, la légende et le tableau portent les valeurs.
    dataLabels: single.value
      ? { enabled: true, formatter: (v: number) => props.format(v), textAnchor: props.horizontal ? 'start' : 'middle',
          offsetX: props.horizontal ? 12 : 0, offsetY: props.horizontal ? 0 : -18,
          style: { colors: [p.text], fontSize: '12px', fontWeight: 600 }, background: { enabled: false } }
      : { enabled: false },
    stroke: { show: true, width: 2, colors: [p.surface] },
    grid: { borderColor: p.grid, strokeDashArray: 0, padding: { right: 8, left: 12 },
      xaxis: { lines: { show: props.horizontal && !labelled } }, yaxis: { lines: { show: !props.horizontal && !labelled } } },
    xaxis: props.horizontal ? { ...categoryAxis, ...valueAxis } : { ...categoryAxis, labels: { trim: true, hideOverlappingLabels: false } },
    // En horizontal, ApexCharts lit la borne des valeurs sur l'axe y.
    yaxis: props.horizontal ? { min: 0, max, labels: { maxWidth: 180, style: { colors: [p.muted] } } } : valueAxis,
    tooltip: { ...base.tooltip, y: { formatter: (v: number) => props.format(v) } },
  }
})
</script>

<style scoped lang="less">
.bars { position: relative; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.bars-plot { min-width: 0; }
</style>
