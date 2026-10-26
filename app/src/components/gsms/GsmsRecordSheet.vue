<template>
  <div class="gsms-page">
    <div class="gsms-page-content">
      <GsmsPageHeader :title="title" :icon="icon" :subtitle="subtitle" :back="back" :back-label="backLabel" class="sheet-header">
        <template v-if="avatarName || imageSrc" #icon>
          <span v-if="imageSrc" class="sheet-thumb" aria-hidden="true"><img :src="imageSrc" alt="" /></span>
          <GsmsPersonAvatar v-else :name="avatarName" :photo="avatarPhoto" :size="40" />
        </template>
        <template v-if="$slots.status" #title-extra><slot name="status" /></template>
        <template v-if="$slots.actions" #actions><slot name="actions" /></template>
        <template v-if="meta.length" #meta>
          <span v-for="(m, i) in meta" :key="i" class="sheet-chip" :title="m.title || undefined">
            <t-icon v-if="m.icon" :name="m.icon" size="14px" aria-hidden="true" />{{ m.label }}
          </span>
        </template>
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
          <div :class="$slots.side ? 'layout' : 'single'">
            <aside v-if="$slots.side" class="side" :aria-label="t('gsms.fiche.resume')"><slot name="side" /></aside>
            <div class="main"><slot /></div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Patron de niveau 3 (fiche) : en-tête (avatar, vignette ou icône, statut, métadonnées en puces, actions gouvernées),
 * onglets avec compteurs, sections en cartes, panneau de résumé (à droite et fixe sur grand écran, en tête sur
 * téléphone). Tout le contenu vient de la page, qui l'a reçu de l'API ; rien n'est décidé ici.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { mediaSrc } from './media'
import GsmsPageHeader from './GsmsPageHeader.vue'
import GsmsRefusal from './GsmsRefusal.vue'
import GsmsPersonAvatar from './GsmsPersonAvatar.vue'
import GsmsFilterTabs, { type FilterOption } from './GsmsFilterTabs.vue'

export interface SheetMeta {
  label: string
  icon?: string
  title?: string
}

const props = withDefaults(defineProps<{
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
  /** Fiche d'une personne : avatar (photo enregistrée, chemin de l'API, sinon initiales) à la place de l'icône. */
  avatarName?: string | null
  avatarPhoto?: string | null
  /** Vignette (formation), chemin de la médiathèque rendu par l'API, à la place de l'icône. */
  image?: string | null
  meta?: SheetMeta[]
}>(), { icon: 'app', subtitle: '', back: '', backLabel: '', loading: false, tabs: () => [], tab: '', avatarName: null,
  avatarPhoto: null, image: null, meta: () => [] })
const imageSrc = computed(() => mediaSrc(props.image))
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
.sheet-thumb {
  display: inline-flex;
  flex-shrink: 0;
  width: 56px;
  height: 40px;
  overflow: hidden;
  border-radius: var(--app-radius-sm);
  border: 1px solid var(--td-component-stroke);
  background: var(--td-bg-color-secondarycontainer);
  img { width: 100%; height: 100%; object-fit: cover; }
}
.sheet-chip { .gsms-chip(); gap: 4px; height: 22px; padding: 0 8px; border-radius: var(--app-radius-pill); font-weight: 400; }
.single, .side, .main { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; }
@media (min-width: 961px) and (max-width: 1279px) {
  .layout { grid-template-columns: minmax(240px, 300px) minmax(0, 1fr); }
}
// Grand écran : résumé à droite, qui reste visible pendant le défilement de la fiche.
@media (min-width: 1280px) {
  .layout { grid-template-columns: minmax(0, 1fr) minmax(280px, 340px); }
  .side { order: 2; position: sticky; top: 0; max-height: calc(100dvh - 140px); overflow-y: auto; }
}
</style>
