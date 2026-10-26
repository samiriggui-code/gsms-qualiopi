<template>
  <div class="kpis" :style="{ '--kpi-cols': Math.min(Math.max(items.length, 1), 5) }">
    <template v-if="loading">
      <div v-for="n in Math.max(items.length, 4)" :key="n" class="kpi is-skeleton">
        <t-skeleton animation="gradient" :row-col="[{ type: 'rect', width: '40px', height: '40px' }, { width: '50%' }, { width: '30%', height: '24px' }]" />
      </div>
    </template>
    <template v-else>
      <component :is="item.to ? 'router-link' : 'div'" v-for="(item, i) in items" :key="item.key" :to="item.to" class="kpi"
        :class="[`accent-${i % 5}`, item.tone ? `tone-${item.tone}` : '', { 'kpi--link': !!item.to }]">
        <span class="kpi-icon" aria-hidden="true"><t-icon :name="item.icon" size="20px" /></span>
        <div class="kpi-text">
          <span class="kpi-label">{{ item.label }}</span>
          <span class="kpi-value">{{ item.value }}</span>
          <span v-if="item.subtitle" class="kpi-sub">{{ item.subtitle }}</span>
          <!-- Jauge : part et tout renvoyés par l'API ; le texte du sous-titre dit déjà « sur N ». -->
          <span v-if="item.meter && item.meter.max > 0" class="kpi-meter" aria-hidden="true">
            <span class="kpi-meter-fill" :style="{ width: `${Math.min(100, (item.meter.value / item.meter.max) * 100)}%` }" />
          </span>
        </div>
        <t-icon v-if="item.to" name="chevron-right" size="16px" class="kpi-chevron" aria-hidden="true" />
      </component>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * Rangée de chiffres clés en cartes : icône, chiffre, sous-titre et, quand l'API donne une part et son tout, une
 * jauge. Chaque carte mène à la liste filtrée correspondante. Aucune valeur n'est calculée ici.
 */
import type { KpiItem } from './types'

withDefaults(defineProps<{ items: KpiItem[]; loading?: boolean }>(), { loading: false })
</script>

<style scoped lang="less">
.kpis {
  display: grid;
  grid-template-columns: repeat(var(--kpi-cols), minmax(0, 1fr));
  gap: 12px;
  @media (max-width: 1100px) { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  @media (max-width: 720px) { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
}
.kpi {
  --accent: var(--td-brand-color);
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
  padding: 14px 14px 14px 16px;
  overflow: hidden;
  border: 1px solid var(--td-component-stroke);
  border-radius: var(--app-radius-md);
  background: linear-gradient(140deg, color-mix(in srgb, var(--accent) 9%, var(--td-bg-color-container)), var(--td-bg-color-container) 65%);
  color: inherit;
  text-decoration: none;
  transition: border-color var(--app-motion-fast) ease, box-shadow var(--app-motion-fast) ease, transform var(--app-motion-fast) ease;
  // Filet de couleur à gauche : repère du rôle de la carte (le libellé et l'icône le disent aussi).
  &::before { content: ''; position: absolute; inset: 0 auto 0 0; width: 3px; background: var(--accent); }
  &.kpi--link:hover {
    border-color: color-mix(in srgb, var(--accent) 40%, var(--td-component-stroke));
    box-shadow: 0 4px 14px color-mix(in srgb, var(--accent) 12%, transparent);
    .kpi-chevron { color: var(--accent); transform: translateX(2px); }
  }
  &:focus-visible { outline: 2px solid var(--td-brand-color); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { transition: none; }
  @media (max-width: 720px) { flex-direction: column; gap: 8px; padding: 12px 12px 12px 14px; }
}
.accent-0 { --accent: var(--td-brand-color); }
.accent-1 { --accent: var(--td-success-color); }
.accent-2 { --accent: var(--td-warning-color); }
.accent-3 { --accent: var(--td-brand-color-3); }
.accent-4 { --accent: var(--td-error-color); }
.tone-danger { --accent: var(--td-error-color); }
.tone-warning { --accent: var(--td-warning-color); }
.tone-success { --accent: var(--td-success-color); }
.tone-muted { --accent: var(--td-gray-color-6); }
.kpi-icon {
  display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
  width: 40px; height: 40px; border-radius: var(--app-radius-md);
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  color: var(--accent);
  @media (max-width: 720px) { width: 32px; height: 32px; border-radius: var(--app-radius-sm); }
}
.kpi-text { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.kpi-label { color: var(--td-text-color-secondary); font-size: var(--app-text-xs); font-weight: 600; letter-spacing: 0.02em; text-transform: uppercase; overflow-wrap: anywhere; }
.kpi-value { margin-top: 4px; color: var(--td-text-color-primary); font-size: var(--app-text-4xl); font-weight: 700; line-height: 28px; overflow-wrap: anywhere; }
.kpi-sub { margin-top: 2px; color: var(--td-text-color-placeholder); font-size: var(--app-text-xs); line-height: 16px; overflow-wrap: anywhere; }
.kpi-meter { display: block; height: 6px; margin-top: 8px; border-radius: 3px; background: color-mix(in srgb, var(--accent) 16%, transparent); overflow: hidden; }
.kpi-meter-fill { display: block; height: 100%; border-radius: 3px; background: var(--accent); }
.kpi-chevron { position: absolute; top: 12px; right: 10px; color: var(--td-text-color-placeholder); transition: transform var(--app-motion-fast) ease, color var(--app-motion-fast) ease;
  @media (max-width: 720px) { top: 10px; } }
</style>
