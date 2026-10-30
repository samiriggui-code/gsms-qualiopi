<template>
  <router-link :to="item.to" class="module">
    <div class="module-head">
      <span class="module-icon"><t-icon :name="item.icon" size="20px" /></span>
      <h3>{{ item.title }}</h3>
      <t-icon name="chevron-right" class="chevron" />
    </div>
    <p v-if="item.description" class="module-desc">{{ item.description }}</p>
    <GsmsRefusal v-if="item.error" :error="item.error" inline />
    <dl v-else-if="item.figures.length" class="figures">
      <div v-for="f in item.figures" :key="f.label" class="figure">
        <dt>{{ f.label }}</dt>
        <dd><t-skeleton v-if="item.loading" animation="gradient" :row-col="[{ width: '40px', height: '20px' }]" /><template v-else>{{ f.value }}</template></dd>
      </div>
    </dl>
  </router-link>
</template>

<script setup lang="ts">
/** Carte d'un module d'une rubrique : icône, rôle, chiffres fournis par la page (tirés de l'API), lien d'ouverture. */
import GsmsRefusal from './GsmsRefusal.vue'
import type { ModuleItem } from './types'

// `accent` (rang de la carte) est accepté pour compatibilité mais ne colore plus rien : cartes neutres.
withDefaults(defineProps<{ item: ModuleItem; accent?: number }>(), { accent: 0 })
</script>

<style scoped lang="less">
@import (reference) './gsms-list.less';
.module {
  .gsms-panel();
  display: flex;
  flex-direction: column;
  gap: 10px;
  color: inherit;
  text-decoration: none;
  transition: border-color var(--app-motion-fast) ease, box-shadow var(--app-motion-fast) ease;
  &:hover { border-color: var(--td-component-border); box-shadow: 0 3px 10px color-mix(in srgb, var(--td-text-color-primary) 5%, transparent); }
  &:focus-visible { outline: 2px solid var(--td-brand-color); outline-offset: 2px; }
}
.module-head { display: flex; align-items: center; gap: 10px; h3 { flex: 1; min-width: 0; margin: 0; font-size: var(--app-text-lg); font-weight: 600; color: var(--td-text-color-primary); } }
.module-icon { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 36px; height: 36px; border-radius: var(--app-radius-sm);
  background: var(--td-bg-color-secondarycontainer); color: var(--td-text-color-secondary); border: 1px solid var(--td-component-stroke); }
.chevron { color: var(--td-text-color-placeholder); }
.module-desc { .gsms-muted(); margin: 0; }
.figures { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 0; }
.figure { min-width: 0; padding: 6px 10px; border: 1px dashed var(--td-component-stroke); border-radius: var(--app-radius-sm);
  dt { color: var(--td-text-color-placeholder); font-size: var(--app-text-xs); text-transform: uppercase; letter-spacing: 0.02em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  dd { margin: 2px 0 0; color: var(--td-text-color-primary); font-size: var(--app-text-lg); font-weight: 600; font-variant-numeric: tabular-nums; } }
</style>
