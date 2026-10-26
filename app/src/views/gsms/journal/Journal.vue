<template>
  <GsmsListPage :title="t('gsms.journal.titre')" icon="history" :subtitle="t('gsms.journal.sousTitre')"
    :items="loaded ? lines : null" :loading="loading" :error="loaded && lines.length ? null : error" :columns="columns"
    :page-size="1000" :empty-title="t('gsms.journal.aucune')" @retry="reload">
    <template #toolbar>
      <t-select v-model="table" :options="tableOptions" clearable filterable :placeholder="t('gsms.journal.toutesDonnees')" class="table-select" :aria-label="t('gsms.journal.donnees')" />
      <t-input v-model="acteur" class="search" :placeholder="t('gsms.journal.auteurExact')" :aria-label="t('gsms.journal.auteur')" clearable @enter="reload" @clear="reload">
        <template #prefix-icon><t-icon name="user" size="16px" /></template>
      </t-input>
    </template>

    <template #cell-at="{ row }">{{ fmtDateTime(row.at) }}</template>
    <template #cell-action="{ row }"><GsmsStatusTag :code="row.action" /></template>
    <template #cell-table="{ row }"><span class="mono">{{ row.table }}</span><span class="cell-sub">{{ row.entite }}</span></template>
    <template #cell-champs="{ row }"><Changes :line="row" /></template>

    <template #card="{ item }">
      <div class="card card--static">
        <div class="card-header">
          <GsmsStatusTag :code="item.action" />
          <span class="card-title mono">{{ item.table }}</span>
        </div>
        <div class="card-meta"><span>{{ item.actor || '—' }}</span><span>{{ fmtDateTime(item.at) }}</span></div>
        <Changes :line="item" />
      </div>
    </template>

    <template #after>
      <GsmsRefusal v-if="error && lines.length" :error="error" inline />
      <div v-if="suite" class="more"><t-button variant="outline" :loading="loading" @click="more">{{ t('gsms.commun.chargerSuite') }}</t-button></div>
    </template>
  </GsmsListPage>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onMounted, ref, watch, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import GsmsListPage, { type ListColumn } from '@/components/gsms/GsmsListPage.vue'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import { getRecentJournal, type JournalLine } from '@/api/gsms/journal'
import { fmtDateTime } from '@/components/gsms/format'

const { t } = useI18n()
const lines = ref<JournalLine[]>([])
const loaded = ref(false)
const tables = ref<string[]>([])
const suite = ref<number | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const table = ref<string | undefined>(undefined)
const acteur = ref('')

const tableOptions = computed(() => tables.value.map((x) => ({ value: x, label: x })))
const columns = computed<ListColumn[]>(() => [
  { colKey: 'at', title: t('gsms.journal.date'), width: 150 },
  { colKey: 'action', title: t('gsms.journal.action'), width: 130 },
  { colKey: 'table', title: t('gsms.journal.donnees') },
  { colKey: 'actor', title: t('gsms.journal.auteur'), width: 160 },
  { colKey: 'champs', title: t('gsms.journal.champs') },
])

const show = (v: unknown) => (v === null || v === undefined || v === '' ? '∅' : typeof v === 'object' ? JSON.stringify(v) : String(v))

/** Champs modifiés d'une ligne du journal : valeur avant → valeur après (texte brut, jamais interprété en HTML). */
const Changes = defineComponent({
  props: { line: { type: Object as PropType<JournalLine>, required: true } },
  setup(props) {
    return () => {
      const l = props.line
      if (!l.changes || !l.champs.length) return null
      const head = l.champs.slice(0, 4).join(', ') + (l.champs.length > 4 ? '…' : '')
      return h('details', { class: 'changes', onClick: (e: Event) => e.stopPropagation() }, [
        h('summary', t('gsms.journal.nChamps', { n: l.champs.length, liste: head })),
        h('dl', l.champs.flatMap((f) => [
          h('dt', f),
          h('dd', [h('span', { class: 'before' }, show(l.changes?.[f]?.[0])), ' → ', h('span', { class: 'after' }, show(l.changes?.[f]?.[1]))]),
        ])),
      ])
    }
  },
})

async function fetchPage(avant: number | null) {
  loading.value = true
  error.value = null
  try {
    const page = await getRecentJournal({ table: table.value || undefined, acteur: acteur.value.trim() || undefined, avant })
    lines.value = avant ? [...lines.value, ...page.lignes] : page.lignes
    tables.value = page.tables
    suite.value = page.suite
    loaded.value = true
  } catch (e) {
    error.value = e
    if (!avant) loaded.value = false
  } finally {
    loading.value = false
  }
}
const reload = () => { lines.value = []; fetchPage(null) }
const more = () => fetchPage(suite.value)
onMounted(reload)
watch(table, reload)
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.table-select { width: 280px; max-width: 100%; }
.search { .gsms-search(); }
.card { .gsms-card(); }
.card--static { cursor: default; }
.mono { font-family: var(--td-font-family-mono, monospace); font-size: var(--app-text-sm); overflow-wrap: anywhere; }
.cell-sub { display: block; color: var(--td-text-color-placeholder); font-size: var(--app-text-xs); overflow-wrap: anywhere; }
.more { display: flex; justify-content: center; margin-top: 12px; }
:deep(.changes) {
  margin-top: 4px;
  summary { cursor: pointer; color: var(--td-text-color-secondary); font-size: var(--app-text-sm); overflow-wrap: anywhere; }
  dl { display: grid; grid-template-columns: minmax(90px, max-content) minmax(0, 1fr); gap: 4px 12px; margin: 6px 0 0; font-size: var(--app-text-sm); }
  dt { color: var(--td-text-color-placeholder); overflow-wrap: anywhere; }
  dd { margin: 0; overflow-wrap: anywhere; }
  .before { color: var(--td-text-color-secondary); text-decoration: line-through; }
  .after { color: var(--td-text-color-primary); }
  @media (max-width: 720px) { dl { grid-template-columns: minmax(0, 1fr); } }
}
</style>
