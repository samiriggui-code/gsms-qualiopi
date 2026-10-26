<template>
  <GsmsListPage :title="t('gsms.commercial.entreprises.titre')" icon="city" :subtitle="t('gsms.commercial.entreprises.sousTitre')"
    :items="rows" :loading="loading" :error="error" :columns="columns" :row-to="(c) => `/platform/entreprises/${c.id}`"
    :empty-title="items?.length ? t('gsms.commun.aucunResultat') : t('gsms.commercial.entreprises.aucune')"
    :empty-description="items?.length ? t('gsms.commun.aucunResultatFiltres') : t('gsms.commercial.entreprises.aucuneAide')" @retry="load">
    <template #actions>
      <t-button v-if="canWrite" size="small" @click="openForm(null)"><template #icon><t-icon name="add" /></template>{{ t('gsms.commercial.entreprises.nouvelle') }}</t-button>
    </template>
    <template #toolbar>
      <GsmsFilterTabs v-model="filter" :options="tabs" :label="t('gsms.commercial.entreprises.filtrer')" />
      <t-input v-model="query" class="search" :placeholder="t('gsms.commun.rechercher')" :aria-label="t('gsms.commun.rechercher')" clearable>
        <template #prefix-icon><t-icon name="search" size="16px" /></template>
      </t-input>
    </template>
    <template #before><GsmsRefusal v-if="actionError" :error="actionError" inline /></template>

    <template #cell-name="{ row }">
      <router-link :to="`/platform/entreprises/${row.id}`" class="cell-title" @click.stop>{{ row.name }}</router-link>
      <span v-if="row.code" class="chip">{{ row.code }}</span>
    </template>
    <template #cell-city="{ row }">{{ [row.postal_code, row.city].filter(Boolean).join(' ') || '—' }}</template>
    <template #cell-contact="{ row }">{{ [row.contact_name, row.contact_email].filter(Boolean).join(' · ') || '—' }}</template>
    <template #cell-actions="{ row }"><GsmsRowActions v-if="canWrite" :delete-title="t('gsms.commercial.entreprises.supprimer')" @edit="openForm(row)" @delete="remove(row)" /></template>

    <template #card="{ item }">
      <router-link :to="`/platform/entreprises/${item.id}`" class="card">
        <div class="card-header">
          <div class="card-header-left"><span class="card-title" :title="item.name">{{ item.name }}</span></div>
          <span v-if="item.code" class="chip">{{ item.code }}</span>
        </div>
        <div class="card-bottom">
          <div class="card-meta">
            <span v-if="item.city"><t-icon name="location" size="14px" />{{ [item.postal_code, item.city].filter(Boolean).join(' ') }}</span>
            <span v-if="item.contact_name"><t-icon name="user" size="14px" />{{ item.contact_name }}</span>
            <span><t-icon name="usergroup" size="14px" />{{ t('gsms.commercial.entreprises.nStagiaires', { n: item.learners }, item.learners) }}</span>
          </div>
        </div>
      </router-link>
    </template>
  </GsmsListPage>

  <ActionDialog v-model:visible="form.visible" :title="form.row ? t('gsms.commercial.entreprises.modifier') : t('gsms.commercial.entreprises.nouvelle')"
    :fields="companyFields(form.row)" :run="save" @done="saved" />
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
import { createCompany, deleteCompany, listCompanies, updateCompany, type Company } from '@/api/gsms/entreprises'
import { useGsmsAccessStore } from '@/stores/gsmsAccess'
import { companyFields, companyLabel } from './companyForm'

const { t } = useI18n()
const access = useGsmsAccessStore()
// Ressource CRUD sans `capabilities` : l'écriture suit la permission de la route (sessions.write).
const canWrite = computed(() => access.can('sessions.write'))

const items = ref<Company[] | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const actionError = ref<unknown>(null)
const query = ref('')
const filter = ref('all')

async function load() {
  loading.value = true
  error.value = null
  try {
    items.value = await listCompanies()
  } catch (e) {
    error.value = e
    items.value = null
  } finally {
    loading.value = false
  }
}
onMounted(() => { access.load(); load() })

const tabs = computed(() => {
  const list = items.value ?? []
  return [
    { value: 'all', label: t('gsms.commun.toutes'), count: list.length },
    { value: 'stagiaires', label: t('gsms.commercial.entreprises.avecStagiaires'), count: list.filter((c) => c.learners).length },
  ]
})
const rows = computed(() => {
  const q = query.value.trim().toLowerCase()
  return items.value?.filter((c) => (filter.value === 'all' || c.learners > 0)
    && (!q || [c.name, c.code, c.siret, c.city, c.contact_name, c.contact_email].some((v) => v?.toLowerCase().includes(q)))) ?? null
})
const columns = computed<ListColumn[]>(() => [
  { colKey: 'name', title: companyLabel('name') },
  { colKey: 'city', title: companyLabel('city'), width: 180 },
  { colKey: 'contact', title: t('gsms.commercial.entreprises.contact') },
  { colKey: 'learners', title: t('gsms.commercial.entreprises.colStagiaires'), width: 110 },
  { colKey: 'enrollments', title: t('gsms.commercial.entreprises.colInscriptions'), width: 110 },
  ...(canWrite.value ? [{ colKey: 'actions', title: '', width: 150 }] : []),
])

const form = reactive<{ visible: boolean; row: Company | null }>({ visible: false, row: null })
function openForm(row: Company | null) {
  Object.assign(form, { visible: true, row })
}
const save = (v: Record<string, unknown>) => (form.row ? updateCompany(form.row.id, v) : createCompany(v))
async function saved() {
  MessagePlugin.success(t('gsms.commun.enregistre'))
  await load()
}

async function remove(c: Company) {
  actionError.value = null
  try {
    await deleteCompany(c.id)
    await load()
  } catch (e) {
    actionError.value = e
  }
}
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.search { .gsms-search(); }
.card { .gsms-card(); text-decoration: none; color: inherit; }
.chip { .gsms-chip(); margin-left: 6px; }
.cell-title { font-weight: 500; color: var(--td-text-color-primary); text-decoration: none; &:hover { color: var(--td-brand-color); } }
</style>
