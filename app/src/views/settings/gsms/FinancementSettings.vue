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
    <GsmsRefusal v-if="rulesError" :error="rulesError" inline />
    <div v-else class="settings-group">
      <div v-for="r in rules" :key="r.cle" class="setting-row">
        <div class="setting-info">
          <label>{{ r.description }}</label>
          <p class="desc">
            <code class="code">{{ r.cle }}</code> ·
            {{ r.en_vigueur
              ? t('gsms.parametres.financement.depuis', { source: r.en_vigueur.source, date: formatDate(r.en_vigueur.since) })
              : t('gsms.parametres.financement.aucuneEnVigueur') }}
          </p>
          <p v-for="v in later(r)" :key="v.depuis" class="desc">
            {{ t('gsms.parametres.financement.aVenir', { value: formatValue(v.valeur), date: formatDate(v.depuis), source: v.source }) }}
          </p>
        </div>
        <div class="setting-control">
          <span class="value-text">{{ r.en_vigueur ? formatValue(r.en_vigueur.value) : '—' }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { listFundingRules, listFundingSchemes, type FundingRule, type FundingScheme } from '@/api/gsms/funding'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import GsmsFileNote from './GsmsFileNote.vue'
import { fmtDate as formatDate } from '@/components/gsms/format'
import { formatValue } from './format'

const { t } = useI18n()

const schemes = ref<FundingScheme[]>([])
// Règles datées lues par GET /financement/regles (backend/config/financement/regles.yaml).
const rules = ref<FundingRule[]>([])
const rulesError = ref<unknown>(null)
/** Valeurs déjà datées qui prendront effet après la valeur en vigueur. */
const later = (r: FundingRule) => r.valeurs.filter((v) => v.depuis > (r.en_vigueur?.since ?? ''))
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
  try {
    rules.value = await listFundingRules()
  } catch (err) {
    rulesError.value = err
  }
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

.code {
  font-family: var(--app-font-family-mono);
  font-size: var(--app-text-sm);
}

.steps {
  margin: 0;
  padding-left: 18px;
  font-size: var(--app-text-sm);
  line-height: 1.6;
}
</style>
