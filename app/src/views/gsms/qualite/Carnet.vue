<template>
  <GsmsListPage :title="t('gsms.qualite.carnet.titre')" icon="book-open" :subtitle="t('gsms.qualite.carnet.sousTitre')"
    :items="rows" :loading="loading" :error="error" :columns="columns" row-key="numero"
    :row-to="(r) => `/platform/qualite/indicateurs/${r.numero}`" :empty-title="t('gsms.commun.aucunResultat')" @retry="load">
    <template #actions>
      <t-button size="small" variant="outline" :loading="printing" @click="print">
        <template #icon><t-icon name="print" /></template>{{ t('gsms.qualite.carnet.imprimable') }}
      </t-button>
    </template>
    <template #toolbar>
      <GsmsFilterTabs v-model="state" :options="stateTabs" :label="t('gsms.commun.filtrerEtat')" />
      <t-input v-model="query" class="search" :placeholder="t('gsms.commun.rechercher')" :aria-label="t('gsms.commun.rechercher')" clearable>
        <template #prefix-icon><t-icon name="search" size="16px" /></template>
      </t-input>
    </template>
    <template #before>
      <template v-if="carnet">
        <p class="notice"><t-icon name="info-circle" size="14px" /> {{ carnet.avertissement }}</p>
        <p class="muted">
          {{ carnet.organisme.nom }}<template v-if="carnet.organisme.nda"> · NDA {{ carnet.organisme.nda }}</template>
          · {{ t('gsms.qualite.carnet.referentiel', { version: carnet.referentiel.version, date: fmtDate(carnet.referentiel.en_vigueur_le) }) }}
          <template v-if="carnet.prochaine_version"> · {{ t('gsms.qualite.carnet.prochaine', { version: carnet.prochaine_version.version, date: fmtDate(carnet.prochaine_version.en_vigueur_le) }) }}</template>
          · {{ t('gsms.qualite.carnet.editeLe', { date: fmtDate(carnet.edite_le) }) }}
        </p>
      </template>
    </template>

    <template #cell-nom="{ row }">
      <span class="cell-title">ind. {{ row.numero }} · {{ row.nom || row.titre }}</span>
      <span class="cell-sub">{{ row.critere.nom }}</span>
    </template>
    <template #cell-etat="{ row }"><GsmsStatusTag :code="row.etat" /></template>
    <template #cell-preuves="{ row }">{{ t('gsms.qualite.kpi.preuvesExploitables', { n: row.preuves.exploitables, total: row.preuves.total }) }}</template>
    <template #cell-ecarts="{ row }">{{ row.ecarts.length }}</template>

    <template #card="{ item }">
      <router-link :to="`/platform/qualite/indicateurs/${item.numero}`" class="card">
        <div class="card-header">
          <div class="card-header-left"><span class="chip">ind. {{ item.numero }}</span><span class="card-title" :title="item.titre">{{ item.nom || item.titre }}</span></div>
          <GsmsStatusTag :code="item.etat" />
        </div>
        <div class="card-content"><p class="card-description">{{ item.enonce }}</p></div>
        <div class="card-meta">
          <span>{{ t('gsms.qualite.kpi.preuvesExploitables', { n: item.preuves.exploitables, total: item.preuves.total }) }}</span>
          <span v-if="item.ecarts.length">{{ t('gsms.qualite.indicateurs.nEcarts', { n: item.ecarts.length }) }}</span>
        </div>
      </router-link>
    </template>
  </GsmsListPage>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { MessagePlugin } from 'tdesign-vue-next'
import GsmsListPage, { type ListColumn } from '@/components/gsms/GsmsListPage.vue'
import GsmsFilterTabs from '@/components/gsms/GsmsFilterTabs.vue'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import { downloadCarnet, getCarnet, type Carnet } from '@/api/gsms/qualite'
import { fmtDate, refusalText, stateLabel } from '@/components/gsms/format'

const { t } = useI18n()
const carnet = ref<Carnet | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const state = ref('all')
const query = ref('')
const printing = ref(false)

async function load() {
  loading.value = true
  error.value = null
  try {
    carnet.value = await getCarnet()
  } catch (e) {
    error.value = e
    carnet.value = null
  } finally {
    loading.value = false
  }
}
onMounted(load)

const ORDER = ['PREUVES_INSUFFISANTES', 'A_RISQUE', 'NON_EVALUABLE', 'NON_EVALUE', 'A_VENIR', 'DEMONTRABLE', 'NON_APPLICABLE']
const stateTabs = computed(() => {
  const fiches = carnet.value?.fiches ?? []
  const present = [...new Set(fiches.map((f) => f.etat))].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))
  return [{ value: 'all', label: t('gsms.commun.tous'), count: fiches.length },
    ...present.map((s) => ({ value: s, label: stateLabel(s), count: fiches.filter((f) => f.etat === s).length }))]
})
const rows = computed(() => {
  const q = query.value.trim().toLowerCase()
  return carnet.value?.fiches.filter((f) => (state.value === 'all' || f.etat === state.value)
    && (!q || [f.code, f.nom, f.titre, f.critere.nom, String(f.numero)].some((v) => v?.toLowerCase().includes(q)))) ?? null
})
const columns = computed<ListColumn[]>(() => [
  { colKey: 'nom', title: t('gsms.qualite.indicateurs.colIndicateur') },
  { colKey: 'etat', title: t('gsms.qualite.indicateurs.colEtat'), width: 170 },
  { colKey: 'preuves', title: t('gsms.qualite.fiche.preuvesOnglet') },
  { colKey: 'ecarts', title: t('gsms.qualite.indicateurs.colEcarts'), width: 90 },
])

/** Version imprimable (HTML A4 rendu par l'API) : enregistrée comme fichier, jamais injectée dans la page. */
async function print() {
  printing.value = true
  try {
    await downloadCarnet()
  } catch (e) {
    MessagePlugin.error(refusalText(e))
  } finally {
    printing.value = false
  }
}
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.search { .gsms-search(); }
.card { .gsms-card(); text-decoration: none; color: inherit; }
.chip { .gsms-chip(); flex-shrink: 0; }
.muted { .gsms-muted(); margin: 0 0 8px; }
.notice { .gsms-notice(); }
.cell-title { display: block; font-weight: 500; }
.cell-sub { display: block; color: var(--td-text-color-secondary); font-size: var(--app-text-sm); }
</style>
