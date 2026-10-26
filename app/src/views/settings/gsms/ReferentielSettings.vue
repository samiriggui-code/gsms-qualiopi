<template>
  <div class="gsms-settings">
    <div class="section-header">
      <div class="section-header__top">
        <h2>{{ t('gsms.parametres.sections.referentiel') }}</h2>
        <t-button v-if="tab === 'cycles' && canWrite" theme="primary" @click="openCycle">{{ t('gsms.parametres.referentiel.nouveauCycle') }}</t-button>
      </div>
      <p class="section-description">{{ t('gsms.parametres.referentiel.description') }}</p>
    </div>

    <t-tabs v-model="tab">
      <t-tab-panel value="versions" :label="t('gsms.parametres.referentiel.versions')" />
      <t-tab-panel value="indicateurs" :label="t('gsms.parametres.referentiel.indicateurs')" />
      <t-tab-panel value="cycles" :label="t('gsms.parametres.referentiel.cycles')" />
    </t-tabs>

    <GsmsRefusal v-if="loadError" :error="loadError" inline />

    <template v-if="tab === 'versions'">
      <GsmsFileNote file="backend/referentials/qualiopi/" :extra="t('gsms.parametres.referentiel.importNote')" />
      <div class="table-frame">
        <t-table row-key="id" :data="versions" :columns="versionColumns" :loading="loading" size="medium"
          :empty="t('gsms.parametres.referentiel.aucuneVersion')">
          <template #title="{ row }">
            <div class="cell-main">{{ row.title }}</div>
            <div class="cell-sub">{{ row.code }} {{ row.version }}<template v-if="row.source_label"> · {{ row.source_label }}</template></div>
          </template>
          <template #effective_from="{ row }">{{ formatDate(row.effective_from) }}</template>
          <template #is_active="{ row }">
            <t-tag size="small" variant="light" :theme="row.is_active ? 'success' : 'default'">
              {{ t(row.is_active ? 'gsms.parametres.referentiel.enVigueur' : 'gsms.parametres.referentiel.nonActive') }}
            </t-tag>
          </template>
        </t-table>
      </div>
      <p v-if="folders.length" class="meta">{{ t('gsms.parametres.referentiel.dossiersImportables', { list: folders.join(', ') }) }}</p>
    </template>

    <template v-else-if="tab === 'indicateurs'">
      <GsmsFileNote file="backend/referentials/qualiopi/, backend/config/qualiopi/nomenclature.yaml" />
      <GsmsRefusal v-if="indicatorsError" :error="indicatorsError" inline />
      <div class="table-frame">
        <t-table row-key="number" :data="indicators" :columns="indicatorColumns" :loading="loading" size="small"
          :empty="t('gsms.parametres.referentiel.aucunIndicateur')">
          <template #short_title="{ row }">
            <div class="cell-main">{{ row.code }} · {{ row.short_title }}</div>
            <div class="cell-sub">{{ t('gsms.parametres.referentiel.critere', { n: row.criterion_number, name: row.criterion_name }) }}</div>
          </template>
        </t-table>
      </div>
    </template>

    <template v-else>
      <GsmsRefusal v-if="cycleListError" :error="cycleListError" inline />
      <div class="table-frame">
        <t-table row-key="id" :data="cycles" :columns="cycleColumns" :loading="loading" size="medium"
          :empty="t('gsms.parametres.referentiel.aucunCycle')">
          <template #kind="{ row }">{{ kindLabel(row.kind) }}</template>
          <template #period="{ row }">{{ formatDate(row.period_start) }} → {{ formatDate(row.period_end) }}</template>
          <template #audit_on="{ row }">{{ formatDate(row.audit_on) }}</template>
        </t-table>
      </div>
      <p class="meta">{{ t('gsms.parametres.referentiel.cycleFige') }}</p>
    </template>

    <t-dialog v-model:visible="cycleVisible" :header="t('gsms.parametres.referentiel.nouveauCycleTitre')" width="600px" attach="body"
      dialog-class-name="gsms-dialog" :confirm-btn="{ content: t('gsms.parametres.commun.creer'), loading: saving }" :cancel-btn="t('gsms.parametres.commun.annuler')"
      @confirm="saveCycle">
      <div class="dialog-form">
        <GsmsRefusal v-if="dialogError" :error="dialogError" inline />
        <div class="field">
          <span class="field-label">{{ t('gsms.parametres.referentiel.libelle') }}</span>
          <t-input v-model="cycle.label" :placeholder="t('gsms.parametres.referentiel.libelleExemple')" />
        </div>
        <div class="field-grid">
          <div class="field">
            <span class="field-label">{{ t('gsms.parametres.referentiel.type') }}</span>
            <t-select :placeholder="t('gsms.parametres.commun.choisir')" v-model="cycle.kind" :options="kindOptions" />
          </div>
          <div class="field">
            <span class="field-label">{{ t('gsms.parametres.referentiel.certificateur') }}</span>
            <t-input :placeholder="t('gsms.parametres.commun.nonRenseigne')" v-model="cycle.certifier" />
          </div>
          <div class="field">
            <span class="field-label">{{ t('gsms.parametres.referentiel.debut') }}</span>
            <t-date-picker :placeholder="t('gsms.parametres.commun.date')" v-model="cycle.period_start" value-type="YYYY-MM-DD" format="DD/MM/YYYY" />
          </div>
          <div class="field">
            <span class="field-label">{{ t('gsms.parametres.referentiel.fin') }}</span>
            <t-date-picker :placeholder="t('gsms.parametres.commun.date')" v-model="cycle.period_end" value-type="YYYY-MM-DD" format="DD/MM/YYYY" clearable />
          </div>
          <div class="field">
            <span class="field-label">{{ t('gsms.parametres.referentiel.audit') }}</span>
            <t-date-picker :placeholder="t('gsms.parametres.commun.date')" v-model="cycle.audit_on" value-type="YYYY-MM-DD" format="DD/MM/YYYY" clearable />
          </div>
        </div>
        <div class="field">
          <span class="field-label">{{ t('gsms.parametres.referentiel.notes') }}</span>
          <t-textarea :placeholder="t('gsms.parametres.commun.nonRenseigne')" v-model="cycle.notes" :autosize="{ minRows: 2, maxRows: 5 }" />
        </div>
      </div>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { useI18n } from 'vue-i18n'
import {
  createCycle, listActiveIndicators, listCycles, listReferentials, type CertificationCycle, type CycleKind,
  type IndicatorSummary, type ReferentialVersion,
} from '@/api/gsms/qualiopi'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import GsmsFileNote from './GsmsFileNote.vue'
import { formatDate } from './format'
import { useGsmsAccessStore } from '@/stores/gsmsAccess'

const { t } = useI18n()
const access = useGsmsAccessStore()
const canWrite = computed(() => access.can('quality.write'))

const tab = ref<'versions' | 'indicateurs' | 'cycles'>('versions')
const versions = ref<ReferentialVersion[]>([])
const folders = ref<string[]>([])
const indicators = ref<IndicatorSummary[]>([])
const cycles = ref<CertificationCycle[]>([])
const loading = ref(true)
const loadError = ref<unknown>(null)
const cycleListError = ref<unknown>(null)
const indicatorsError = ref<unknown>(null)

const KINDS: CycleKind[] = ['INITIAL', 'SURVEILLANCE', 'RENOUVELLEMENT', 'INTERNE']
const kindLabel = (k: string) => (KINDS.includes(k as CycleKind) ? t(`gsms.parametres.referentiel.types.${k}`) : k)
const kindOptions = computed(() => KINDS.map((value) => ({ value, label: kindLabel(value) })))

const versionColumns = computed(() => [
  { colKey: 'title', title: t('gsms.parametres.referentiel.colVersion'), minWidth: 240 },
  { colKey: 'effective_from', title: t('gsms.parametres.referentiel.colVigueur'), width: 130 },
  { colKey: 'is_active', title: t('gsms.parametres.referentiel.colEtat'), width: 120 },
])
const indicatorColumns = computed(() => [
  { colKey: 'short_title', title: t('gsms.parametres.referentiel.colIndicateur'), minWidth: 260 },
  { colKey: 'scope', title: t('gsms.parametres.referentiel.colPortee'), width: 120 },
  { colKey: 'controls_count', title: t('gsms.parametres.referentiel.colControles'), width: 100 },
])
const cycleColumns = computed(() => [
  { colKey: 'label', title: t('gsms.parametres.referentiel.colCycle'), minWidth: 200 },
  { colKey: 'kind', title: t('gsms.parametres.referentiel.type'), width: 140 },
  { colKey: 'period', title: t('gsms.parametres.referentiel.colPeriode'), width: 220 },
  { colKey: 'audit_on', title: t('gsms.parametres.referentiel.colAudit'), width: 110 },
  { colKey: 'certifier', title: t('gsms.parametres.referentiel.certificateur'), width: 160, ellipsis: true },
])

async function load() {
  loadError.value = null
  try {
    const refs = await listReferentials()
    versions.value = refs.versions
    folders.value = refs.dossiers
  } catch (err) {
    loadError.value = err
  }
  try {
    indicators.value = await listActiveIndicators()
  } catch (err) {
    indicatorsError.value = err
  }
  try {
    cycles.value = await listCycles()
  } catch (err) {
    cycleListError.value = err
  }
  loading.value = false
}

const cycleVisible = ref(false)
const saving = ref(false)
const dialogError = ref<unknown>(null)
const cycle = reactive({
  label: '', kind: 'SURVEILLANCE' as CycleKind, period_start: '', period_end: '', audit_on: '', certifier: '', notes: '',
})
function openCycle() {
  Object.assign(cycle, { label: '', kind: 'SURVEILLANCE', period_start: '', period_end: '', audit_on: '', certifier: '', notes: '' })
  dialogError.value = null
  cycleVisible.value = true
}
async function saveCycle() {
  saving.value = true
  dialogError.value = null
  try {
    await createCycle({
      label: cycle.label.trim(), kind: cycle.kind, period_start: cycle.period_start,
      period_end: cycle.period_end || null, audit_on: cycle.audit_on || null,
      certifier: cycle.certifier.trim() || null, notes: cycle.notes.trim() || null,
    })
    cycles.value = await listCycles()
    cycleVisible.value = false
    MessagePlugin.success(t('gsms.parametres.referentiel.cycleCree'))
  } catch (err) {
    dialogError.value = err
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<style lang="less" scoped>
@import (reference) './gsms-section.less';
@import (reference) './gsms-dialog.less';

.gsms-settings {
  .gsms-section();
}

.dialog-form {
  .gsms-dialog-form();
}

.cell-main {
  color: var(--td-text-color-primary);
  font-weight: 500;
}

.cell-sub {
  color: var(--td-text-color-secondary);
  font-size: var(--app-text-sm);
}
</style>
