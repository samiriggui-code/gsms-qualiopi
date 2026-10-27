<template>
  <GsmsListPage :title="t('gsms.ressources.sousTraitants.titre')" icon="link" :subtitle="t('gsms.ressources.sousTraitants.sousTitre')"
    :items="rows" :loading="loading" :error="error" :columns="columns" :empty-title="t('gsms.ressources.sousTraitants.aucun')"
    :empty-description="t('gsms.ressources.sousTraitants.aucunAide')" :row-to="(row) => `/platform/sous-traitants/${row.id}`" @retry="load">
    <template #actions>
      <t-button v-if="canWrite" size="small" @click="openForm(null)"><template #icon><t-icon name="add" /></template>{{ t('gsms.ressources.sousTraitants.nouveau') }}</t-button>
    </template>
    <template #toolbar>
      <GsmsFilterTabs v-model="filter" :options="filterTabs" :label="moyenLabel('qualiopi_certified')" />
    </template>
    <template #before><GsmsRefusal v-if="actionError" :error="actionError" inline /></template>

    <template #cell-name="{ row }"><router-link :to="`/platform/sous-traitants/${row.id}`" class="cell-title cell-link" @click.stop>{{ row.name }}</router-link></template>
    <template #cell-siret="{ row }">{{ row.siret || '—' }}</template>
    <template #cell-qualiopi_certified="{ row }">
      <t-tag :theme="row.qualiopi_certified ? 'success' : 'default'" variant="light" size="small">{{ certLabel(row) }}</t-tag>
    </template>
    <template #cell-contract_signed_on="{ row }">{{ fmtDate(row.contract_signed_on) }}</template>
    <template #cell-last_review_on="{ row }">{{ fmtDate(row.last_review_on) }}</template>
    <template #cell-actions="{ row }"><GsmsRowActions v-if="canWrite" :delete-title="t('gsms.ressources.sousTraitants.supprimer')" @edit="openForm(row)" :remove="() => remove(row)" /></template>

    <template #card="{ item }">
      <div class="card card--static">
        <div class="card-header">
          <div class="card-header-left"><router-link :to="`/platform/sous-traitants/${item.id}`" class="card-title card-link" :title="item.name">{{ item.name }}</router-link></div>
          <t-tag :theme="item.qualiopi_certified ? 'success' : 'default'" variant="light" size="small">{{ certLabel(item) }}</t-tag>
        </div>
        <div class="card-meta">
          <span>{{ moyenLabel('siret') }} : {{ item.siret || '—' }}</span>
          <span>{{ moyenLabel('contract_signed_on') }} {{ fmtDate(item.contract_signed_on) }}</span>
          <span>{{ moyenLabel('last_review_on') }} {{ fmtDate(item.last_review_on) }}</span>
        </div>
        <GsmsRowActions v-if="canWrite" class="card-actions" :delete-title="t('gsms.ressources.sousTraitants.supprimer')" @edit="openForm(item)" :remove="() => remove(item)" />
      </div>
    </template>
    <template #after><p v-if="items?.length" class="muted note">{{ t('gsms.ressources.sousTraitants.declaratif') }}</p></template>
  </GsmsListPage>

  <ActionDialog v-model:visible="form.visible" :title="form.row ? t('gsms.ressources.sousTraitants.modifier') : t('gsms.ressources.sousTraitants.nouveau')"
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
import { createRessource, deleteRessource, listRessources, updateRessource, type Subcontractor } from '@/api/gsms/ressources'
import { useGsmsAccessStore } from '@/stores/gsmsAccess'
import { fmtDate } from '@/components/gsms/format'
import { moyenFields, moyenLabel, moyenPayload, moyenWrite } from './moyenForm'

const { t } = useI18n()
const access = useGsmsAccessStore()
// Ressource CRUD sans `capabilities` : l'écriture suit la permission de la route (quality.write).
const canWrite = computed(() => access.can(moyenWrite('subcontractors')))

const items = ref<Subcontractor[] | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const actionError = ref<unknown>(null)
const filter = ref('all')
const certLabel = (s: Subcontractor) => (s.qualiopi_certified ? t('gsms.ressources.sousTraitants.certifie') : t('gsms.ressources.sousTraitants.nonCertifie'))

async function load() {
  loading.value = true
  error.value = null
  try {
    items.value = await listRessources('subcontractors')
  } catch (e) {
    error.value = e
    items.value = null
  } finally {
    loading.value = false
  }
}
onMounted(() => { access.load(); load() })

const filterTabs = computed(() => [
  { value: 'all', label: t('gsms.commun.tous'), count: items.value?.length },
  { value: 'yes', label: t('gsms.ressources.sousTraitants.certifie'), count: (items.value ?? []).filter((s) => s.qualiopi_certified).length },
  { value: 'no', label: t('gsms.ressources.sousTraitants.nonCertifie'), count: (items.value ?? []).filter((s) => !s.qualiopi_certified).length },
])
const rows = computed(() => items.value?.filter((s) => filter.value === 'all' || s.qualiopi_certified === (filter.value === 'yes')) ?? null)

const columns = computed<ListColumn[]>(() => [
  { colKey: 'name', title: moyenLabel('sousTraitant') },
  { colKey: 'siret', title: moyenLabel('siret'), width: 160 },
  { colKey: 'qualiopi_certified', title: moyenLabel('qualiopi'), width: 170 },
  { colKey: 'contract_signed_on', title: moyenLabel('contrat'), width: 130 },
  { colKey: 'last_review_on', title: moyenLabel('last_review_on'), width: 150 },
  ...(canWrite.value ? [{ colKey: 'actions', title: '', width: 150 }] : []),
])

const form = reactive<{ visible: boolean; row: Subcontractor | null }>({ visible: false, row: null })
const formFields = computed(() => moyenFields('subcontractors', form.row))
function openForm(row: Subcontractor | null) {
  Object.assign(form, { visible: true, row })
}
const save = (v: Record<string, unknown>) => {
  const body = moyenPayload('subcontractors', v)
  return form.row ? updateRessource('subcontractors', form.row.id, body) : createRessource('subcontractors', body)
}
async function saved() {
  MessagePlugin.success(t('gsms.commun.enregistre'))
  await load()
}

async function remove(s: Subcontractor) {
  await deleteRessource('subcontractors', s.id)
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
.cell-link, .card-link { color: var(--td-text-color-primary); text-decoration: none; &:hover { color: var(--td-brand-color); text-decoration: underline; } }
.muted { .gsms-muted(); }
.note { margin: 12px 0 0; }
</style>
