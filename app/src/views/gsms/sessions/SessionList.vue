<template>
  <GsmsListPage :title="t('gsms.sessions.titre')" icon="calendar-1" :subtitle="t('gsms.sessions.sousTitre')"
    :items="rows" :loading="loading" :error="error" :columns="columns" :row-to="(s) => `/platform/sessions/${s.id}`"
    :empty-title="sessions?.length ? t('gsms.commun.aucunResultat') : t('gsms.sessions.aucune')"
    :empty-description="sessions?.length ? t('gsms.commun.aucunResultatFiltres') : t('gsms.sessions.aucuneAide')" @retry="load">
    <template #toolbar>
      <GsmsFilterTabs v-model="status" :options="tabs" :label="t('gsms.commun.filtrerEtat')" />
      <t-input v-model="query" class="search" :placeholder="t('gsms.commun.rechercher')" :aria-label="t('gsms.commun.rechercher')" clearable>
        <template #prefix-icon><t-icon name="search" size="16px" /></template>
      </t-input>
    </template>

    <template #cell-program_title="{ row }">
      <span class="cell-media"><FormationThumb :image="row.program_image_url" :size="28" />{{ row.program_title || row.program_code || '—' }}</span>
    </template>
    <template #cell-trainer_name="{ row }">
      <span v-if="row.trainer_name" class="cell-media"><GsmsPersonAvatar :name="row.trainer_name" :photo="row.trainer_photo_url" :size="24" />{{ row.trainer_name }}</span>
      <template v-else>—</template>
    </template>
    <template #cell-dates="{ row }">{{ fmtDate(row.start_date) }} → {{ fmtDate(row.end_date) }}</template>
    <template #cell-status="{ row }"><GsmsStatusTag :code="row.status" /></template>
    <template #cell-inscrits="{ row }">{{ row.learners_count }}<template v-if="row.capacity"> / {{ row.capacity }}</template></template>

    <template #card="{ item }">
      <router-link :to="`/platform/sessions/${item.id}`" class="card">
        <div class="card-header">
          <div class="card-header-left head"><FormationThumb :image="item.program_image_url" :size="48" /><span class="card-title">{{ item.reference }}</span></div>
          <GsmsStatusTag :code="item.status" />
        </div>
        <div class="card-content"><p class="card-description">{{ item.program_title || item.program_code || '—' }}</p></div>
        <div class="card-bottom">
          <div class="card-meta">
            <span><t-icon name="time" size="14px" />{{ fmtDate(item.start_date) }} → {{ fmtDate(item.end_date) }}</span>
            <span v-if="item.location"><t-icon name="location" size="14px" />{{ item.location }}</span>
            <span v-if="item.trainer_name" class="meta-person"><GsmsPersonAvatar :name="item.trainer_name" :photo="item.trainer_photo_url" :size="18" />{{ item.trainer_name }}</span>
            <span><t-icon name="usergroup" size="14px" />{{ item.learners_count }}<template v-if="item.capacity"> / {{ item.capacity }}</template></span>
          </div>
        </div>
      </router-link>
    </template>
  </GsmsListPage>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import GsmsListPage, { type ListColumn } from '@/components/gsms/GsmsListPage.vue'
import GsmsFilterTabs from '@/components/gsms/GsmsFilterTabs.vue'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import GsmsPersonAvatar from '@/components/gsms/GsmsPersonAvatar.vue'
import FormationThumb from '@/views/gsms/formations/FormationThumb.vue'
import { listSessions, type SessionRow } from '@/api/gsms/sessions'
import { fmtDate, stateLabel } from '@/components/gsms/format'

const { t } = useI18n()
const sessions = ref<SessionRow[] | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const status = ref('all')
const query = ref('')

async function load() {
  loading.value = true
  error.value = null
  try {
    sessions.value = await listSessions()
  } catch (e) {
    error.value = e
    sessions.value = null
  } finally {
    loading.value = false
  }
}
onMounted(load)

const ORDER = ['PLANIFIEE', 'CONFIRMEE', 'EN_COURS', 'TERMINEE', 'CLOTUREE', 'ANNULEE']
const tabs = computed(() => {
  const list = sessions.value ?? []
  const present = [...new Set(list.map((s) => s.status))].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))
  return [{ value: 'all', label: t('gsms.commun.toutes'), count: list.length },
    ...present.map((code) => ({ value: code, label: stateLabel(code), count: list.filter((s) => s.status === code).length }))]
})
const rows = computed(() => {
  const q = query.value.trim().toLowerCase()
  return sessions.value?.filter((s) => (status.value === 'all' || s.status === status.value)
    && (!q || [s.reference, s.program_title, s.program_code, s.location, s.trainer_name].some((v) => v?.toLowerCase().includes(q)))) ?? null
})
const columns = computed<ListColumn[]>(() => [
  { colKey: 'reference', title: t('gsms.sessions.colReference'), link: true, width: 160 },
  { colKey: 'program_title', title: t('gsms.sessions.colFormation') },
  { colKey: 'dates', title: t('gsms.sessions.colDates'), width: 200 },
  { colKey: 'location', title: t('gsms.sessions.colLieu') },
  { colKey: 'trainer_name', title: t('gsms.sessions.colFormateur') },
  { colKey: 'inscrits', title: t('gsms.sessions.colInscrits'), width: 90 },
  { colKey: 'status', title: t('gsms.qualite.indicateurs.colEtat'), width: 120 },
])
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.search { .gsms-search(); }
.card { .gsms-card(); text-decoration: none; color: inherit; }
.head { display: flex; align-items: center; gap: 10px; min-width: 0; }
.cell-media, .meta-person { display: inline-flex; align-items: center; gap: 8px; min-width: 0; }
.meta-person { gap: 5px; }
</style>
