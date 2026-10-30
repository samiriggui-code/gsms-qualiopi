<template>
  <GsmsListPage :title="t('gsms.formations.titre')" icon="book" :subtitle="t('gsms.formations.sousTitre')"
    :items="rows" :loading="loading" :error="error" :columns="columns" :row-to="(f) => `/platform/formations/${f.id}`"
    :empty-title="data?.formations.length ? t('gsms.commun.aucunResultat') : t('gsms.formations.aucune')"
    :empty-description="data?.formations.length ? t('gsms.commun.aucunResultatFiltres') : t('gsms.formations.aucuneAide')" @retry="load">
    <template v-if="data" #actions>
      <GsmsActionGate :decision="data.capabilities.ecrire" size="medium" @run="createVisible = true">
        <t-icon name="add" />{{ t('gsms.formations.nouvelle') }}
      </GsmsActionGate>
    </template>
    <template #toolbar>
      <GsmsFilterTabs v-if="tabs.length > 2" v-model="track" :options="tabs" :label="t('gsms.formations.filtrerFiliere')" />
      <t-input v-model="query" class="search" :placeholder="t('gsms.commun.rechercher')" :aria-label="t('gsms.commun.rechercher')" clearable>
        <template #prefix-icon><t-icon name="search" size="16px" /></template>
      </t-input>
    </template>
    <template v-if="data" #before>
      <p class="muted totals">{{ t('gsms.formations.totaux', { n: data.totaux.formations, validees: data.totaux.fiches_validees, certif: data.totaux.certification_identifiee }) }}</p>
    </template>

    <template #cell-title="{ row }">
      <router-link :to="`/platform/formations/${row.id}`" class="title-cell" @click.stop>
        <FormationThumb :image="row.image_url" :size="40" />
        <span class="title-text"><span class="title-main">{{ row.title }}</span><span class="muted">{{ row.code }}</span></span>
      </router-link>
    </template>
    <template #cell-duree="{ row }">{{ hours(row.duration_hours) }}</template>
    <template #cell-certification="{ row }">{{ row.certification.basis_label }}<template v-if="row.certification.code"> · {{ row.certification.code }}</template></template>
    <template #cell-sessions="{ row }">
      <template v-if="row.sessions.prochaine">{{ fmtDate(row.sessions.prochaine.start_date) }}<span class="muted"> · {{ t('gsms.formations.nAVenir', { n: row.sessions.a_venir }) }}</span></template>
      <span v-else class="muted">{{ t('gsms.formations.aucuneSessionAVenir') }}</span>
    </template>
    <template #cell-fiche="{ row }"><GsmsStatusTag :code="row.fiche" /></template>

    <template #card="{ item }">
      <router-link :to="`/platform/formations/${item.id}`" class="card">
        <div class="card-header">
          <div class="card-header-left head">
            <FormationThumb :image="item.image_url" :size="56" />
            <span class="title-text">
              <span class="card-title">{{ item.title }}</span>
              <span class="muted">{{ item.code }}</span>
              <span class="card-tags"><GsmsStatusTag :code="item.fiche" /></span>
            </span>
          </div>
        </div>
        <div class="card-bottom">
          <div class="card-meta">
            <span v-if="item.track_label"><t-icon name="folder" size="14px" />{{ item.track_label }}</span>
            <span><t-icon name="time" size="14px" />{{ hours(item.duration_hours) }}</span>
            <span><t-icon name="certificate" size="14px" />{{ item.certification.basis_label }}</span>
            <span><t-icon name="calendar-1" size="14px" />{{ item.sessions.prochaine ? fmtDate(item.sessions.prochaine.start_date) : t('gsms.formations.aucuneSessionAVenir') }}</span>
          </div>
        </div>
      </router-link>
    </template>
  </GsmsListPage>

  <ActionDialog v-model:visible="createVisible" :title="t('gsms.formations.nouvelle')" :confirm-label="t('gsms.formations.creer')"
    :intro="t('gsms.formations.nouvelleAide')"
    :fields="[{ name: 'code', label: t('gsms.formations.colCode') }, { name: 'title', label: t('gsms.formations.colIntitule') },
              { name: 'duration_hours', label: t('gsms.formations.dureeHeures'), type: 'number' }]"
    :run="(v) => createProgram(v)" @done="opened" />
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import GsmsListPage, { type ListColumn } from '@/components/gsms/GsmsListPage.vue'
import GsmsFilterTabs from '@/components/gsms/GsmsFilterTabs.vue'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import GsmsActionGate from '@/components/gsms/GsmsActionGate.vue'
import ActionDialog from '@/components/gsms/ActionDialog.vue'
import FormationThumb from './FormationThumb.vue'
import { createProgram, getCatalogue, type Catalogue } from '@/api/gsms/training'
import { fmtDate } from '@/components/gsms/format'
import { hours } from './display'

const { t } = useI18n()
const router = useRouter()
const data = ref<Catalogue | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const track = ref('all')
const query = ref('')
const createVisible = ref(false)

async function load() {
  loading.value = true
  error.value = null
  try {
    data.value = await getCatalogue()
  } catch (e) {
    error.value = e
    data.value = null
  } finally {
    loading.value = false
  }
}
onMounted(load)

const tabs = computed(() => [
  { value: 'all', label: t('gsms.commun.toutes'), count: data.value?.formations.length ?? 0 },
  ...(data.value?.filieres ?? []).map((f) => ({ value: f.value, label: f.label, count: f.count })),
])
const rows = computed(() => {
  const q = query.value.trim().toLowerCase()
  return data.value?.formations.filter((f) => (track.value === 'all' || f.track === track.value)
    && (!q || [f.code, f.title, f.track_label, f.certification.code].some((v) => v?.toLowerCase().includes(q)))) ?? null
})
const columns = computed<ListColumn[]>(() => [
  { colKey: 'title', title: t('gsms.formations.colFormation') },
  { colKey: 'track_label', title: t('gsms.formations.colFiliere'), width: 150 },
  { colKey: 'duree', title: t('gsms.formations.colDuree'), width: 90 },
  { colKey: 'certification', title: t('gsms.formations.colCertification') },
  { colKey: 'sessions', title: t('gsms.formations.colProchaineSession'), width: 200 },
  { colKey: 'fiche', title: t('gsms.formations.colFiche'), width: 130 },
])

function opened(created: unknown) {
  const id = (created as { id?: string } | null)?.id
  if (id) router.push(`/platform/formations/${id}`)
  else load()
}
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.search { .gsms-search(); }
.card { .gsms-card(); text-decoration: none; color: inherit; }
.muted { .gsms-muted(); }
.totals { margin: 0 0 12px; }
.title-cell { display: flex; align-items: center; gap: 10px; color: inherit; text-decoration: none; min-width: 0;
  &:hover .title-main { color: var(--td-brand-color); } }
.title-text { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.title-main { color: var(--td-text-color-primary); font-weight: 500; overflow-wrap: anywhere; }
.head { display: flex; align-items: flex-start; gap: 12px; min-width: 0; }
.card-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
</style>
