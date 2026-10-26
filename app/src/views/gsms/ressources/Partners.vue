<template>
  <GsmsListPage :title="t('gsms.ressources.partenaires.titre')" icon="usergroup-add" :subtitle="t('gsms.ressources.partenaires.sousTitre')"
    :items="rows" :loading="loading" :error="error" :columns="columns" :empty-title="t('gsms.ressources.partenaires.aucun')" @retry="load">
    <template #actions>
      <t-button v-if="canWrite" size="small" @click="openForm(null)"><template #icon><t-icon name="add" /></template>{{ t('gsms.ressources.partenaires.nouveau') }}</t-button>
    </template>
    <template #toolbar>
      <GsmsFilterTabs v-model="kind" :options="kindTabs" :label="moyenLabel('kind')" />
    </template>
    <template #before><GsmsRefusal v-if="actionError" :error="actionError" inline /></template>

    <template #cell-name="{ row }"><span class="cell-title">{{ row.name }}</span></template>
    <template #cell-kind="{ row }">{{ moyenValue('partners', 'kind', row.kind) }} <span class="chip">{{ indicatorOf(row.kind) }}</span></template>
    <template #cell-last_contact_on="{ row }">{{ fmtDate(row.last_contact_on) }}</template>
    <template #cell-actions="{ row }"><GsmsRowActions v-if="canWrite" :delete-title="t('gsms.ressources.partenaires.supprimer')" @edit="openForm(row)" :remove="() => remove(row)" /></template>

    <template #card="{ item }">
      <div class="card card--static">
        <div class="card-header">
          <div class="card-header-left"><span class="card-title" :title="item.name">{{ item.name }}</span></div>
          <span class="chip">{{ indicatorOf(item.kind) }}</span>
        </div>
        <div class="card-meta">
          <span>{{ moyenValue('partners', 'kind', item.kind) }}</span>
          <span>{{ moyenLabel('last_contact_on') }} {{ fmtDate(item.last_contact_on) }}</span>
        </div>
        <GsmsRowActions v-if="canWrite" class="card-actions" :delete-title="t('gsms.ressources.partenaires.supprimer')" @edit="openForm(item)" :remove="() => remove(item)" />
      </div>
    </template>
  </GsmsListPage>

  <ActionDialog v-model:visible="form.visible" :title="form.row ? t('gsms.ressources.partenaires.modifier') : t('gsms.ressources.partenaires.nouveau')"
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
import ActionDialog from '@/components/gsms/ActionDialog.vue'
import { createRessource, deleteRessource, listRessources, updateRessource, type Partner } from '@/api/gsms/ressources'
import { useGsmsAccessStore } from '@/stores/gsmsAccess'
import { useGsmsValueListsStore } from '@/stores/gsmsValueLists'
import { fmtDate } from '@/components/gsms/format'
import { moyenFields, moyenLabel, moyenOptions, moyenPayload, moyenValue, moyenWrite } from './moyenForm'

// Indicateur du référentiel auquel chaque type de partenaire se rapporte (I26 handicap, I28 socio-économique, modèle PartnerNetwork).
const INDICATOR: Record<string, string> = { HANDICAP: 'I26', SOCIO_ECONOMIQUE: 'I28' }

const { t } = useI18n()
const access = useGsmsAccessStore()
const valueLists = useGsmsValueListsStore()
// Ressource CRUD sans `capabilities` : l'écriture suit la permission de la route (quality.write).
const canWrite = computed(() => access.can(moyenWrite('partners')))
const indicatorOf = (kind: string) => INDICATOR[kind] ?? ''

const items = ref<Partner[] | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const actionError = ref<unknown>(null)
const kind = ref('all')

async function load() {
  loading.value = true
  error.value = null
  try {
    items.value = await listRessources('partners')
  } catch (e) {
    error.value = e
    items.value = null
  } finally {
    loading.value = false
  }
}
onMounted(() => { access.load(); valueLists.load(); load() })

const kindTabs = computed(() => [{ value: 'all', label: t('gsms.commun.tous'), count: items.value?.length },
  ...moyenOptions('partners', 'kind').map((o) => ({ ...o, count: (items.value ?? []).filter((p) => p.kind === o.value).length }))])
const rows = computed(() => items.value?.filter((p) => kind.value === 'all' || p.kind === kind.value) ?? null)

const columns = computed<ListColumn[]>(() => [
  { colKey: 'name', title: moyenLabel('partenaire') },
  { colKey: 'kind', title: moyenLabel('kind'), width: 220 },
  { colKey: 'last_contact_on', title: moyenLabel('dernierContact'), width: 150 },
  ...(canWrite.value ? [{ colKey: 'actions', title: '', width: 150 }] : []),
])

const form = reactive<{ visible: boolean; row: Partner | null }>({ visible: false, row: null })
const formFields = computed(() => moyenFields('partners', form.row))
function openForm(row: Partner | null) {
  Object.assign(form, { visible: true, row })
}
const save = (v: Record<string, unknown>) => {
  const body = moyenPayload('partners', v)
  return form.row ? updateRessource('partners', form.row.id, body) : createRessource('partners', body)
}
async function saved() {
  MessagePlugin.success(t('gsms.commun.enregistre'))
  await load()
}

async function remove(p: Partner) {
  await deleteRessource('partners', p.id)
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
.chip { .gsms-chip(); }
</style>
