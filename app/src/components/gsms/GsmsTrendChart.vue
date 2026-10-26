<template>
  <EmptyState v-if="empty" icon="chart-line" compact :title="emptyText || t('gsms.graphiques.vide')" />
  <div v-else class="trend">
    <GsmsChartLegend v-if="series.length > 1" :items="legend" inline />
    <!-- Dessin masqué aux lecteurs d'écran : le tableau ci-dessous donne les mêmes valeurs. -->
    <div class="trend-plot" aria-hidden="true">
      <ApexChart :type="series.length > 1 ? 'line' : 'area'" :height="height" width="100%" :options="options"
        :series="series.map((s) => ({ name: s.label, data: s.values }))" />
    </div>
    <GsmsChartTable :caption="caption" :categories="categories" :series="series" :format="format" />
  </div>
</template>

<script setup lang="ts">
/**
 * Évolution dans le temps : une aire pour une série, des courbes pour plusieurs (un seul axe des valeurs).
 * Les points sont ceux que l'API renvoie (ou des lignes de l'API regroupées par la période qu'elle indique).
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import EmptyState from '@/components/EmptyState.vue'
import GsmsChartLegend, { type LegendItem } from './GsmsChartLegend.vue'
import GsmsChartTable from './GsmsChartTable.vue'
import { ApexChart, allZero, baseOptions, colorOf, fmtNumber, useChartPalette, type ChartSeries } from './chartTheme'

const props = withDefaults(defineProps<{
  caption: string
  categories: string[]
  series: ChartSeries[]
  /** Liens par période (ex. la semaine dans la feuille de route). */
  links?: (string | undefined)[]
  format?: (n: number) => string
  height?: number
  emptyText?: string
}>(), { links: () => [], format: fmtNumber, height: 200 })
const { t } = useI18n()
const router = useRouter()
const palette = useChartPalette()

const empty = computed(() => !props.categories.length || allZero(props.series.flatMap((s) => s.values)))
const colors = computed(() => props.series.map((s, i) => colorOf(palette.value, s.tone ?? (i === 0 ? 'brand' : undefined), i)))
const legend = computed<LegendItem[]>(() => props.series.map((s, i) => ({ key: s.key, label: s.label, color: colors.value[i], tone: s.tone })))

const options = computed(() => {
  const p = palette.value
  const base = baseOptions(p, (i) => { const to = props.links[i]; if (to) void router.push(to) })
  const single = props.series.length === 1
  return {
    ...base,
    chart: { ...base.chart, type: single ? 'area' : 'line' },
    colors: colors.value,
    stroke: { curve: 'straight', width: 2, lineCap: 'round' },
    // Aire en lavis léger (environ 10 %), jamais un aplat saturé.
    fill: single ? { type: 'solid', opacity: 0.12 } : { type: 'solid', opacity: 1 },
    markers: { size: 4, strokeWidth: 2, strokeColors: p.surface, hover: { sizeOffset: 2 } },
    grid: { borderColor: p.grid, strokeDashArray: 0, padding: { left: 14, right: 12 } },
    xaxis: {
      categories: props.categories, axisBorder: { show: false }, axisTicks: { show: false },
      labels: { rotate: 0, hideOverlappingLabels: true, trim: false },
      tooltip: { enabled: false }, crosshairs: { show: true, stroke: { color: p.grid, width: 1, dashArray: 0 } },
    },
    yaxis: { min: 0, forceNiceScale: true, tickAmount: 4, labels: { formatter: (v: number) => props.format(Math.round(v)) } },
    tooltip: { ...base.tooltip, shared: true, intersect: false, y: { formatter: (v: number) => props.format(v) } },
  }
})
</script>

<style scoped lang="less">
.trend { position: relative; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.trend-plot { min-width: 0; }
</style>
