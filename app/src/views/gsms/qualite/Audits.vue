<template>
  <GsmsListPage :title="t('gsms.qualite.audits.titre')" icon="fact-check" :subtitle="t('gsms.qualite.audits.sousTitre')"
    :items="data?.audits ?? null" :loading="loading" :error="error" :columns="columns" :row-to="(r) => `/platform/qualite/audits/${r.id}`"
    :empty-title="t('gsms.qualite.audits.aucun')" :empty-description="t('gsms.qualite.audits.aucunAide')" @retry="load">
    <template #actions>
      <GsmsActionGate v-if="data" :decision="data.capabilities.creer" @run="openCreate" />
    </template>
    <template #before>
      <p v-if="data" class="notice"><t-icon name="info-circle" size="14px" /> {{ data.avertissement }}</p>
    </template>

    <template #cell-statut="{ row }"><GsmsStatusTag :code="row.statut" :label="row.statut_libelle" /></template>
    <template #cell-progression="{ row }">{{ t('gsms.qualite.audits.progression', { n: row.progression.juges, total: row.progression.total }) }}</template>
    <template #cell-photo_le="{ row }">{{ fmtDate(row.photo_le) }}</template>

    <template #card="{ item }">
      <router-link :to="`/platform/qualite/audits/${item.id}`" class="card">
        <div class="card-header">
          <div class="card-header-left"><span class="card-title">{{ item.titre }}</span></div>
          <GsmsStatusTag :code="item.statut" :label="item.statut_libelle" />
        </div>
        <div class="card-content">
          <div class="bar" role="img" :aria-label="t('gsms.qualite.audits.progression', { n: item.progression.juges, total: item.progression.total })">
            <span :style="{ width: `${item.progression.total ? (100 * item.progression.juges) / item.progression.total : 0}%` }" />
          </div>
          <p class="muted">{{ t('gsms.qualite.audits.progression', { n: item.progression.juges, total: item.progression.total }) }}
            <template v-for="j in item.jugements.filter((x) => x.nombre)" :key="j.jugement"> · {{ j.libelle }} : {{ j.nombre }}</template>
          </p>
        </div>
        <div class="card-bottom"><div class="card-meta">
          <span>{{ item.reference }}</span><span>{{ item.type_libelle }}</span><span>{{ item.auditeur }}</span>
          <span>{{ t('gsms.qualite.audits.photoDu', { date: fmtDate(item.photo_le) }) }}</span>
        </div></div>
      </router-link>
    </template>
  </GsmsListPage>

  <ActionDialog v-model:visible="createVisible" :title="t('gsms.qualite.audits.nouveau')" :confirm-label="t('gsms.qualite.audits.ouvrir')"
    :fields="createFields" :intro="t('gsms.qualite.audits.photoAide')" :run="create" @done="created">
    <div class="sample">
      <p class="sample-title">{{ t('gsms.qualite.audits.echantillon') }}<span v-if="sample"> · {{ sample.periode.label }}</span></p>
      <GsmsRefusal v-if="sampleError" :error="sampleError" inline />
      <p v-else-if="sample && !sample.sessions.length" class="muted">{{ t('gsms.qualite.audits.aucuneSession') }}</p>
      <t-checkbox-group v-else-if="sample" v-model="chosen" class="sample-list">
        <t-checkbox v-for="s in sample.sessions" :key="s.id" :value="s.id">
          {{ s.reference }} · {{ fmtDate(s.du) }}<template v-if="s.proposee"> ({{ t('gsms.qualite.audits.proposee') }})</template>
        </t-checkbox>
      </t-checkbox-group>
    </div>
  </ActionDialog>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import GsmsListPage, { type ListColumn } from '@/components/gsms/GsmsListPage.vue'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import GsmsActionGate from '@/components/gsms/GsmsActionGate.vue'
import ActionDialog, { type ActionField } from '@/components/gsms/ActionDialog.vue'
import { getAuditSample, listAudits, openAudit, type AuditDetail, type AuditSample, type AuditSummary } from '@/api/gsms/qualite'
import type { Capabilities } from '@/api/gsms/common'
import { fmtDate } from '@/components/gsms/format'

const { t } = useI18n()
const router = useRouter()
const data = ref<{ audits: AuditSummary[]; capabilities: Capabilities; avertissement: string } | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const createVisible = ref(false)
const sample = ref<AuditSample | null>(null)
const sampleError = ref<unknown>(null)
const chosen = ref<string[]>([])

const columns = computed<ListColumn[]>(() => [
  { colKey: 'reference', title: t('gsms.qualite.preuves.colReference'), width: 120 },
  { colKey: 'titre', title: t('gsms.qualite.audits.colTitre'), link: true },
  { colKey: 'type_libelle', title: t('gsms.qualite.audits.colType') },
  { colKey: 'auditeur', title: t('gsms.qualite.audits.colAuditeur') },
  { colKey: 'photo_le', title: t('gsms.qualite.audits.colPhoto'), width: 120 },
  { colKey: 'progression', title: t('gsms.qualite.audits.colProgression') },
  { colKey: 'statut', title: t('gsms.qualite.indicateurs.colEtat'), width: 110 },
])

const createFields = computed<ActionField[]>(() => [
  { name: 'titre', label: t('gsms.qualite.audits.colTitre') },
  { name: 'type', label: t('gsms.qualite.audits.colType'), type: 'radio', initial: 'INTERNE',
    options: [{ value: 'INTERNE', label: t('gsms.qualite.audits.types.INTERNE') }, { value: 'BLANC', label: t('gsms.qualite.audits.types.BLANC') }] },
  { name: 'auditeur', label: t('gsms.qualite.audits.colAuditeur') },
  { name: 'prevu_le', label: t('gsms.qualite.audits.prevuLe'), type: 'date' },
])

async function load() {
  loading.value = true
  error.value = null
  try {
    data.value = await listAudits()
  } catch (e) {
    error.value = e
    data.value = null
  } finally {
    loading.value = false
  }
}
onMounted(load)

async function openCreate() {
  createVisible.value = true
  sampleError.value = null
  try {
    sample.value = await getAuditSample()
    chosen.value = sample.value.sessions.filter((s) => s.proposee).map((s) => s.id)
  } catch (e) {
    sampleError.value = e
  }
}

const create = (v: Record<string, any>) => openAudit({
  titre: v.titre ?? '', type: v.type ?? 'INTERNE', auditeur: v.auditeur ?? '', prevu_le: v.prevu_le || null,
  sessions: chosen.value.length ? chosen.value : null,
})
function created(result: unknown) {
  const audit = result as AuditDetail
  if (audit?.id) router.push(`/platform/qualite/audits/${audit.id}`)
  else load()
}
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.card { .gsms-card(); text-decoration: none; color: inherit; }
.muted { .gsms-muted(); margin: 4px 0 0; }
.notice { .gsms-notice(); }
.bar { height: 6px; border-radius: var(--app-radius-pill); background: var(--td-bg-color-secondarycontainer); overflow: hidden; span { display: block; height: 100%; background: var(--td-text-color-secondary); } }
.sample { margin-top: 4px; }
.sample-title { margin: 0 0 6px; font-size: var(--app-text-md); font-weight: 500; }
.sample-list { display: flex; flex-direction: column; gap: 4px; }
</style>
