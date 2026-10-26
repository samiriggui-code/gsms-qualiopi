<template>
  <div class="gsms-settings">
    <div class="section-header">
      <h2>{{ t('gsms.parametres.sections.listes') }}</h2>
      <p class="section-description">{{ t('gsms.parametres.listes.description') }}</p>
    </div>

    <GsmsRefusal v-if="loadError" :error="loadError" inline />
    <div v-if="loading" class="state-block"><t-loading size="small" /></div>

    <template v-else>
      <template v-for="list in lists" :key="list.title">
        <div class="group-title">{{ list.title }}</div>
        <p class="group-desc">{{ list.source }}</p>
        <div class="table-frame">
          <t-table row-key="code" :data="list.rows" :columns="columns" size="small">
            <template #code="{ row }"><code class="code">{{ row.code }}</code></template>
          </t-table>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { getEditionTypes } from '@/api/gsms/editions'
import { getOrganisme } from '@/api/gsms/platform'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import { useGsmsAccessStore } from '@/stores/gsmsAccess'
import { useGsmsValueListsStore } from '@/stores/gsmsValueLists'

type Row = { code: string; libelle: string; note?: string }
const { t } = useI18n()
const access = useGsmsAccessStore()
const valueLists = useGsmsValueListsStore()
const lists = ref<{ title: string; source: string; rows: Row[] }[]>([])
const loading = ref(true)
const loadError = ref<unknown>(null)
const columns = computed(() => [
  { colKey: 'code', title: t('gsms.parametres.listes.colCode'), width: 220 },
  { colKey: 'libelle', title: t('gsms.parametres.listes.colLibelle'), minWidth: 200 },
  { colKey: 'note', title: '', width: 160 },
])

const toRows = (v: Record<string, string> | string[]): Row[] =>
  Array.isArray(v) ? v.map((c) => ({ code: c, libelle: c })) : Object.entries(v).map(([code, libelle]) => ({ code, libelle }))

onMounted(async () => {
  try {
    const [org] = await Promise.all([getOrganisme(), valueLists.load()])
    if (valueLists.error) throw valueLists.error
    const out: { title: string; source: string; rows: Row[] }[] = [
      { title: t('gsms.parametres.listes.categories'), source: t('gsms.parametres.listes.source', { route: 'GET /organisme' }), rows: org.categories_possibles },
      // Listes acceptées en saisie (lieux, équipements, partenaires, veille, réclamations, enquêtes, titres).
      ...(valueLists.lists ?? []).map((l) => ({
        title: l.libelle,
        source: t('gsms.parametres.listes.sourceConstante', { route: 'GET /listes-de-valeurs', constante: l.source }),
        rows: l.valeurs,
      })),
    ]
    if (access.hasFeature('documents') && access.can('documents.read')) {
      const ed = await getEditionTypes()
      const source = t('gsms.parametres.listes.source', { route: 'GET /editions/types' })
      out.push(
        { title: t('gsms.parametres.listes.typesDocuments'), source,
          rows: ed.types.map((x) => ({ code: x.code, libelle: x.libelle, note: t(x.disponible ? 'gsms.parametres.listes.disponible' : 'gsms.parametres.listes.nonConstruit') })) },
        { title: t('gsms.parametres.listes.statutsDocuments'), source, rows: toRows(ed.statuts) },
        { title: t('gsms.parametres.listes.unites'), source, rows: toRows(ed.unites) },
      )
    }
    lists.value = out
  } catch (err) {
    loadError.value = err
  } finally {
    loading.value = false
  }
})
</script>

<style lang="less" scoped>
@import (reference) './gsms-section.less';

.gsms-settings {
  .gsms-section();
}

.code {
  font-family: var(--app-font-family-mono);
  font-size: var(--app-text-sm);
}
</style>
