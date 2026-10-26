<template>
  <table class="sr-only">
    <caption>{{ caption }}</caption>
    <thead>
      <tr><th scope="col">{{ corner }}</th><th v-for="s in series" :key="s.key" scope="col">{{ s.label }}</th></tr>
    </thead>
    <tbody>
      <tr v-for="(c, i) in categories" :key="c">
        <th scope="row">{{ c }}</th>
        <td v-for="s in series" :key="s.key">{{ format(s.values[i] ?? 0) }}</td>
      </tr>
    </tbody>
  </table>
</template>

<script setup lang="ts">
/** Tableau des valeurs d'un graphique, lu par les lecteurs d'écran (le dessin lui-même est masqué pour eux). */
import { fmtNumber, type ChartSeries } from './chartTheme'

withDefaults(defineProps<{
  caption: string
  corner?: string
  categories: string[]
  series: Pick<ChartSeries, 'key' | 'label' | 'values'>[]
  format?: (n: number) => string
}>(), { corner: '', format: fmtNumber })
</script>

<style scoped>
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden;
  clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}
</style>
