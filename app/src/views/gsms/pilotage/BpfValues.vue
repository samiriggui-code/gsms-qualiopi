<template>
  <p v-if="!entries.length" class="none">{{ t('gsms.bilans.bpf.aucuneValeur') }}</p>
  <dl v-else class="values" :class="{ 'values--nested': nested }">
    <div v-for="[key, value] in entries" :key="key" class="entry">
      <dt>{{ keyLabel(key) }}</dt>
      <dd>
        <BpfValues v-if="isObject(value)" :values="value" nested />
        <template v-else>{{ show(value) }}</template>
      </dd>
    </div>
  </dl>
</template>

<script setup lang="ts">
/** Valeurs d'un cadre de l'aide au BPF, affichées telles que l'API les compose (aucun total ni calcul ici). */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BpfValue } from '@/api/gsms/pilotage'
import { fmtDate } from '@/components/gsms/format'

const props = withDefaults(defineProps<{ values: Record<string, BpfValue>; nested?: boolean }>(), { nested: false })
const { t, te, locale } = useI18n()

const entries = computed(() => Object.entries(props.values ?? {}))
const isObject = (v: BpfValue): v is Record<string, BpfValue> => v !== null && typeof v === 'object' && !Array.isArray(v)

/** Libellé d'une clé de l'API ; une lettre ou un chiffre seul désigne une ligne du cerfa. */
function keyLabel(key: string): string {
  if (te(`gsms.bilans.bpf.cles.${key}`)) return t(`gsms.bilans.bpf.cles.${key}`)
  if (/^[a-z0-9]$/i.test(key)) return t('gsms.bilans.bpf.ligne', { ligne: key })
  return key.replace(/_/g, ' ')
}

function show(v: BpfValue): string {
  if (v === null || v === '') return '—'
  if (typeof v === 'boolean') return t(v ? 'gsms.bilans.bpf.oui' : 'gsms.bilans.bpf.non')
  if (typeof v === 'number') return v.toLocaleString(locale.value, { maximumFractionDigits: 2 })
  if (Array.isArray(v)) return v.map((x) => (isObject(x) ? JSON.stringify(x) : show(x))).join(', ') || '—'
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return fmtDate(v)
  return String(v)
}
</script>

<style scoped lang="less">
.values {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 200px), 1fr));
  gap: 10px 16px;
  margin: 0;
  &--nested {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    .entry { display: flex; align-items: baseline; gap: 4px; }
    dt::after { content: ' :'; }
  }
}
.entry { min-width: 0; }
dt { color: var(--td-text-color-placeholder); font-size: var(--app-text-xs); line-height: 16px; overflow-wrap: anywhere; }
dd { margin: 2px 0 0; color: var(--td-text-color-primary); font-size: var(--app-text-md); line-height: 20px; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.values--nested dd { margin: 0; font-size: var(--app-text-sm); }
.none { margin: 0; color: var(--td-text-color-placeholder); font-size: var(--app-text-sm); }
</style>
