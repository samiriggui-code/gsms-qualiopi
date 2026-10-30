<template>
  <section class="chart-card" :aria-labelledby="titleId">
    <header class="chart-head">
      <span v-if="icon" class="chart-icon"><t-icon :name="icon" size="16px" /></span>
      <div class="chart-titles">
        <h3 :id="titleId">{{ title }}</h3>
        <p v-if="subtitle" class="chart-sub">{{ subtitle }}</p>
      </div>
      <router-link v-if="moreTo" :to="moreTo" class="chart-more">{{ t('gsms.graphiques.voir') }}<t-icon name="chevron-right" size="14px" /></router-link>
    </header>
    <div v-if="loading" class="chart-skeleton"><t-skeleton animation="gradient" :row-col="[{ width: '100%', height: '160px' }]" /></div>
    <!-- Refus de l'API : affiché tel quel, jamais un graphique à zéro à sa place -->
    <GsmsRefusal v-else-if="error" :error="error" inline />
    <EmptyState v-else-if="empty" icon="chart-pie" compact :title="emptyText || t('gsms.graphiques.vide')" />
    <div v-else class="chart-body"><slot /></div>
    <p v-if="$slots.note && !loading && !error" class="chart-note"><slot name="note" /></p>
  </section>
</template>

<script setup lang="ts">
/** Carte d'un graphique : titre, sous-titre, chargement, refus (GsmsRefusal) ou état vide, puis le graphique. */
import { useId } from 'vue'
import { useI18n } from 'vue-i18n'
import EmptyState from '@/components/EmptyState.vue'
import GsmsRefusal from './GsmsRefusal.vue'

withDefaults(defineProps<{
  title: string
  subtitle?: string
  icon?: string
  loading?: boolean
  error?: unknown
  /** Rien à montrer (l'API n'a renvoyé aucune valeur). */
  empty?: boolean
  emptyText?: string
  /** Lien vers la liste correspondante. */
  moreTo?: string
}>(), { loading: false, error: undefined, empty: false })
const { t } = useI18n()
const titleId = `chart-${useId()}`
</script>

<style scoped lang="less">
@import (reference) './gsms-list.less';
.chart-card { .gsms-panel(); display: flex; flex-direction: column; gap: 10px; }
.chart-head { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
.chart-icon {
  display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
  width: 28px; height: 28px; border-radius: var(--app-radius-sm);
  background: var(--td-bg-color-secondarycontainer); color: var(--td-text-color-secondary);
}
.chart-titles { flex: 1; min-width: 0; h3 { .gsms-panel-title(); margin: 0; overflow-wrap: anywhere; } }
.chart-sub { .gsms-muted(); margin: 2px 0 0; overflow-wrap: anywhere; }
.chart-more {
  display: inline-flex; align-items: center; gap: 2px; flex-shrink: 0; padding: 2px 4px; border-radius: var(--app-radius-xs);
  color: var(--td-brand-color); font-size: var(--app-text-sm); text-decoration: none;
  &:hover { background: var(--td-bg-color-container-hover); }
  &:focus-visible { outline: 2px solid var(--td-brand-color); outline-offset: 2px; }
}
.chart-body { min-width: 0; }
.chart-note { .gsms-muted(); margin: 0; font-size: var(--app-text-xs); line-height: 16px; }
</style>
