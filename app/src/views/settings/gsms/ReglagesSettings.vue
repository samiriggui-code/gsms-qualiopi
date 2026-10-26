<template>
  <div class="gsms-settings">
    <div class="section-header">
      <h2>{{ t('gsms.parametres.sections.reglages') }}</h2>
      <p class="section-description">{{ t('gsms.parametres.reglages.description') }}</p>
    </div>

    <GsmsRefusal v-if="loadError" :error="loadError" inline />
    <div v-if="loading" class="state-block"><t-loading size="small" /></div>

    <template v-else-if="settings.length">
      <t-tabs v-model="domain" class="domain-tabs">
        <t-tab-panel v-for="d in domains" :key="d" :value="d" :label="domainLabel(d)" />
      </t-tabs>

      <div class="settings-group">
        <div v-for="s in visibleSettings" :key="s.key" class="setting-row">
          <div class="setting-info">
            <label>{{ s.label }}
              <t-tag v-if="s.regulatory" size="small" theme="warning" variant="light" class="reg-tag">{{ t('gsms.parametres.reglages.reglementaire') }}</t-tag>
            </label>
            <p v-if="s.help" class="desc">{{ s.help }}</p>
            <p class="meta">
              <code>{{ s.key }}</code> ·
              {{ s.since ? t('gsms.parametres.reglages.depuis', { date: formatDate(s.since) }) : t('gsms.parametres.reglages.parDefaut') }}
              <template v-if="s.next"> · {{ t('gsms.parametres.reglages.prochaine', { date: formatDate(s.next.from) }) }}
                <strong>{{ formatValue(s.next.value) }}</strong></template>
            </p>
          </div>
          <div class="setting-control control-col">
            <span class="value-text">{{ formatValue(s.value) }}</span>
            <div class="row-actions">
              <t-button size="small" variant="outline" @click="openEdit(s)">{{ t('gsms.parametres.reglages.changer') }}</t-button>
              <t-button size="small" variant="text" @click="openHistory(s)">{{ t('gsms.parametres.reglages.historique') }}</t-button>
            </div>
          </div>
        </div>
      </div>
    </template>
    <div v-else-if="!loadError" class="state-block">{{ t('gsms.parametres.reglages.aucun') }}</div>

    <!-- Nouvelle valeur datée -->
    <t-dialog v-model:visible="editVisible" :header="editing?.label" width="560px" :confirm-btn="{ content: t('gsms.parametres.commun.enregistrer'), loading: saving }"
      :cancel-btn="t('gsms.parametres.commun.annuler')" attach="body" dialog-class-name="gsms-dialog" @confirm="save">
      <div v-if="editing" class="dialog-form">
        <GsmsRefusal v-if="saveError" :error="saveError" inline />
        <p v-if="editing.help" class="dialog-help">{{ editing.help }}</p>
        <div class="field">
          <span class="field-label">{{ t('gsms.parametres.reglages.nouvelleValeur') }}</span>
          <SchemaField v-model="draft.value" :schema="editing.schema" />
          <span class="field-hint">{{ t('gsms.parametres.reglages.defaut', { value: formatValue(editing.default) }) }}</span>
        </div>
        <div class="field">
          <span class="field-label">{{ t('gsms.parametres.reglages.dateEffet') }}</span>
          <t-date-picker v-model="draft.from" value-type="YYYY-MM-DD" format="DD/MM/YYYY" :disable-date="isPast"
            clearable :placeholder="t('gsms.parametres.reglages.aujourdhui')" />
        </div>
        <div class="field">
          <span class="field-label">{{ t(editing.regulatory ? 'gsms.parametres.reglages.motifExige' : 'gsms.parametres.reglages.motifFacultatif') }}</span>
          <t-textarea :placeholder="t('gsms.parametres.commun.nonRenseigne')" v-model="draft.reason" :autosize="{ minRows: 2, maxRows: 5 }" :maxlength="500" />
        </div>
      </div>
    </t-dialog>

    <!-- Historique -->
    <t-dialog v-model:visible="historyVisible" :header="historyOf ? t('gsms.parametres.reglages.historiqueTitre', { label: historyOf.label }) : ''" width="720px"
      :footer="false" attach="body" dialog-class-name="gsms-dialog">
      <GsmsRefusal v-if="historyError" :error="historyError" inline />
      <div class="table-frame">
        <t-table row-key="at" :data="history" :columns="historyColumns" :loading="historyLoading" size="small"
          :empty="t('gsms.parametres.reglages.historiqueVide')">
          <template #value="{ row }">{{ formatValue(row.value) }}</template>
          <template #effective_from="{ row }">{{ formatDate(row.effective_from) }}</template>
          <template #at="{ row }">{{ formatDateTime(row.at) }}</template>
        </t-table>
      </div>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { useI18n } from 'vue-i18n'
import {
  changeSetting, listSettings, settingHistory, type SettingHistoryRow, type SettingView,
} from '@/api/gsms/platform'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import SchemaField from './SchemaField.vue'
import { formatDate, formatDateTime, formatValue, todayIso } from './format'

const { t, te } = useI18n()
const domainLabel = (d: string) => (te(`gsms.parametres.reglages.domaines.${d}`) ? t(`gsms.parametres.reglages.domaines.${d}`) : d)

const settings = ref<SettingView[]>([])
const loading = ref(true)
const loadError = ref<unknown>(null)
const domain = ref('')

const domains = computed(() => [...new Set(settings.value.map((s) => s.domain))])
const visibleSettings = computed(() => settings.value.filter((s) => s.domain === domain.value))
watch(domains, (list) => {
  if (!list.includes(domain.value)) domain.value = list[0] ?? ''
})

async function load() {
  loadError.value = null
  try {
    settings.value = await listSettings()
  } catch (err) {
    loadError.value = err
  } finally {
    loading.value = false
  }
}

// ── Modification ──
const editVisible = ref(false)
const editing = ref<SettingView | null>(null)
const saving = ref(false)
const saveError = ref<unknown>(null)
const draft = reactive<{ value: unknown; from: string; reason: string }>({ value: null, from: '', reason: '' })

const isPast = (d: Date) => {
  const day = new Date(d)
  day.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return day < today
}

function openEdit(s: SettingView) {
  editing.value = s
  draft.value = JSON.parse(JSON.stringify(s.next?.value ?? s.value ?? null))
  draft.from = todayIso()
  draft.reason = ''
  saveError.value = null
  editVisible.value = true
}

async function save() {
  if (!editing.value) return
  saving.value = true
  saveError.value = null
  try {
    const res = await changeSetting(editing.value.key, draft.value, draft.from || null, draft.reason.trim() || null)
    MessagePlugin.success(t('gsms.parametres.reglages.succes', { date: formatDate(res.effective_from) }))
    editVisible.value = false
    await load()
  } catch (err) {
    saveError.value = err
  } finally {
    saving.value = false
  }
}

// ── Historique ──
const historyVisible = ref(false)
const historyOf = ref<SettingView | null>(null)
const history = ref<SettingHistoryRow[]>([])
const historyLoading = ref(false)
const historyError = ref<unknown>(null)
const historyColumns = computed(() => [
  { colKey: 'value', title: t('gsms.parametres.reglages.colValeur'), minWidth: 160, ellipsis: true },
  { colKey: 'effective_from', title: t('gsms.parametres.reglages.colEffet'), width: 120 },
  { colKey: 'reason', title: t('gsms.parametres.reglages.colMotif'), minWidth: 160, ellipsis: true },
  { colKey: 'by', title: t('gsms.parametres.reglages.colPar'), width: 140, ellipsis: true },
  { colKey: 'at', title: t('gsms.parametres.reglages.colLe'), width: 160 },
])

async function openHistory(s: SettingView) {
  historyOf.value = s
  history.value = []
  historyError.value = null
  historyVisible.value = true
  historyLoading.value = true
  try {
    history.value = await settingHistory(s.key)
  } catch (err) {
    historyError.value = err
  } finally {
    historyLoading.value = false
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

.domain-tabs {
  margin-bottom: 4px;

  :deep(.t-tabs__nav-container) {
    overflow-x: auto;
  }
}

.reg-tag {
  margin-left: 6px;
  vertical-align: middle;
}

.gsms-settings .setting-control.control-col {
  flex-direction: column;
  align-items: flex-end;
  justify-content: flex-start;
  min-width: 200px;
  max-width: 40%;
}

.row-actions {
  display: flex;
  gap: 4px;
}

.meta code {
  font-family: var(--app-font-family-mono);
}

@media (max-width: 720px) {
  .gsms-settings .setting-control.control-col {
    min-width: 0;
    align-items: flex-start;
    max-width: 100%;
  }
}

.dialog-form {
  .gsms-dialog-form();
}
</style>
