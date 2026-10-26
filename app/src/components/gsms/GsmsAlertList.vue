<template>
  <section class="panel">
    <header class="panel-head">
      <h3><t-icon :name="icon" size="16px" class="head-icon" />{{ title }}</h3>
      <span v-if="!loading" class="count">{{ items.length }}</span>
    </header>
    <p v-if="subtitle" class="sub">{{ subtitle }}</p>
    <div v-if="loading"><t-skeleton v-for="n in 3" :key="n" animation="gradient" :row-col="[{ width: '70%' }, { width: '40%' }]" class="skel" /></div>
    <GsmsRefusal v-else-if="error" :error="error" inline />
    <p v-else-if="!items.length" class="empty"><t-icon name="check-circle" size="16px" />{{ empty }}</p>
    <ul v-else class="alerts">
      <li v-for="a in items.slice(0, max)" :key="a.id">
        <component :is="a.to ? 'router-link' : 'div'" :to="a.to || undefined" class="alert" :class="{ 'alert--link': !!a.to }">
          <span class="dot" :class="`tone-${a.tone || 'muted'}`" aria-hidden="true" />
          <span class="alert-body">
            <span class="alert-title">{{ a.title }}</span>
            <span v-if="a.subtitle" class="alert-sub">{{ a.subtitle }}</span>
          </span>
          <span class="alert-meta">
            <span v-if="a.when" class="alert-when" :class="`tone-${a.tone || 'muted'}`">{{ a.when }}</span>
            <span v-if="a.kind" class="alert-kind">{{ a.kind }}</span>
          </span>
        </component>
      </li>
    </ul>
    <router-link v-if="moreTo && items.length > max" :to="moreTo" class="more">{{ t('gsms.commun.voirTout', { n: items.length }) }}</router-link>
  </section>
</template>

<script setup lang="ts">
/** Points à traiter (échéances, retards) avec leur source et un lien vers l'endroit où on les traite. */
import { useI18n } from 'vue-i18n'
import GsmsRefusal from './GsmsRefusal.vue'
import type { AlertItem } from './types'

withDefaults(defineProps<{
  title: string
  subtitle?: string
  icon?: string
  items: AlertItem[]
  loading?: boolean
  error?: unknown
  empty: string
  max?: number
  moreTo?: string
}>(), { subtitle: '', icon: 'error-circle', loading: false, max: 6, moreTo: '' })
const { t } = useI18n()
</script>

<style scoped lang="less">
@import (reference) './gsms-list.less';
.panel { .gsms-panel(); display: flex; flex-direction: column; }
.panel-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; h3 { .gsms-panel-title(); margin: 0; display: flex; align-items: center; gap: 6px; } }
.head-icon { color: var(--td-error-color); }
.count { .gsms-chip(); }
.sub { .gsms-muted(); margin: 4px 0 8px; }
.skel { margin-top: 10px; }
.empty { display: flex; align-items: center; gap: 6px; margin: 8px 0 0; color: var(--td-text-color-secondary); font-size: var(--app-text-sm); .t-icon { color: var(--td-success-color); } }
.alerts { list-style: none; margin: 4px 0 0; padding: 0; li + li { border-top: 1px dashed var(--td-component-stroke); } }
.alert { display: flex; align-items: flex-start; gap: 10px; padding: 8px 4px; color: inherit; text-decoration: none; border-radius: var(--app-radius-xs);
  &.alert--link:hover { background: var(--td-bg-color-container-hover); }
  &:focus-visible { outline: 2px solid var(--td-brand-color); outline-offset: -2px; } }
.dot { width: 8px; height: 8px; margin-top: 6px; border-radius: 50%; flex-shrink: 0; background: var(--td-text-color-disabled); }
.dot.tone-danger { background: var(--td-error-color); }
.dot.tone-warning { background: var(--td-warning-color); }
.dot.tone-success { background: var(--td-success-color); }
.alert-body { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.alert-title { color: var(--td-text-color-primary); font-size: var(--app-text-md); font-weight: 500; line-height: 20px; overflow-wrap: anywhere; }
.alert-sub { color: var(--td-text-color-secondary); font-size: var(--app-text-sm); line-height: 18px; overflow-wrap: anywhere; }
.alert-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; flex-shrink: 0; max-width: 40%; text-align: right; }
.alert-when { font-size: var(--app-text-sm); font-weight: 500; font-variant-numeric: tabular-nums; }
.alert-when.tone-danger { color: var(--td-error-color); }
.alert-when.tone-warning { color: var(--td-warning-color); }
.alert-kind { .gsms-chip(); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.more { margin-top: 8px; color: var(--td-brand-color); font-size: var(--app-text-sm); text-decoration: none; &:hover { text-decoration: underline; } }
</style>
