<template>
  <ul class="chart-legend" :class="{ 'chart-legend--inline': inline }">
    <li v-for="item in items" :key="item.key">
      <component :is="item.to ? 'router-link' : 'span'" :to="item.to" class="legend-item" :class="{ 'legend-item--link': !!item.to }">
        <t-icon v-if="toneIcon(item.tone)" :name="toneIcon(item.tone)!" size="14px" class="legend-mark" :style="{ color: item.color }" aria-hidden="true" />
        <span v-else class="legend-swatch" :style="{ background: item.color }" aria-hidden="true" />
        <span class="legend-label">{{ item.label }}</span>
        <span v-if="item.value !== undefined" class="legend-value">{{ item.value }}</span>
      </component>
    </li>
  </ul>
</template>

<script setup lang="ts">
/**
 * Légende d'un graphique : repère de couleur (icône pour un état), libellé et valeur en texte. Elle porte toute
 * l'information du graphique pour les lecteurs d'écran et pour qui ne distingue pas les couleurs.
 */
import { toneIcon, type ChartTone } from './chartTheme'

export interface LegendItem {
  key: string
  label: string
  value?: string
  color: string
  tone?: ChartTone
  to?: string
}

withDefaults(defineProps<{ items: LegendItem[]; inline?: boolean }>(), { inline: false })
</script>

<style scoped lang="less">
.chart-legend { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; min-width: 0;
  &--inline { flex-direction: row; flex-wrap: wrap; gap: 4px 14px; } }
.legend-item {
  display: flex; align-items: center; gap: 8px; min-width: 0; padding: 4px 6px; border-radius: var(--app-radius-xs);
  color: var(--td-text-color-secondary); font-size: var(--app-text-sm); line-height: 18px; text-decoration: none;
  &--link:hover { background: var(--td-bg-color-container-hover); color: var(--td-text-color-primary); }
  &:focus-visible { outline: 2px solid var(--td-brand-color); outline-offset: -2px; }
  .chart-legend--inline & { padding: 2px 0; }
}
.legend-swatch { flex-shrink: 0; width: 10px; height: 10px; border-radius: 50%; }
.legend-mark { flex-shrink: 0; }
.legend-label { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.legend-value { flex-shrink: 0; color: var(--td-text-color-primary); font-weight: 600; font-variant-numeric: tabular-nums; }
</style>
