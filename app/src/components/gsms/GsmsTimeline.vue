<template>
  <section class="timeline-panel" :aria-labelledby="headId">
    <header class="tl-head">
      <h3 :id="headId" class="tl-title"><t-icon v-if="icon" :name="icon" size="16px" class="tl-icon" aria-hidden="true" />{{ title }}</h3>
      <span v-if="!loading && !error && items.length" class="tl-count">{{ items.length }}</span>
    </header>
    <p v-if="subtitle" class="tl-sub">{{ subtitle }}</p>
    <div v-if="loading"><t-skeleton v-for="n in 3" :key="n" animation="gradient" :row-col="[{ width: '30%' }, { width: '80%' }]" class="tl-skel" /></div>
    <GsmsRefusal v-else-if="error" :error="error" inline />
    <GsmsEmptyState v-else-if="!items.length" :title="empty" compact />
    <ol v-else class="tl-list">
      <li v-for="item in shown" :key="item.key" class="tl-item" :class="`tone-${item.tone || 'muted'}`">
        <span class="tl-dot" aria-hidden="true"><t-icon v-if="item.icon" :name="item.icon" size="12px" /></span>
        <div class="tl-body">
          <time class="tl-date" :datetime="item.date || undefined">{{ item.dateLabel }}</time>
          <component :is="item.to ? 'router-link' : 'span'" :to="item.to || undefined" class="tl-text" :class="{ 'tl-text--link': !!item.to }">{{ item.title }}</component>
          <span v-if="item.detail" class="tl-detail">{{ item.detail }}</span>
          <slot name="item" :item="item" />
        </div>
      </li>
    </ol>
    <button v-if="!loading && !error && items.length > max" type="button" class="tl-more" :aria-expanded="all" @click="all = !all">
      {{ all ? t('gsms.ficheEnrichie.voirMoins') : t('gsms.commun.voirTout', { n: items.length }) }}
    </button>
  </section>
</template>

<script setup lang="ts">
/**
 * Chronologie d'une fiche : événements datés reçus de l'API (inscription, étapes faites, documents émis,
 * contrats, titres, modifications du journal…), du plus récent au plus ancien. La page fournit les événements et
 * leur ordre ; rien n'est décidé ici. Pastille neutre, rouge pour une alerte, verte pour un état satisfaisant.
 */
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import GsmsRefusal from './GsmsRefusal.vue'
import GsmsEmptyState from './GsmsEmptyState.vue'
import type { Tone } from './types'

export interface TimelineItem {
  key: string
  /** Date ISO renvoyée par l'API (sert à l'attribut `datetime`). */
  date: string | null
  /** Date affichée, déjà mise en forme par la page. */
  dateLabel: string
  title: string
  detail?: string | null
  tone?: Tone
  icon?: string
  to?: string | null
  [extra: string]: unknown
}

const props = withDefaults(defineProps<{
  title: string
  subtitle?: string
  icon?: string
  items: TimelineItem[]
  loading?: boolean
  error?: unknown
  empty: string
  max?: number
}>(), { subtitle: '', icon: 'time', loading: false, error: undefined, max: 8 })
const { t } = useI18n()
const headId = `tl-${useId()}`
const all = ref(false)
const shown = computed(() => (all.value ? props.items : props.items.slice(0, props.max)))
</script>

<style scoped lang="less">
@import (reference) './gsms-list.less';
.timeline-panel { .gsms-panel(); display: flex; flex-direction: column; gap: 8px; }
.tl-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.tl-title { .gsms-panel-title(); margin: 0; display: inline-flex; align-items: center; gap: 8px; }
.tl-icon { color: var(--td-text-color-secondary); }
.tl-count { .gsms-chip(); }
.tl-sub { .gsms-muted(); margin: 0; }
.tl-skel { margin-top: 10px; }
.tl-list { position: relative; list-style: none; margin: 4px 0 0; padding: 0; }
.tl-item {
  position: relative;
  display: flex;
  gap: 12px;
  padding: 0 0 14px;
  // Rail vertical entre les pastilles.
  &::before { content: ''; position: absolute; top: 20px; bottom: 0; left: 9px; width: 1px; background: var(--td-component-stroke); }
  &:last-child { padding-bottom: 0; &::before { display: none; } }
}
.tl-dot {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 19px;
  height: 19px;
  margin-top: 1px;
  border: 1px solid var(--td-component-border);
  border-radius: 50%;
  background: var(--td-bg-color-container);
  color: var(--td-text-color-secondary);
}
.tone-danger .tl-dot { border-color: var(--td-error-color); background: var(--td-error-color-light); color: var(--td-error-color); }
.tone-success .tl-dot { border-color: var(--td-success-color); background: var(--td-success-color-light); color: var(--td-success-color); }
.tone-warning .tl-dot { border-color: var(--td-text-color-secondary); }
.tl-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.tl-date { color: var(--td-text-color-placeholder); font-size: var(--app-text-xs); line-height: 16px; font-variant-numeric: tabular-nums; }
.tl-text { color: var(--td-text-color-primary); font-size: var(--app-text-md); font-weight: 500; line-height: 20px; overflow-wrap: anywhere; text-decoration: none; }
.tl-text--link:hover { color: var(--td-brand-color); text-decoration: underline; }
.tl-text--link:focus-visible { outline: 2px solid var(--td-brand-color); outline-offset: 2px; border-radius: var(--app-radius-xs); }
.tl-detail { color: var(--td-text-color-secondary); font-size: var(--app-text-sm); line-height: 18px; overflow-wrap: anywhere; }
.tl-more { .gsms-link-button(); align-self: flex-start; }
</style>
