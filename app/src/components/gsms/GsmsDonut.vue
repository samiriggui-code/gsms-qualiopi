<template>
  <EmptyState v-if="allZero(data.map((d) => d.value))" icon="chart-ring" compact :title="emptyText || t('gsms.graphiques.vide')" />
  <div v-else class="donut">
    <!-- Dessin masqué aux lecteurs d'écran : la légende donne chaque libellé et chaque valeur en texte. -->
    <div class="donut-plot" aria-hidden="true">
      <ApexChart type="donut" :height="size" :width="size" :options="options" :series="data.map((d) => d.value)" />
      <div v-if="total !== undefined" class="donut-center">
        <span class="donut-total">{{ total }}</span>
        <span v-if="totalLabel" class="donut-total-label">{{ totalLabel }}</span>
      </div>
    </div>
    <GsmsChartLegend class="donut-legend" :items="legend" />
  </div>
</template>

<script setup lang="ts">
/**
 * Anneau (part d'un tout, 6 parts au plus) : valeurs renvoyées par l'API, total fourni par la page (chiffre de
 * l'API, jamais une somme faite ici). Une part se clique comme sa ligne de légende quand elle a un lien.
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import EmptyState from '@/components/EmptyState.vue'
import GsmsChartLegend, { type LegendItem } from './GsmsChartLegend.vue'
import { ApexChart, allZero, baseOptions, fmtNumber, useDatumColors, type ChartDatum } from './chartTheme'

const props = withDefaults(defineProps<{
  data: ChartDatum[]
  /** Chiffre affiché au centre (renvoyé par l'API). */
  total?: string | number
  totalLabel?: string
  format?: (n: number) => string
  emptyText?: string
}>(), { format: fmtNumber })
const { t } = useI18n()
const router = useRouter()
const size = 168
const { palette, colors } = useDatumColors(() => props.data)

const legend = computed<LegendItem[]>(() => props.data.map((d, i) => ({
  key: d.key, label: d.label, value: props.format(d.value), color: colors.value[i], tone: d.tone, to: d.to,
})))

const options = computed(() => {
  const base = baseOptions(palette.value, (i) => { const to = props.data[i]?.to; if (to) void router.push(to) })
  return {
    ...base,
    chart: { ...base.chart, type: 'donut', sparkline: { enabled: true } },
    labels: props.data.map((d) => d.label),
    colors: colors.value,
    // Espace de 2 px couleur du fond entre les parts : elles restent distinctes sans bordure ajoutée.
    stroke: { show: true, width: 2, colors: [palette.value.surface] },
    plotOptions: { pie: { expandOnClick: false, donut: { size: '70%', labels: { show: false } } } },
    tooltip: { ...base.tooltip, y: { formatter: (v: number) => props.format(v) } },
  }
})
</script>

<style scoped lang="less">
.donut { display: flex; align-items: center; flex-wrap: wrap; gap: 12px 20px; min-width: 0; }
.donut-plot { position: relative; flex-shrink: 0; width: 168px; height: 168px; margin: 0 auto; }
.donut-center {
  position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
  pointer-events: none; text-align: center;
}
.donut-total { color: var(--td-text-color-primary); font-size: var(--app-text-4xl); font-weight: 700; line-height: 1.1; }
.donut-total-label { max-width: 96px; color: var(--td-text-color-secondary); font-size: var(--app-text-xs); line-height: 14px; }
.donut-legend { flex: 1 1 180px; }
</style>
