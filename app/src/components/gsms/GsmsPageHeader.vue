<template>
  <div class="header">
    <div class="header-title">
      <nav v-if="crumbs.length > 1" class="crumbs" :aria-label="t('gsms.fil.label')">
        <!-- Téléphone : seulement l'étage au-dessus -->
        <router-link v-if="isMobile && parent?.to" :to="parent.to" class="back">
          <t-icon name="chevron-left" size="16px" />{{ parent.label }}
        </router-link>
        <ol v-else>
          <li v-for="(c, i) in crumbs" :key="i">
            <router-link v-if="c.to && i < crumbs.length - 1" :to="c.to" class="crumb-link">{{ c.label }}</router-link>
            <span v-else class="crumb-current" :aria-current="i === crumbs.length - 1 ? 'page' : undefined">{{ c.label }}</span>
            <t-icon v-if="i < crumbs.length - 1" name="chevron-right" size="12px" class="crumb-sep" aria-hidden="true" />
          </li>
        </ol>
      </nav>
      <router-link v-else-if="back" :to="back" class="back">
        <t-icon name="chevron-left" size="16px" />{{ backLabel || t('gsms.commun.retour') }}
      </router-link>
      <div class="title-row">
        <h2>
          <slot name="icon"><span class="title-icon"><t-icon :name="icon" size="20px" /></span></slot>
          <span class="title-text">{{ title }}</span>
          <slot name="title-extra" />
        </h2>
        <div v-if="$slots.actions" class="header-actions"><slot name="actions" /></div>
      </div>
      <p v-if="subtitle" class="header-subtitle">{{ subtitle }}</p>
      <div v-if="$slots.meta" class="header-meta"><slot name="meta" /></div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * En-tête des pages métier : fil d'Ariane, titre, icône, sous-titre, actions — même disposition que l'en-tête des
 * listes WeKnora. Le fil remplace le lien « retour » quand la page est rattachée au menu ; `crumb` est le libellé du
 * dernier niveau d'une fiche (par défaut le titre).
 */
import { computed, toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useGsmsShellStore } from '@/stores/gsmsShell'
import { useGsmsBreadcrumb } from './breadcrumb'

const props = withDefaults(defineProps<{ title: string; icon?: string; subtitle?: string; back?: string; backLabel?: string; crumb?: string }>(),
  { icon: 'app', subtitle: '', back: '', backLabel: '', crumb: '' })
const { t } = useI18n()
const { isMobile } = storeToRefs(useGsmsShellStore())
const crumbs = useGsmsBreadcrumb({
  current: computed(() => props.crumb || props.title), back: toRef(props, 'back'), backLabel: toRef(props, 'backLabel'),
})
const parent = computed(() => crumbs.value[crumbs.value.length - 2])
</script>

<style scoped lang="less">
@import (reference) '@/components/css/resource-card.less';

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  .header-title { display: flex; flex-direction: column; }
  .title-row { display: flex; align-items: center; }
  h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    margin: 0;
    color: var(--td-text-color-primary);
    font-family: var(--app-font-family-display);
    font-size: var(--app-text-4xl);
    font-weight: 600;
    line-height: 32px;
  }
}
.title-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: var(--app-radius-sm);
  background: var(--td-bg-color-secondarycontainer);
  color: var(--td-text-color-secondary);
}
.title-text { min-width: 0; overflow-wrap: anywhere; }
.header-subtitle { margin: 0; font-family: var(--app-font-family); line-height: 20px; }
.header-meta { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.header-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.crumbs {
  margin-bottom: 4px;
  ol { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 0; margin: 0; padding: 0; list-style: none; }
  li { display: inline-flex; align-items: center; min-width: 0; font-size: var(--app-text-sm); line-height: 20px; }
}
.crumb-link {
  color: var(--td-text-color-secondary);
  text-decoration: none;
  &:hover { color: var(--td-brand-color); text-decoration: underline; }
  &:focus-visible { outline: 2px solid var(--td-brand-color); outline-offset: 2px; border-radius: var(--app-radius-xs); }
}
.crumb-current { color: var(--td-text-color-primary); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 360px; }
.crumb-sep { margin: 0 6px; color: var(--td-text-color-placeholder); }
.back {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  align-self: flex-start;
  margin-bottom: 2px;
  color: var(--td-text-color-secondary);
  font-size: var(--app-text-sm);
  text-decoration: none;
  &:hover { color: var(--td-brand-color); }
  &:focus-visible { outline: 2px solid var(--td-brand-color); outline-offset: 2px; border-radius: var(--app-radius-xs); }
}

.resource-list-header();

@media (max-width: 720px) {
  .header h2 { font-size: var(--app-text-2xl); line-height: 28px; }
}
</style>
