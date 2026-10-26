<template>
  <GsmsListPage :title="t('gsms.ressources.lieux.titre')" icon="location" :subtitle="t('gsms.ressources.lieux.sousTitre')"
    :items="rows" :loading="loading" :error="error" :columns="columns" :empty-title="t('gsms.ressources.lieux.aucun')"
    :empty-description="canWrite ? t('gsms.ressources.lieux.aucunAide') : ''" @retry="load">
    <template #actions>
      <t-button v-if="canWrite" size="small" @click="openForm(null)"><template #icon><t-icon name="add" /></template>{{ t('gsms.ressources.lieux.nouveau') }}</t-button>
    </template>
    <template #toolbar>
      <GsmsFilterTabs v-model="kind" :options="kindTabs" :label="moyenLabel('kind')" />
    </template>
    <template #before><GsmsRefusal v-if="actionError" :error="actionError" inline /></template>

    <template #cell-name="{ row }">
      <span class="cell-title">{{ row.name || row.code || '—' }}</span>
      <span v-if="row.parent_name || row.floor" class="cell-sub">{{ [row.parent_name, row.floor].filter(Boolean).join(' · ') }}</span>
    </template>
    <template #cell-kind="{ row }">{{ row.kind_label }}</template>
    <template #cell-capacity="{ row }">{{ row.capacity ?? '—' }}</template>
    <template #cell-accessibility="{ row }"><span class="cell-sub">{{ row.accessibility || t('gsms.ressources.lieux.accessibiliteNonRenseignee') }}</span></template>
    <template #cell-status="{ row }">
      <GsmsStatusTag :code="row.status" :label="row.status_label" />
      <span v-if="row.checked_on" class="cell-sub">{{ t('gsms.ressources.lieux.verifieLe', { date: fmtDate(row.checked_on) }) }}</span>
    </template>
    <template #cell-actions="{ row }"><GsmsRowActions v-if="canWrite" :delete-title="t('gsms.ressources.lieux.supprimer')" @edit="openForm(row)" :remove="() => remove(row)" /></template>

    <template #card="{ item }">
      <div class="card card--static">
        <div class="card-header">
          <div class="card-header-left"><span class="card-title" :title="item.name ?? ''">{{ item.name || item.code || '—' }}</span></div>
          <GsmsStatusTag :code="item.status" :label="item.status_label" />
        </div>
        <div class="card-content">
          <p class="card-description" :class="{ 'is-empty': !item.accessibility }">{{ item.accessibility || t('gsms.ressources.lieux.accessibiliteNonRenseignee') }}</p>
        </div>
        <div class="card-meta">
          <span>{{ item.kind_label }}</span>
          <span v-if="item.parent_name">{{ item.parent_name }}</span>
          <span v-if="item.capacity != null"><t-icon name="user" />{{ t('gsms.ressources.lieux.nPlaces', { n: item.capacity }) }}</span>
          <span v-if="item.equipment"><t-icon name="tools" />{{ t('gsms.ressources.lieux.nEquipements', { n: item.equipment }) }}</span>
        </div>
        <GsmsRowActions v-if="canWrite" class="card-actions" :delete-title="t('gsms.ressources.lieux.supprimer')" @edit="openForm(item)" :remove="() => remove(item)" />
      </div>
    </template>
  </GsmsListPage>

  <ActionDialog v-model:visible="form.visible" :title="form.row ? t('gsms.ressources.lieux.modifier') : t('gsms.ressources.lieux.nouveau')"
    :fields="formFields" :run="save" @done="saved" />
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { MessagePlugin } from 'tdesign-vue-next'
import GsmsListPage, { type ListColumn } from '@/components/gsms/GsmsListPage.vue'
import GsmsFilterTabs from '@/components/gsms/GsmsFilterTabs.vue'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import GsmsRowActions from '@/components/gsms/GsmsRowActions.vue'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import ActionDialog from '@/components/gsms/ActionDialog.vue'
import { createRessource, deleteRessource, listRessources, updateRessource, type Premises } from '@/api/gsms/ressources'
import { useGsmsAccessStore } from '@/stores/gsmsAccess'
import { useGsmsValueListsStore } from '@/stores/gsmsValueLists'
import { fmtDate } from '@/components/gsms/format'
import { moyenFields, moyenLabel, moyenOptions, moyenPayload, moyenWrite } from './moyenForm'

const { t } = useI18n()
const access = useGsmsAccessStore()
const valueLists = useGsmsValueListsStore()
// Ressource CRUD sans `capabilities` : l'écriture suit la permission de la route (sessions.write).
const canWrite = computed(() => access.can(moyenWrite('premises')))

const items = ref<Premises[] | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const actionError = ref<unknown>(null)
const kind = ref('all')

async function load() {
  loading.value = true
  error.value = null
  try {
    items.value = await listRessources('premises')
  } catch (e) {
    error.value = e
    items.value = null
  } finally {
    loading.value = false
  }
}
onMounted(() => { access.load(); valueLists.load(); load() })

const kindTabs = computed(() => [{ value: 'all', label: t('gsms.commun.tous'), count: items.value?.length },
  ...moyenOptions('premises', 'kind').filter((o) => (items.value ?? []).some((p) => p.kind === o.value))
    .map((o) => ({ ...o, count: (items.value ?? []).filter((p) => p.kind === o.value).length }))])
const rows = computed(() => items.value?.filter((p) => kind.value === 'all' || p.kind === kind.value) ?? null)

const columns = computed<ListColumn[]>(() => [
  { colKey: 'name', title: moyenLabel('lieu') },
  { colKey: 'kind', title: moyenLabel('kind'), width: 150 },
  { colKey: 'capacity', title: moyenLabel('capacite'), width: 90 },
  { colKey: 'accessibility', title: moyenLabel('accessibility') },
  { colKey: 'status', title: moyenLabel('status'), width: 170 },
  ...(canWrite.value ? [{ colKey: 'actions', title: '', width: 150 }] : []),
])

const form = reactive<{ visible: boolean; row: Premises | null }>({ visible: false, row: null })
const premisesOptions = computed(() => (items.value ?? []).map((p) => ({ value: p.id, label: p.name || p.code || p.id })))
const formFields = computed(() => moyenFields('premises', form.row, premisesOptions.value))
function openForm(row: Premises | null) {
  Object.assign(form, { visible: true, row })
}
const save = (v: Record<string, unknown>) => {
  const body = moyenPayload('premises', v)
  return form.row ? updateRessource('premises', form.row.id, body) : createRessource('premises', body)
}
async function saved() {
  MessagePlugin.success(t('gsms.commun.enregistre'))
  await load()
}

async function remove(p: Premises) {
  await deleteRessource('premises', p.id)
  actionError.value = null
  void load()
}
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.card { .gsms-card(); }
.card--static { cursor: default; }
.card-actions { margin-top: 8px; }
.cell-title { display: block; font-weight: 500; }
.cell-sub { display: block; color: var(--td-text-color-secondary); font-size: var(--app-text-sm); }
</style>
