<template>
  <div class="gsms-page">
    <div class="gsms-page-content">
      <GsmsPageHeader :title="title" :icon="icon" :subtitle="subtitle" :back="back" :back-label="backLabel">
        <template v-if="$slots.status" #title-extra><slot name="status" /></template>
        <template v-if="$slots.actions" #actions><slot name="actions" /></template>
      </GsmsPageHeader>
      <div v-if="tabs.length && ready" class="gsms-toolbar">
        <GsmsFilterTabs :options="tabs" :model-value="tab" :label="title" tabs @update:model-value="(v) => emit('update:tab', v)" />
      </div>
      <div class="gsms-page-main">
        <div v-if="loading && !ready" class="panel"><t-skeleton animation="gradient" :row-col="[{ width: '50%' }, { width: '100%' }, { width: '80%' }]" /></div>
        <GsmsRefusal v-else-if="error && !ready" :error="error">
          <t-button size="small" variant="outline" @click="emit('retry')">{{ t('gsms.commun.reessayer') }}</t-button>
        </GsmsRefusal>
        <template v-else-if="ready">
          <slot name="before" />
          <div :class="$slots.side ? 'layout' : ''">
            <aside v-if="$slots.side" class="side"><slot name="side" /></aside>
            <div class="main"><slot /></div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Patron de niveau 3 (fiche) : en-tête avec statut et actions gouvernées, onglets, colonne de sections clé/valeur,
 * panneaux et historique fournis par la page. Rien n'est décidé ici.
 */
import { useI18n } from 'vue-i18n'
import GsmsPageHeader from './GsmsPageHeader.vue'
import GsmsRefusal from './GsmsRefusal.vue'
import GsmsFilterTabs, { type FilterOption } from './GsmsFilterTabs.vue'

withDefaults(defineProps<{
  title: string
  icon?: string
  subtitle?: string
  back?: string
  backLabel?: string
  /** La fiche est chargée (son contenu s'affiche). */
  ready: boolean
  loading?: boolean
  error?: unknown
  tabs?: FilterOption[]
  tab?: string
}>(), { icon: 'app', subtitle: '', back: '', backLabel: '', loading: false, tabs: () => [], tab: '' })
const emit = defineEmits<{ retry: []; 'update:tab': [string] }>()
const { t } = useI18n()
</script>

<style scoped lang="less">
@import (reference) './gsms-list.less';
.gsms-page { .gsms-page-shell(); }
.gsms-page-content { .resource-list-content(); }
.gsms-page-main { .resource-list-main(); }
.gsms-toolbar { .gsms-toolbar(); }
.panel { .gsms-panel(); }
.layout { display: grid; grid-template-columns: minmax(240px, 300px) minmax(0, 1fr); gap: 16px; align-items: start; }
.side, .main { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
@media (max-width: 960px) { .layout { grid-template-columns: minmax(0, 1fr); } }
</style>
