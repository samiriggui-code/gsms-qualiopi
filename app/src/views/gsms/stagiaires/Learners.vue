<template>
  <GsmsListPage :title="t('gsms.stagiaires.titre')" icon="usergroup" :subtitle="t('gsms.stagiaires.sousTitre')"
    :items="rows" :loading="loading" :error="error" :columns="columns" :row-to="(l) => `/platform/stagiaires/${l.id}`"
    :empty-title="learners?.length ? t('gsms.commun.aucunResultat') : t('gsms.stagiaires.aucun')"
    :empty-description="learners?.length ? t('gsms.commun.aucunResultatFiltres') : t('gsms.stagiaires.aucunAide')" @retry="load">
    <template #actions>
      <router-link :to="{ name: 'gsmsParcours' }" class="header-link">{{ t('gsms.registres.titre') }}<t-icon name="chevron-right" size="14px" /></router-link>
      <t-button v-if="canWrite && !error" size="small" @click="openCreate"><template #icon><t-icon name="add" /></template>{{ t('gsms.stagiaires.nouveau') }}</t-button>
    </template>
    <template #toolbar>
      <GsmsFilterTabs v-model="filter" :options="tabs" :label="t('gsms.stagiaires.filtrer')" />
      <t-input v-model="query" class="search" :placeholder="t('gsms.commun.rechercher')" :aria-label="t('gsms.commun.rechercher')" clearable>
        <template #prefix-icon><t-icon name="search" size="16px" /></template>
      </t-input>
    </template>

    <template #cell-full_name="{ row }">
      <router-link :to="`/platform/stagiaires/${row.id}`" class="person" @click.stop>
        <GsmsPersonAvatar :name="row.full_name" :photo="row.photo_url" /><span class="person-name">{{ row.full_name }}</span>
      </router-link>
    </template>

    <template #card="{ item }">
      <router-link :to="`/platform/stagiaires/${item.id}`" class="card">
        <div class="card-header">
          <div class="card-header-left person"><GsmsPersonAvatar :name="item.full_name" :photo="item.photo_url" :size="40" /><span class="card-title">{{ item.full_name }}</span></div>
          <span class="chip">{{ t('gsms.stagiaires.nInscriptions', { n: item.enrollments }, item.enrollments) }}</span>
        </div>
        <div class="card-bottom">
          <div class="card-meta">
            <span v-if="item.email"><t-icon name="mail" size="14px" />{{ item.email }}</span>
            <span v-if="item.phone"><t-icon name="call" size="14px" />{{ item.phone }}</span>
            <span v-if="item.company_name"><t-icon name="city" size="14px" />{{ item.company_name }}</span>
          </div>
        </div>
      </router-link>
    </template>
  </GsmsListPage>

  <ActionDialog v-model:visible="createVisible" :title="t('gsms.stagiaires.nouveau')" icon="user-add" :fields="createFields"
    width="min(760px, calc(100vw - 32px))" :run="create" @done="created">
    <p v-if="companiesError" class="muted">{{ t('gsms.stagiaires.entreprisesIndisponibles') }}</p>
  </ActionDialog>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { MessagePlugin } from 'tdesign-vue-next'
import ActionDialog from '@/components/gsms/ActionDialog.vue'
import GsmsListPage, { type ListColumn } from '@/components/gsms/GsmsListPage.vue'
import GsmsFilterTabs from '@/components/gsms/GsmsFilterTabs.vue'
import GsmsPersonAvatar from '@/components/gsms/GsmsPersonAvatar.vue'
import { createLearner, listLearnerRecords, type LearnerRecord } from '@/api/gsms/sessions'
import { listCompanies, type Company } from '@/api/gsms/entreprises'
import { useGsmsAccessStore } from '@/stores/gsmsAccess'
import { learnerFields, learnerPayload } from './learnerForm'

const { t } = useI18n()
const router = useRouter()
const access = useGsmsAccessStore()
// Ressource CRUD sans `capabilities` : l'écriture suit la permission de la route (sessions.write).
const canWrite = computed(() => access.can('sessions.write'))
const learners = ref<LearnerRecord[] | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const query = ref('')
const filter = ref('all')

async function load() {
  loading.value = true
  error.value = null
  try {
    learners.value = await listLearnerRecords()
  } catch (e) {
    error.value = e
    learners.value = null
  } finally {
    loading.value = false
  }
}
onMounted(() => { access.load(); load() })

// ── Nouveau stagiaire (POST /learners) ──
const createVisible = ref(false)
const companies = ref<Company[]>([])
const companiesError = ref<unknown>(null)
const createFields = computed(() => learnerFields(null, companies.value))
async function openCreate() {
  companiesError.value = null
  try {
    companies.value = await listCompanies()
  } catch (e) {
    companies.value = []
    companiesError.value = e
  }
  createVisible.value = true
}
const create = (v: Record<string, unknown>) => createLearner(learnerPayload(v, null))
async function created(res: unknown) {
  MessagePlugin.success(t('gsms.commun.enregistre'))
  const id = (res as LearnerRecord | null)?.id
  if (id) router.push(`/platform/stagiaires/${id}`)
  else await load()
}

const tabs = computed(() => {
  const list = learners.value ?? []
  return [
    { value: 'all', label: t('gsms.commun.tous'), count: list.length },
    { value: 'entreprise', label: t('gsms.stagiaires.avecEntreprise'), count: list.filter((l) => l.company_id).length },
    { value: 'sansInscription', label: t('gsms.stagiaires.sansInscription'), count: list.filter((l) => !l.enrollments).length },
  ]
})
const rows = computed(() => {
  const q = query.value.trim().toLowerCase()
  return learners.value?.filter((l) => (filter.value === 'all' || (filter.value === 'entreprise' ? !!l.company_id : !l.enrollments))
    && (!q || [l.full_name, l.email, l.phone, l.company_name].some((v) => v?.toLowerCase().includes(q))))
    .sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name)) ?? null
})
const columns = computed<ListColumn[]>(() => [
  { colKey: 'full_name', title: t('gsms.stagiaires.colNom') },
  { colKey: 'email', title: t('gsms.parcours.email') },
  { colKey: 'phone', title: t('gsms.parcours.telephone'), width: 150 },
  { colKey: 'company_name', title: t('gsms.parcours.entreprise') },
  { colKey: 'enrollments', title: t('gsms.stagiaires.colInscriptions'), width: 110 },
])
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.search { .gsms-search(); }
.card { .gsms-card(); text-decoration: none; color: inherit; }
.chip { .gsms-chip(); }
.person { display: flex; align-items: center; gap: 10px; min-width: 0; color: inherit; text-decoration: none;
  &:hover .person-name { color: var(--td-brand-color); } }
.person-name { color: var(--td-text-color-primary); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.muted { .gsms-muted(); margin: 8px 0 0; }
.header-link { display: inline-flex; align-items: center; gap: 4px; color: var(--td-brand-color); font-size: var(--app-text-sm); text-decoration: none; white-space: nowrap;
  &:hover { text-decoration: underline; } }
</style>
