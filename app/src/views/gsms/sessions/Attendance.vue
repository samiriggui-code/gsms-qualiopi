<template>
  <!-- Feuille d'une session -->
  <GsmsRecordSheet v-if="sessionId" :title="t('gsms.emargement.feuilleDe', { ref: current?.reference ?? '' })" icon="edit-1"
    back="/platform/emargement" :back-label="t('gsms.emargement.titre')" :subtitle="current?.program_title ?? ''"
    :ready="true" :error="error">
    <template v-if="current" #status><GsmsStatusTag :code="current.status" /></template>
    <template #actions>
      <router-link :to="`/platform/sessions/${sessionId}`" class="link">{{ t('gsms.emargement.ouvrirSession') }}</router-link>
    </template>
    <AttendanceSheetView :session-id="sessionId" />
  </GsmsRecordSheet>

  <!-- Liste des sessions -->
  <GsmsListPage v-else :title="t('gsms.emargement.titre')" icon="edit-1" :subtitle="t('gsms.emargement.sousTitre')"
    :items="rows" :loading="loading" :error="error" :columns="columns" :row-to="(s) => `/platform/emargement/${s.id}`"
    :empty-title="t('gsms.sessions.aucune')" @retry="load">
    <template #toolbar>
      <GsmsFilterTabs v-model="status" :options="tabs" :label="t('gsms.commun.filtrerEtat')" />
    </template>
    <template #cell-dates="{ row }">{{ fmtDate(row.start_date) }} → {{ fmtDate(row.end_date) }}</template>
    <template #cell-status="{ row }"><GsmsStatusTag :code="row.status" /></template>
    <template #card="{ item }">
      <router-link :to="`/platform/emargement/${item.id}`" class="card">
        <div class="card-header">
          <div class="card-header-left"><span class="card-title">{{ item.reference }}</span></div>
          <GsmsStatusTag :code="item.status" />
        </div>
        <div class="card-content"><p class="card-description">{{ item.program_title || '—' }}</p></div>
        <div class="card-meta"><span><t-icon name="time" size="14px" />{{ fmtDate(item.start_date) }} → {{ fmtDate(item.end_date) }}</span><span v-if="item.trainer_name">{{ item.trainer_name }}</span></div>
      </router-link>
    </template>
  </GsmsListPage>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import GsmsListPage, { type ListColumn } from '@/components/gsms/GsmsListPage.vue'
import GsmsRecordSheet from '@/components/gsms/GsmsRecordSheet.vue'
import GsmsFilterTabs from '@/components/gsms/GsmsFilterTabs.vue'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import AttendanceSheetView from '@/components/gsms/AttendanceSheetView.vue'
import { listSessions, type SessionRow } from '@/api/gsms/sessions'
import { fmtDate, stateLabel } from '@/components/gsms/format'

const { t } = useI18n()
const route = useRoute()
const sessionId = computed(() => String(route.params.sessionId || ''))
const sessions = ref<SessionRow[] | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const status = ref('EN_COURS')

async function load() {
  loading.value = true
  error.value = null
  try {
    sessions.value = await listSessions()
    if (!sessions.value.some((s) => s.status === 'EN_COURS')) status.value = 'all'
  } catch (e) {
    error.value = e
    sessions.value = null
  } finally {
    loading.value = false
  }
}
onMounted(load)

const current = computed(() => sessions.value?.find((s) => s.id === sessionId.value) ?? null)
const tabs = computed(() => {
  const list = sessions.value ?? []
  const present = [...new Set(list.map((s) => s.status))]
  return [{ value: 'all', label: t('gsms.commun.toutes'), count: list.length },
    ...present.map((code) => ({ value: code, label: stateLabel(code), count: list.filter((s) => s.status === code).length }))]
})
const rows = computed(() => sessions.value?.filter((s) => status.value === 'all' || s.status === status.value) ?? null)
const columns = computed<ListColumn[]>(() => [
  { colKey: 'reference', title: t('gsms.sessions.colReference'), link: true, width: 160 },
  { colKey: 'program_title', title: t('gsms.sessions.colFormation') },
  { colKey: 'dates', title: t('gsms.sessions.colDates'), width: 200 },
  { colKey: 'trainer_name', title: t('gsms.sessions.colFormateur') },
  { colKey: 'status', title: t('gsms.qualite.indicateurs.colEtat'), width: 120 },
])
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.card { .gsms-card(); text-decoration: none; color: inherit; }
.link { color: var(--td-brand-color); font-size: var(--app-text-sm); text-decoration: none; &:hover { text-decoration: underline; } }
</style>
