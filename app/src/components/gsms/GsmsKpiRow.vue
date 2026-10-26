<template>
  <div class="kpis" :style="{ '--kpi-cols': Math.min(Math.max(items.length, 1), 5) }">
    <template v-if="loading">
      <div v-for="n in Math.max(items.length, 4)" :key="n" class="kpi is-skeleton"><t-skeleton animation="gradient" :row-col="[{ width: '50%' }, { width: '30%', height: '24px' }]" /></div>
    </template>
    <template v-else>
      <component :is="item.to ? 'router-link' : 'div'" v-for="(item, i) in items" :key="item.key" :to="item.to" class="kpi"
        :class="[`accent-${i % 5}`, item.tone ? `tone-${item.tone}` : '', { 'kpi--link': !!item.to }]">
        <div class="kpi-text">
          <span class="kpi-label">{{ item.label }}</span>
          <span class="kpi-value">{{ item.value }}</span>
          <span v-if="item.subtitle" class="kpi-sub">{{ item.subtitle }}</span>
        </div>
        <span class="kpi-icon"><t-icon :name="item.icon" size="18px" /></span>
      </component>
    </template>
  </div>
</template>

<script setup lang="ts">
/** Rangée de chiffres clés ; chaque chiffre mène à la liste filtrée correspondante. Aucune valeur n'est calculée ici. */
import type { KpiItem } from './types'

withDefaults(defineProps<{ items: KpiItem[]; loading?: boolean }>(), { loading: false })
</script>

<style scoped lang="less">
.kpis {
  display: grid;
  grid-template-columns: repeat(var(--kpi-cols), minmax(0, 1fr));
  gap: 10px;
  @media (max-width: 1100px) { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  @media (max-width: 720px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
.kpi {
  --accent: var(--td-brand-color);
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
  padding: 12px 14px;
  border: 1px solid var(--td-component-stroke);
  border-radius: var(--app-radius-md);
  background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 7%, var(--td-bg-color-container)), var(--td-bg-color-container) 60%);
  color: inherit;
  text-decoration: none;
  transition: border-color var(--app-motion-fast) ease, box-shadow var(--app-motion-fast) ease;
  &.kpi--link:hover { border-color: var(--td-component-border); box-shadow: 0 3px 10px color-mix(in srgb, var(--td-text-color-primary) 5%, transparent); }
  &:focus-visible { outline: 2px solid var(--td-brand-color); outline-offset: 2px; }
}
.accent-0 { --accent: var(--td-brand-color); }
.accent-1 { --accent: var(--td-success-color); }
.accent-2 { --accent: var(--td-warning-color); }
.accent-3 { --accent: #7c3aed; }
.accent-4 { --accent: var(--td-error-color); }
.tone-danger { --accent: var(--td-error-color); }
.tone-warning { --accent: var(--td-warning-color); }
.tone-success { --accent: var(--td-success-color); }
.kpi-text { display: flex; flex-direction: column; min-width: 0; }
.kpi-label { color: var(--td-text-color-secondary); font-size: var(--app-text-xs); font-weight: 600; letter-spacing: 0.02em; text-transform: uppercase; overflow-wrap: anywhere; }
.kpi-value { margin-top: 4px; color: var(--td-text-color-primary); font-size: var(--app-text-4xl); font-weight: 700; line-height: 28px; font-variant-numeric: tabular-nums; }
.kpi-sub { margin-top: 2px; color: var(--td-text-color-placeholder); font-size: var(--app-text-xs); line-height: 16px; overflow-wrap: anywhere; }
.kpi-icon {
  display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
  width: 32px; height: 32px; border-radius: var(--app-radius-sm);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
}
</style>
