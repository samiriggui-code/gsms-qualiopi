<template>
  <GsmsListPage :title="t('gsms.qualite.indicateurs.titre')" icon="chart-bar" :subtitle="t('gsms.qualite.indicateurs.sousTitre')"
    :items="rows" :loading="loading || resultsPending" :error="error" :columns="columns" :row-to="(r) => `/platform/qualite/indicateurs/${r.numero}`"
    row-key="key" :empty-title="t('gsms.commun.aucunDansEtat')" @retry="load">
    <template #actions>
      <GsmsActionGate v-if="data" :decision="data.capabilities.reevaluer" variant="outline" :pending="evaluating" @run="reevaluate" />
    </template>
    <template #toolbar>
      <GsmsFilterTabs v-model="view" :options="viewTabs" :label="t('gsms.commun.vue')" tabs />
      <GsmsFilterTabs v-model="state" :options="stateTabs" :label="t('gsms.commun.filtrerEtat')" />
    </template>
    <template #before>
      <GsmsRefusal v-if="actionError" :error="actionError" inline />
      <GsmsRefusal v-if="view === 'resultats' && resultsError" :error="resultsError" inline />
      <template v-if="data">
        <p class="notice"><t-icon name="info-circle" size="14px" /> {{ data.avertissement }}</p>
        <p class="muted">
          {{ data.referentiel }} · {{ data.periode.label }}
          <template v-if="data.derniere"> · {{ t('gsms.qualite.indicateurs.derniere', { le: fmtDateTime(data.derniere.fin || data.derniere.debut), par: data.derniere.declencheur }) }}</template>
        </p>
      </template>
    </template>

    <template #cell-etat="{ row }"><GsmsStatusTag :code="row.etat" /></template>

    <template #card="{ item }">
      <router-link :to="`/platform/qualite/indicateurs/${item.numero}`" class="card">
        <div class="card-header">
          <div class="card-header-left"><span class="chip">I{{ item.numero }}</span><span class="card-title" :title="item.titre">{{ item.titre }}</span></div>
          <GsmsStatusTag :code="item.etat" />
        </div>
        <div class="card-content"><p class="card-description">{{ item.detail }}</p></div>
        <div class="card-bottom"><div class="card-meta"><span>{{ item.meta }}</span></div></div>
      </router-link>
    </template>
  </GsmsListPage>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { MessagePlugin } from 'tdesign-vue-next'
import GsmsListPage, { type ListColumn } from '@/components/gsms/GsmsListPage.vue'
import GsmsFilterTabs from '@/components/gsms/GsmsFilterTabs.vue'
import GsmsActionGate from '@/components/gsms/GsmsActionGate.vue'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import { evaluateAll, getControlResults, getEvaluations, type ControlResult, type Evaluations } from '@/api/gsms/qualite'
import { fmtDateTime, stateLabel } from '@/components/gsms/format'

interface Row { key: string; numero: number; titre: string; etat: string; detail: string; meta: string; critere: string; controles: string; ecarts: string }

const { t } = useI18n()
const route = useRoute()
const data = ref<Evaluations | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const actionError = ref<unknown>(null)
const evaluating = ref(false)
const view = ref(route.query.vue === 'resultats' ? 'resultats' : 'indicateurs')
const state = ref(typeof route.query.etat === 'string' ? route.query.etat : 'all')
const results = ref<ControlResult[] | null>(null)
const resultsError = ref<unknown>(null)
const resultsPending = computed(() => view.value === 'resultats' && !results.value && !resultsError.value)

const viewTabs = computed(() => [
  { value: 'indicateurs', label: t('gsms.qualite.indicateurs.parIndicateur') },
  { value: 'resultats', label: t('gsms.qualite.indicateurs.resultats') },
])

async function load() {
  loading.value = true
  error.value = null
  try {
    data.value = await getEvaluations()
  } catch (e) {
    error.value = e
    data.value = null
  } finally {
    loading.value = false
  }
}
async function loadResults() {
  resultsError.value = null
  try {
    results.value = (await getControlResults()).resultats
  } catch (e) {
    resultsError.value = e
  }
}
onMounted(load)
watch(view, (v, old) => {
  if (old) state.value = 'all'
  if (v === 'resultats' && !results.value) loadResults()
}, { immediate: true })

const ORDER = ['PREUVES_INSUFFISANTES', 'A_RISQUE', 'NON_EVALUABLE', 'NON_EVALUE', 'DEMONTRABLE', 'NON_APPLICABLE']
const allRows = computed<Row[]>(() => {
  if (view.value === 'indicateurs') {
    return (data.value?.indicateurs ?? []).map((i) => ({
      key: `i${i.numero}`, numero: i.numero, titre: t('gsms.qualite.indicateur', { n: i.numero }), etat: i.etat,
      critere: `${i.critere} · ${i.critere_nom}`, detail: `${t('gsms.qualite.critere', { n: i.critere })} · ${i.critere_nom}`,
      controles: String(i.controles), ecarts: String(i.ecarts_ouverts),
      meta: [t('gsms.qualite.indicateurs.nControles', { n: i.controles }), i.ecarts_ouverts ? t('gsms.qualite.indicateurs.nEcarts', { n: i.ecarts_ouverts }) : '']
        .filter(Boolean).join(' · '),
    }))
  }
  return (results.value ?? []).map((r) => ({
    key: r.id, numero: r.indicateur, titre: r.libelle, etat: r.etat, critere: r.cible,
    detail: r.explication || r.constate || '—', controles: r.cible, ecarts: r.revue_humaine ? t('gsms.qualite.revueHumaine') : '',
    meta: [r.cible, r.revue_humaine ? t('gsms.qualite.revueHumaine') : ''].filter(Boolean).join(' · '),
  }))
})
// Avant la première réponse : null (squelette) ; le refus éventuel s'affiche à la place de la liste.
const rows = computed(() => {
  if (view.value === 'indicateurs' ? !data.value : !results.value) return null
  return allRows.value.filter((r) => state.value === 'all' || r.etat === state.value)
})

const columns = computed<ListColumn[]>(() => view.value === 'indicateurs'
  ? [
      { colKey: 'titre', title: t('gsms.qualite.indicateurs.colIndicateur'), link: true },
      { colKey: 'critere', title: t('gsms.qualite.indicateurs.colCritere') },
      { colKey: 'etat', title: t('gsms.qualite.indicateurs.colEtat') },
      { colKey: 'controles', title: t('gsms.qualite.indicateurs.colControles') },
      { colKey: 'ecarts', title: t('gsms.qualite.indicateurs.colEcarts') },
    ]
  : [
      { colKey: 'numero', title: 'N°' },
      { colKey: 'titre', title: t('gsms.qualite.indicateurs.colControle'), link: true },
      { colKey: 'critere', title: t('gsms.qualite.indicateurs.colCible') },
      { colKey: 'etat', title: t('gsms.qualite.indicateurs.colEtat') },
      { colKey: 'detail', title: t('gsms.qualite.indicateurs.colExplication') },
    ])

const stateTabs = computed(() => {
  const states = allRows.value.map((r) => r.etat)
  const present = [...new Set(states)].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))
  return [{ value: 'all', label: t('gsms.commun.tous'), count: states.length },
    ...present.map((s) => ({ value: s, label: stateLabel(s), count: states.filter((x) => x === s).length }))]
})

async function reevaluate() {
  evaluating.value = true
  actionError.value = null
  try {
    await evaluateAll()
    MessagePlugin.success(t('gsms.qualite.indicateurs.reevalue'))
    results.value = null
    await load()
    if (view.value === 'resultats') await loadResults()
  } catch (e) {
    actionError.value = e
  } finally {
    evaluating.value = false
  }
}
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.card { .gsms-card(); text-decoration: none; color: inherit; }
.chip { .gsms-chip(); flex-shrink: 0; }
.muted { .gsms-muted(); margin: 0 0 8px; }
.notice { .gsms-notice(); }
</style>
