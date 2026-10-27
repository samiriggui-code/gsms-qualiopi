<template>
  <GsmsTimeline :title="t('gsms.ficheEnrichie.historique')" icon="history" :subtitle="t('gsms.ficheEnrichie.historiqueAide')"
    :items="items" :loading="loading" :error="error" :empty="t('gsms.ficheEnrichie.historiqueVide')" :max="10">
    <template #item="{ item }">
      <details v-if="(item.fields as string[]).length" class="hist-changes">
        <summary>{{ t('gsms.journal.nChamps', { n: (item.fields as string[]).length, liste: head(item.fields as string[]) }) }}</summary>
        <dl>
          <template v-for="f in (item.fields as string[])" :key="f">
            <dt>{{ f }}</dt>
            <dd v-if="item.pairs"><span class="before">{{ show(pairOf(item, f)[0]) }}</span> → <span>{{ show(pairOf(item, f)[1]) }}</span></dd>
            <dd v-else>{{ show((item.changes as Record<string, unknown>)[f]) }}</dd>
          </template>
        </dl>
      </details>
    </template>
  </GsmsTimeline>
</template>

<script setup lang="ts">
/**
 * Historique d'une fiche : le journal des modifications de la donnée (GET /journal, droit `journal.read`), le plus
 * récent d'abord, avec l'auteur et les valeurs avant et après telles que l'API les rend (les champs personnels y
 * sont masqués par l'API). Texte brut, jamais interprété en HTML.
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import GsmsTimeline, { type TimelineItem } from './GsmsTimeline.vue'
import { getEntityJournal, type EntityJournalLine } from '@/api/gsms/journal'
import { fmtDateTime, stateLabel } from './format'

const props = defineProps<{ table: string; entityId: string }>()
const { t } = useI18n()
const lines = ref<EntityJournalLine[]>([])
const loading = ref(false)
const error = ref<unknown>(null)

async function load() {
  if (!props.entityId) return
  loading.value = true
  error.value = null
  try {
    lines.value = await getEntityJournal(props.table, props.entityId)
  } catch (e) {
    error.value = e
    lines.value = []
  } finally {
    loading.value = false
  }
}
watch(() => [props.table, props.entityId], load, { immediate: true })

const isPair = (v: unknown) => Array.isArray(v) && v.length === 2
const items = computed<TimelineItem[]>(() => [...lines.value].reverse().map((l, i) => {
  const changes = l.changes ?? {}
  const fields = Object.keys(changes).sort()
  const pairs = l.action === 'MODIFICATION' && fields.every((f) => isPair(changes[f]))
  return {
    key: `${l.at}-${i}`,
    date: l.at,
    dateLabel: fmtDateTime(l.at),
    title: stateLabel(l.action),
    detail: l.actor ? t('gsms.ficheEnrichie.par', { auteur: l.actor }) : null,
    icon: l.action === 'CREATION' ? 'add' : l.action === 'SUPPRESSION' ? 'delete' : 'edit-1',
    tone: l.action === 'SUPPRESSION' ? 'danger' : undefined,
    fields: l.action === 'MODIFICATION' ? fields : [],
    pairs,
    changes,
  }
}))
const head = (fields: string[]) => fields.slice(0, 4).join(', ') + (fields.length > 4 ? '…' : '')
const pairOf = (item: TimelineItem, f: string) => (item.changes as Record<string, [unknown, unknown]>)[f] ?? [null, null]
const show = (v: unknown) => (v === null || v === undefined || v === '' ? '∅' : typeof v === 'object' ? JSON.stringify(v) : String(v))
</script>

<style scoped lang="less">
.hist-changes {
  margin-top: 4px;
  font-size: var(--app-text-sm);
  summary { cursor: pointer; color: var(--td-text-color-secondary); }
  dl { display: grid; grid-template-columns: minmax(0, max-content) minmax(0, 1fr); gap: 2px 10px; margin: 6px 0 0; }
  dt { color: var(--td-text-color-placeholder); font-family: var(--app-font-family-mono); font-size: var(--app-text-xs); overflow-wrap: anywhere; }
  dd { margin: 0; color: var(--td-text-color-primary); overflow-wrap: anywhere; }
  .before { color: var(--td-text-color-secondary); text-decoration: line-through; }
}
</style>
