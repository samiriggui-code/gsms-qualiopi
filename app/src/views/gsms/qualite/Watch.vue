<template>
  <GsmsListPage :title="t('gsms.qualite.veille.titre')" icon="browse" :subtitle="t('gsms.qualite.veille.sousTitre')"
    :items="rows" :loading="loading" :error="error" :columns="columns" :empty-title="t('gsms.qualite.veille.aucune')" @retry="load">
    <template #actions>
      <t-button v-if="canWrite" size="small" @click="openForm(null)"><template #icon><t-icon name="add" /></template>{{ t('gsms.qualite.veille.nouvelle') }}</t-button>
    </template>
    <template #toolbar>
      <GsmsFilterTabs v-model="domain" :options="domainTabs" :label="t('gsms.qualite.veille.domaine')" />
      <GsmsFilterTabs v-model="follow" :options="followTabs" :label="t('gsms.commun.filtrerEtat')" />
    </template>
    <template #before><GsmsRefusal v-if="actionError" :error="actionError" inline /></template>

    <template #cell-noted_on="{ row }">{{ fmtDate(row.noted_on) }}</template>
    <template #cell-domain="{ row }">{{ domainLabel(row.domain) }}</template>
    <template #cell-exploitation="{ row }">
      <span v-if="row.exploited_on">{{ t('gsms.qualite.veille.exploiteeLe', { date: fmtDate(row.exploited_on) }) }}<template v-if="row.exploitation"> · {{ row.exploitation }}</template></span>
      <span v-else class="muted">{{ t('gsms.qualite.veille.nonExploitee') }}</span>
    </template>
    <template #cell-actions="{ row }"><GsmsRowActions v-if="canWrite" :delete-title="t('gsms.qualite.veille.supprimer')" @edit="openForm(row)" @delete="remove(row)" /></template>

    <template #card="{ item }">
      <div class="card card--static">
        <div class="card-header">
          <div class="card-header-left"><span class="card-title" :title="item.title">{{ item.title }}</span></div>
          <t-tag :theme="item.exploited_on ? 'success' : 'default'" variant="light" size="small">
            {{ item.exploited_on ? t('gsms.qualite.veille.exploitee') : t('gsms.qualite.veille.nonExploitee') }}
          </t-tag>
        </div>
        <div class="card-content"><p class="card-description">{{ item.exploitation || item.source || '—' }}</p></div>
        <div class="card-meta"><span>{{ domainLabel(item.domain) }}</span><span>{{ t('gsms.qualite.veille.noteeLe', { date: fmtDate(item.noted_on) }) }}</span></div>
        <GsmsRowActions v-if="canWrite" class="card-actions" :delete-title="t('gsms.qualite.veille.supprimer')" @edit="openForm(item)" @delete="remove(item)" />
      </div>
    </template>
  </GsmsListPage>

  <ActionDialog v-model:visible="form.visible" :title="form.id ? t('gsms.qualite.veille.modifier') : t('gsms.qualite.veille.nouvelle')"
    :fields="formFields" :run="save" @done="saved" />
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { MessagePlugin } from 'tdesign-vue-next'
import GsmsListPage, { type ListColumn } from '@/components/gsms/GsmsListPage.vue'
import GsmsFilterTabs from '@/components/gsms/GsmsFilterTabs.vue'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import ActionDialog, { type ActionField } from '@/components/gsms/ActionDialog.vue'
import GsmsRowActions from '@/components/gsms/GsmsRowActions.vue'
import { createWatchItem, deleteWatchItem, listWatchItems, updateWatchItem, type WatchIn, type WatchItem } from '@/api/gsms/qualite'
import { useGsmsAccessStore } from '@/stores/gsmsAccess'
import { useGsmsValueListsStore } from '@/stores/gsmsValueLists'
import { fmtDate } from '@/components/gsms/format'

const { t } = useI18n()
const access = useGsmsAccessStore()
// Domaines acceptés par l'API (GET /listes-de-valeurs) ; c'est elle qui les vérifie.
const valueLists = useGsmsValueListsStore()
const domains = computed(() => valueLists.options('domaines_de_veille'))
// Pas de `capabilities` sur les ressources CRUD : l'écriture suit la permission de la route (quality.write).
const canWrite = computed(() => access.can('quality.write'))

const items = ref<WatchItem[] | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const actionError = ref<unknown>(null)
const domain = ref('all')
const follow = ref('all')
const domainLabel = (d: string) => valueLists.label('domaines_de_veille', d)

async function load() {
  loading.value = true
  error.value = null
  try {
    items.value = await listWatchItems()
  } catch (e) {
    error.value = e
    items.value = null
  } finally {
    loading.value = false
  }
}
onMounted(() => { access.load(); valueLists.load(); load() })

const domainTabs = computed(() => [{ value: 'all', label: t('gsms.commun.tous'), count: items.value?.length },
  ...domains.value.map((d) => ({ ...d, count: (items.value ?? []).filter((w) => w.domain === d.value).length }))])
const followTabs = computed(() => [
  { value: 'all', label: t('gsms.commun.toutes') },
  { value: 'todo', label: t('gsms.qualite.veille.nonExploitees'), count: (items.value ?? []).filter((w) => !w.exploited_on).length },
  { value: 'done', label: t('gsms.qualite.veille.exploitees'), count: (items.value ?? []).filter((w) => !!w.exploited_on).length },
])
const rows = computed(() => items.value?.filter((w) => (domain.value === 'all' || w.domain === domain.value)
  && (follow.value === 'all' || (follow.value === 'todo' ? !w.exploited_on : !!w.exploited_on))) ?? null)

const columns = computed<ListColumn[]>(() => [
  { colKey: 'noted_on', title: t('gsms.qualite.veille.colNotee'), width: 110 },
  { colKey: 'domain', title: t('gsms.qualite.veille.domaine'), width: 120 },
  { colKey: 'title', title: t('gsms.qualite.veille.intitule') },
  { colKey: 'source', title: t('gsms.qualite.veille.source') },
  { colKey: 'exploitation', title: t('gsms.qualite.veille.exploitation') },
  ...(canWrite.value ? [{ colKey: 'actions', title: '', width: 150 }] : []),
])

const form = reactive<{ visible: boolean; id: string | null; initial: Partial<WatchItem> }>({ visible: false, id: null, initial: {} })
const formFields = computed<ActionField[]>(() => [
  { name: 'domain', label: t('gsms.qualite.veille.domaine'), type: 'radio', initial: form.initial.domain ?? domains.value[0]?.value,
    options: domains.value },
  { name: 'title', label: t('gsms.qualite.veille.intitule'), initial: form.initial.title ?? '' },
  { name: 'source', label: t('gsms.qualite.veille.source'), initial: form.initial.source ?? '' },
  { name: 'noted_on', label: t('gsms.qualite.veille.colNotee'), type: 'date', initial: form.initial.noted_on ?? '' },
  { name: 'exploitation', label: t('gsms.qualite.veille.exploitation'), type: 'textarea', initial: form.initial.exploitation ?? '' },
  { name: 'exploited_on', label: t('gsms.qualite.veille.exploiteeLeChamp'), type: 'date', initial: form.initial.exploited_on ?? '' },
])
function openForm(w: WatchItem | null) {
  Object.assign(form, { visible: true, id: w?.id ?? null, initial: w ?? {} })
}
const save = (v: Record<string, any>) => (form.id ? updateWatchItem(form.id, v as WatchIn) : createWatchItem(v as WatchIn))
async function saved() {
  MessagePlugin.success(t('gsms.commun.enregistre'))
  await load()
}


async function remove(w: WatchItem) {
  actionError.value = null
  try {
    await deleteWatchItem(w.id)
    await load()
  } catch (e) {
    actionError.value = e
  }
}
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.card { .gsms-card(); }
.card--static { cursor: default; }
.card-actions { margin-top: 8px; }
.muted { .gsms-muted(); }
</style>
