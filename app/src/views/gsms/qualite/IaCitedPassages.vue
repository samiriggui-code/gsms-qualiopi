<template>
  <p v-if="passages.length" class="cited">
    <span class="cited-label">{{ t('gsms.qualite.analyse.passagesCites') }}</span>
    <template v-for="p in passages" :key="p.passage_id">
      <a v-if="labels?.has(p.passage_id)" class="cited-item" :href="`#${passageAnchor(p.passage_id)}`" @click.prevent="reveal(p.passage_id)">
        <span class="cited-ref">{{ p.passage }}</span> {{ p.titre }}
      </a>
      <span v-else class="cited-item"><span class="cited-ref">{{ p.passage }}</span> {{ p.titre }}</span>
    </template>
  </p>
</template>

<script setup lang="ts">
/** Passages cités par l'IA (titres), avec renvoi vers le passage affiché dans le bloc « Passages retrouvés ». */
import { useI18n } from 'vue-i18n'
import type { CitedPassage } from '@/api/gsms/qualite'
import { passageAnchor } from './indicatorAnalysis'

defineProps<{ passages: CitedPassage[]; labels?: Map<string, string> }>()
const { t } = useI18n()

function reveal(passageId: string) {
  const el = document.getElementById(passageAnchor(passageId))
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.focus({ preventScroll: true })
}
</script>

<style scoped lang="less">
.cited { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; margin: 4px 0 0; font-size: var(--app-text-xs); line-height: 18px; }
.cited-label { color: var(--td-text-color-secondary); }
.cited-item { overflow-wrap: anywhere; color: var(--td-text-color-primary); }
a.cited-item { color: var(--td-brand-color); text-decoration: none; &:hover, &:focus-visible { text-decoration: underline; } }
.cited-ref { font-weight: 600; font-variant-numeric: tabular-nums; }
</style>
