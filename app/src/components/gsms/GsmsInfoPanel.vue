<template>
  <section class="info-panel" :aria-labelledby="headId">
    <div class="ip-bar">
      <h3 :id="headId" class="ip-title"><t-icon v-if="icon" :name="icon" size="16px" class="ip-icon" aria-hidden="true" />{{ title }}</h3>
      <slot name="actions" />
    </div>
    <dl v-if="rows.length" class="ip-rows">
      <div v-for="(r, i) in rows" :key="i" :class="{ 'ip-wide': r.wide }">
        <dt>{{ r.label }}</dt>
        <dd v-if="filled(r.value)" :class="{ 'ip-text': r.wide }">
          <img v-if="r.flag" :src="r.flag" alt="" class="ip-flag" width="16" height="12" />{{ r.value }}
        </dd>
        <dd v-else class="ip-empty">{{ t('gsms.commun.nonRenseigne') }}</dd>
      </div>
    </dl>
    <slot />
  </section>
</template>

<script setup lang="ts">
/**
 * Panneau d'une fiche : titre, paires libellé / valeur reçues de l'API, « Non renseigné » discret pour une valeur
 * absente. Rien n'est calculé ici.
 */
import { useI18n } from 'vue-i18n'

export interface InfoRow {
  label: string
  value?: string | number | null
  /** Ligne pleine largeur (texte long : adresse, présentation). */
  wide?: boolean
  /** Petit drapeau devant la valeur (adresse de la médiathèque). */
  flag?: string | null
}

withDefaults(defineProps<{ title: string; icon?: string; rows?: InfoRow[] }>(), { icon: '', rows: () => [] })
const { t } = useI18n()
const headId = `ip-${Math.random().toString(36).slice(2, 9)}`
const filled = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== ''
</script>

<style scoped lang="less">
@import (reference) './gsms-list.less';
.info-panel { .gsms-panel(); display: flex; flex-direction: column; gap: 12px; }
.ip-bar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
.ip-title { .gsms-panel-title(); display: inline-flex; align-items: center; gap: 8px; margin: 0; }
.ip-icon { color: var(--td-brand-color); }
.ip-rows {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 170px), 1fr));
  gap: 12px 16px;
  margin: 0;
  dt { color: var(--td-text-color-placeholder); font-size: var(--app-text-xs); line-height: 16px; }
  dd { display: flex; align-items: center; gap: 6px; margin: 2px 0 0; color: var(--td-text-color-primary); font-size: var(--app-text-md); line-height: 20px; overflow-wrap: anywhere; min-width: 0; }
}
.ip-wide { grid-column: 1 / -1; }
.ip-text { display: block !important; white-space: pre-line; }
.ip-empty { color: var(--td-text-color-placeholder) !important; font-size: var(--app-text-sm) !important; font-style: italic; }
.ip-flag { flex-shrink: 0; border-radius: var(--app-radius-xs); object-fit: cover; }
</style>
