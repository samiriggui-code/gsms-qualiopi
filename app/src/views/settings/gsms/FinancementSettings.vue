<template>
  <div class="gsms-settings">
    <div class="section-header">
      <h2>{{ t('gsms.parametres.sections.financement') }}</h2>
      <p class="section-description">{{ t('gsms.parametres.financement.description') }}</p>
    </div>

    <GsmsFileNote file="backend/config/financement/dispositifs.yaml, regles.yaml" />
    <GsmsRefusal v-if="loadError" :error="loadError" inline />

    <div class="group-title">{{ t('gsms.parametres.financement.dispositifs') }}</div>
    <div class="table-frame">
      <t-table row-key="code" :data="schemes" :columns="schemeColumns" :loading="loading" size="medium"
        :empty="t('gsms.parametres.financement.aucunDispositif')">
        <template #libelle="{ row }">
          <div class="cell-main">{{ row.libelle }}</div>
          <div class="cell-sub">{{ row.financeur }} · {{ t('gsms.parametres.financement.payeur', { name: row.payeur }) }}<template v-if="row.prorata"> · {{ t('gsms.parametres.financement.prorata') }}</template></div>
        </template>
        <template #actions="{ row }">
          <ul class="steps">
            <li v-for="(label, key) in row.actions" :key="key">{{ label }}</li>
          </ul>
        </template>
      </t-table>
    </div>

    <div class="group-title">{{ t('gsms.parametres.financement.regles') }}</div>
    <p class="group-desc">{{ t('gsms.parametres.financement.reglesAide') }}</p>
    <div class="settings-group">
      <div v-for="r in rules" :key="r.key" class="setting-row">
        <div class="setting-info">
          <label>{{ t(`gsms.parametres.financement.cles.${r.key.replace(".", "_")}`) }}</label>
          <p class="desc">{{ r.error ? r.error : t('gsms.parametres.financement.depuis', { source: r.source, date: formatDate(r.since) }) }}</p>
        </div>
        <div class="setting-control">
          <span class="value-text">{{ r.error ? '—' : formatValue(r.value) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { getFundingRule, listFundingSchemes, type FundingScheme } from '@/api/gsms/funding'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import GsmsFileNote from './GsmsFileNote.vue'
import { refusalText } from '@/components/gsms/format'
import { fmtDate as formatDate } from '@/components/gsms/format'
import { formatValue } from './format'

// Clés déclarées dans backend/config/financement/regles.yaml (docs/API.md §3.6) : aucune route ne les liste.
const RULE_KEYS = ['cpf.participation_titulaire_eur', 'personnel.delai_retractation_jours', 'personnel.acompte_max_pourcent']
const { t } = useI18n()

const schemes = ref<FundingScheme[]>([])
const rules = ref<{ key: string; value?: unknown; since?: string; source?: string; error?: string }[]>([])
const loading = ref(true)
const loadError = ref<unknown>(null)

const schemeColumns = computed(() => [
  { colKey: 'libelle', title: t('gsms.parametres.financement.colDispositif'), minWidth: 240 },
  { colKey: 'actions', title: t('gsms.parametres.financement.colEtapes'), minWidth: 240 },
])

onMounted(async () => {
  try {
    schemes.value = await listFundingSchemes()
  } catch (err) {
    loadError.value = err
  } finally {
    loading.value = false
  }
  rules.value = await Promise.all(RULE_KEYS.map((key) =>
    getFundingRule(key).then((r) => ({ ...r }), (err) => ({ key, error: refusalText(err) }))))
})
</script>

<style lang="less" scoped>
@import (reference) './gsms-section.less';

.gsms-settings {
  .gsms-section();
}

.cell-main {
  color: var(--td-text-color-primary);
  font-weight: 500;
}

.cell-sub {
  color: var(--td-text-color-secondary);
  font-size: var(--app-text-sm);
}

.steps {
  margin: 0;
  padding-left: 18px;
  font-size: var(--app-text-sm);
  line-height: 1.6;
}
</style>
