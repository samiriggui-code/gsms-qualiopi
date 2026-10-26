<template>
  <div class="header">
    <div class="header-title">
      <router-link v-if="back" :to="back" class="back">
        <t-icon name="chevron-left" size="16px" />{{ backLabel || t('gsms.commun.retour') }}
      </router-link>
      <div class="title-row">
        <h2>
          <span class="title-icon"><t-icon :name="icon" size="20px" /></span>
          <span class="title-text">{{ title }}</span>
          <slot name="title-extra" />
        </h2>
        <div v-if="$slots.actions" class="header-actions"><slot name="actions" /></div>
      </div>
      <p v-if="subtitle" class="header-subtitle">{{ subtitle }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
/** En-tête des pages métier : titre, icône, sous-titre, actions — même disposition que l'en-tête des listes WeKnora. */
import { useI18n } from 'vue-i18n'

withDefaults(defineProps<{ title: string; icon?: string; subtitle?: string; back?: string; backLabel?: string }>(),
  { icon: 'app', subtitle: '', back: '', backLabel: '' })
const { t } = useI18n()
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
    font-family: var(--app-font-family);
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
  background: var(--td-brand-color-light);
  color: var(--td-brand-color);
}
.title-text { min-width: 0; overflow-wrap: anywhere; }
.header-subtitle { margin: 0; font-family: var(--app-font-family); line-height: 20px; }
.header-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
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
  &:focus-visible { outline: 2px solid var(--td-brand-color); outline-offset: 2px; border-radius: 4px; }
}

.resource-list-header();

@media (max-width: 720px) {
  .header h2 { font-size: var(--app-text-2xl); line-height: 28px; }
}
</style>
