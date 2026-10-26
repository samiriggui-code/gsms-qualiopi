<template>
  <GsmsListPage :title="t('gsms.edof.titre')" icon="certificate" :subtitle="t('gsms.edof.sousTitre')"
    :items="rows" :loading="loading" :error="error" :columns="columns" row-key="program_id" :row-to="rowTo"
    :empty-title="t('gsms.formations.aucune')" :empty-description="t('gsms.formations.aucuneAide')" @retry="load">
    <template #toolbar>
      <t-input v-model="query" class="search" :placeholder="t('gsms.commun.rechercher')" :aria-label="t('gsms.commun.rechercher')" clearable>
        <template #prefix-icon><t-icon name="search" size="16px" /></template>
      </t-input>
    </template>

    <template v-if="view" #before>
      <p class="notice"><t-icon name="info-circle" size="16px" />{{ view.dossier.reminder }}</p>
      <GsmsRefusal v-if="actionError" :error="actionError" inline />
      <section class="panel establishment">
        <div class="panel-bar">
          <h3 class="title">{{ t('gsms.edof.etablissement') }}</h3>
          <GsmsStatusTag :code="view.dossier.display_status" :label="view.dossier.display_label" />
        </div>
        <dl class="kv">
          <div><dt>{{ t('gsms.edof.organisme') }}</dt><dd>{{ view.organization.name }}</dd></div>
          <div><dt>{{ t('gsms.edof.siret') }}</dt><dd>{{ view.organization.siret || '—' }}</dd></div>
          <div><dt>{{ t('gsms.edof.nda') }}</dt><dd>{{ view.organization.nda_number || '—' }}</dd></div>
          <div v-for="f in PROFILE" :key="f"><dt>{{ t(`gsms.parametres.edof.champs.${f}`) }}</dt><dd>{{ profileValue(f) }}</dd></div>
        </dl>
        <div class="counts">
          <span class="chip chip--danger">{{ t('gsms.edof.nBloquants', { n: view.dossier.counts.BLOQUANT ?? 0 }) }}</span>
          <span class="chip chip--warning">{{ t('gsms.edof.nAVerifier', { n: view.dossier.counts.A_VERIFIER ?? 0 }) }}</span>
        </div>
        <div class="links">
          <router-link :to="`/platform/edof/dossiers/${view.dossier.id}`" class="link">{{ t('gsms.edof.ouvrirDossierEtablissement') }}<t-icon name="chevron-right" size="14px" /></router-link>
          <router-link to="/platform/settings?section=gsms-edof" class="link">{{ t('gsms.edof.modifierProfil') }}<t-icon name="chevron-right" size="14px" /></router-link>
        </div>
      </section>
      <h3 class="section-title">{{ t('gsms.edof.parFormation') }}</h3>
    </template>

    <template #cell-title="{ row }"><span class="cell-title">{{ row.title }}</span><span class="muted"> · {{ row.code }}</span></template>
    <template #cell-dossier="{ row }">
      <GsmsStatusTag v-if="row.dossier" :code="row.dossier.display_status" :label="row.dossier.display_label" />
      <span v-else class="muted">{{ t('gsms.edof.aucunDossier') }}</span>
    </template>
    <template #cell-anomalies="{ row }">
      <span v-if="row.dossier" class="muted">{{ t('gsms.edof.nBloquants', { n: row.dossier.blocking }) }} · {{ t('gsms.edof.nAVerifier', { n: row.dossier.to_check }) }}</span>
    </template>
    <template #cell-action="{ row }">
      <router-link v-if="row.dossier" :to="`/platform/edof/dossiers/${row.dossier.id}`" class="link" @click.stop>{{ t('gsms.edof.ouvrirDossier') }}</router-link>
      <t-button v-else size="small" variant="outline" :loading="busy === row.program_id" @click.stop="create(row.program_id)">{{ t('gsms.edof.creerDossier') }}</t-button>
    </template>

    <template #card="{ item }">
      <div class="card">
        <div class="card-header">
          <div class="card-header-left"><span class="card-title">{{ item.title }}</span></div>
          <GsmsStatusTag v-if="item.dossier" :code="item.dossier.display_status" :label="item.dossier.display_label" />
        </div>
        <div class="card-bottom">
          <div class="card-meta">
            <span>{{ item.code }}</span>
            <span v-if="item.dossier">{{ t('gsms.edof.nBloquants', { n: item.dossier.blocking }) }} · {{ t('gsms.edof.nAVerifier', { n: item.dossier.to_check }) }}</span>
          </div>
          <router-link v-if="item.dossier" :to="`/platform/edof/dossiers/${item.dossier.id}`" class="link">{{ t('gsms.edof.ouvrirDossier') }}<t-icon name="chevron-right" size="14px" /></router-link>
          <t-button v-else size="small" variant="outline" :loading="busy === item.program_id" @click="create(item.program_id)">{{ t('gsms.edof.creerDossier') }}</t-button>
        </div>
      </div>
    </template>
  </GsmsListPage>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import GsmsListPage, { type ListColumn } from '@/components/gsms/GsmsListPage.vue'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import { createEdofFormationDossier, getEdofEstablishment, type EdofEstablishmentView, type EdofFormationLine } from '@/api/gsms/edof'
import { fmtDate } from '@/components/gsms/format'

const PROFILE = ['legal_form', 'structure_type', 'representative_name', 'qualiopi_certificate', 'qualiopi_valid_until', 'efp_connect_status'] as const
const DATES = new Set<string>(['qualiopi_valid_until'])

const { t, te } = useI18n()
const router = useRouter()
const view = ref<EdofEstablishmentView | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const actionError = ref<unknown>(null)
const busy = ref('')
const query = ref('')

async function load() {
  loading.value = true
  error.value = null
  try {
    view.value = await getEdofEstablishment()
  } catch (e) {
    error.value = e
    view.value = null
  } finally {
    loading.value = false
  }
}
onMounted(load)

const rows = computed(() => {
  const q = query.value.trim().toLowerCase()
  return view.value?.formations.filter((f) => !q || [f.code, f.title].some((v) => v?.toLowerCase().includes(q))) ?? null
})
const columns = computed<ListColumn[]>(() => [
  { colKey: 'title', title: t('gsms.formations.colFormation') },
  { colKey: 'dossier', title: t('gsms.edof.colDossier'), width: 220 },
  { colKey: 'anomalies', title: t('gsms.edof.colAnomalies'), width: 220 },
  { colKey: 'action', title: '', width: 160 },
])
const rowTo = (f: EdofFormationLine) => (f.dossier ? `/platform/edof/dossiers/${f.dossier.id}` : `/platform/formations/${f.program_id}`)

function profileValue(key: string): string {
  const v = view.value?.establishment[key]
  if (v === null || v === undefined || v === '') return '—'
  if (DATES.has(key)) return fmtDate(String(v))
  const label = `gsms.parametres.edof.valeurs.${String(v)}`
  return te(label) ? t(label) : String(v)
}

async function create(programId: string) {
  busy.value = programId
  actionError.value = null
  try {
    const d = await createEdofFormationDossier(programId)
    router.push(`/platform/edof/dossiers/${d.id}`)
  } catch (e) {
    actionError.value = e
  } finally {
    busy.value = ''
  }
}
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.search { .gsms-search(); }
.card { .gsms-card(); .card-bottom { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; } }
.panel { .gsms-panel(); }
.title { .gsms-panel-title(); margin: 0; }
.panel-bar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.establishment { margin-bottom: 16px; }
.kv { .gsms-kv(); }
.notice { .gsms-notice(); }
.muted { .gsms-muted(); }
.cell-title { font-weight: 500; color: var(--td-text-color-primary); }
.counts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.chip { .gsms-chip(); }
.chip--danger { color: var(--td-error-color); background: var(--td-error-color-light); }
.chip--warning { color: var(--td-warning-color); background: var(--td-warning-color-light); }
.links { display: flex; flex-wrap: wrap; gap: 8px 20px; margin-top: 12px; }
.link { display: inline-flex; align-items: center; gap: 4px; color: var(--td-brand-color); font-size: var(--app-text-sm); text-decoration: none; &:hover { text-decoration: underline; } }
.section-title { .gsms-panel-title(); margin: 0 0 10px; }
</style>
