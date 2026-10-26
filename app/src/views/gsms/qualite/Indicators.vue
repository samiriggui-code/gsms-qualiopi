<template>
  <GsmsListPage :title="t('gsms.qualite.indicateurs.titre')" icon="chart-bar" :subtitle="t('gsms.qualite.indicateurs.sousTitre')"
    :items="view === 'indicateurs' ? null : rows" :loading="view === 'indicateurs' ? false : resultsPending" :error="view === 'indicateurs' ? null : error" :columns="columns" :row-to="(r) => `/platform/qualite/indicateurs/${r.numero}`"
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
      <!-- Indicateurs classés par critère, avec leur nom d'usage (nomenclature) ; numéro et libellé officiel conservés. -->
      <template v-if="view === 'indicateurs'">
        <div v-if="loading && !data" class="crit-list" aria-busy="true">
          <div v-for="n in 3" :key="n" class="crit is-skeleton"><t-skeleton animation="gradient" :row-col="[{ width: '40%' }, { width: '100%' }, { width: '80%' }]" /></div>
        </div>
        <GsmsRefusal v-else-if="error" :error="error">
          <t-button size="small" variant="outline" @click="load">{{ t('gsms.commun.reessayer') }}</t-button>
        </GsmsRefusal>
        <div v-else-if="data" class="crit-list">
          <section v-for="g in groups" :key="g.numero" class="crit" :aria-labelledby="`crit-${g.numero}`">
            <header class="crit-head">
              <span class="crit-num">{{ t('gsms.qualite.critere', { n: g.numero }) }}</span>
              <h2 :id="`crit-${g.numero}`" class="crit-title">{{ g.nom }}</h2>
              <span class="crit-score">{{ t('gsms.qualite.indicateurs.demontrablesSur', { n: g.demontrables, total: g.applicables }) }}</span>
            </header>
            <div class="crit-bar" role="img" :aria-label="t('gsms.qualite.indicateurs.demontrablesSur', { n: g.demontrables, total: g.applicables })">
              <span v-for="seg in g.segments" :key="seg.etat" :class="['seg', `tone-${seg.tone}`]" :style="{ flexGrow: seg.n }" />
            </div>
            <div class="ind-grid">
              <router-link v-for="i in g.items" :key="i.numero" :to="`/platform/qualite/indicateurs/${i.numero}`"
                :class="['ind', `tone-${stateTheme(i.etat)}`]">
                <div class="ind-top">
                  <span class="ind-num">{{ t('gsms.qualite.indicateurs.indCourt', { n: i.numero }) }}</span>
                  <GsmsStatusTag :code="i.etat" />
                </div>
                <span class="ind-name">{{ i.nom }}</span>
                <span v-if="i.libelle_officiel" class="ind-official" :title="i.libelle_officiel">{{ i.libelle_officiel }}</span>
                <span class="ind-meta">
                  <span><t-icon name="check-rectangle" size="13px" /> {{ t('gsms.qualite.indicateurs.nControles', { n: i.controles }) }}</span>
                  <span v-if="i.ecarts_ouverts" class="ind-gaps"><t-icon name="error-circle" size="13px" /> {{ t('gsms.qualite.indicateurs.nEcarts', { n: i.ecarts_ouverts }) }}</span>
                </span>
              </router-link>
            </div>
          </section>
          <GsmsEmptyState v-if="!groups.length" :title="t('gsms.commun.aucunDansEtat')" />
        </div>
      </template>
    </template>

    <template #cell-etat="{ row }"><GsmsStatusTag :code="row.etat" /></template>

    <template #card="{ item }">
      <router-link :to="`/platform/qualite/indicateurs/${item.numero}`" class="card">
        <div class="card-header">
          <div class="card-header-left"><span class="chip">ind. {{ item.numero }}</span><span class="card-title" :title="item.titre">{{ item.titre }}</span></div>
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
import GsmsEmptyState from '@/components/gsms/GsmsEmptyState.vue'
import { evaluateAll, getControlResults, getEvaluations, type ControlResult, type Evaluations } from '@/api/gsms/qualite'
import { fmtDateTime, stateLabel, stateTheme } from '@/components/gsms/format'

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

// Vue par critère : indicateurs de l'API filtrés par l'état choisi, regroupés par leur critère (aucun recalcul).
const groups = computed(() => {
  const list = (data.value?.indicateurs ?? []).filter((i) => state.value === 'all' || i.etat === state.value)
  const byCrit = new Map<number, typeof list>()
  for (const i of list) byCrit.set(i.critere, [...(byCrit.get(i.critere) ?? []), i])
  return [...byCrit.entries()].sort(([a], [b]) => a - b).map(([numero, items]) => {
    const applicables = items.filter((i) => i.etat !== 'NON_APPLICABLE')
    const counts = new Map<string, number>()
    for (const i of items) counts.set(i.etat, (counts.get(i.etat) ?? 0) + 1)
    return {
      numero, nom: items[0].critere_nom, items: [...items].sort((a, b) => a.numero - b.numero),
      demontrables: items.filter((i) => i.etat === 'DEMONTRABLE').length, applicables: applicables.length,
      segments: [...counts.entries()].sort(([a], [b]) => ORDER.indexOf(a) - ORDER.indexOf(b))
        .map(([etat, n]) => ({ etat, n, tone: stateTheme(etat) })),
    }
  })
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

.crit-list { display: flex; flex-direction: column; gap: 20px; margin-top: 8px; }
.crit { .gsms-panel(); padding: 18px 20px 20px; }
.crit.is-skeleton { min-height: 140px; }
.crit-head { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 12px; margin-bottom: 10px; }
.crit-num { font-size: var(--app-text-xs); font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--td-brand-color); }
.crit-title { margin: 0; flex: 1 1 auto; font-family: var(--app-font-family-display); font-size: var(--app-text-2xl); font-weight: 600; color: var(--td-text-color-primary); }
.crit-score { font-size: var(--app-text-sm); color: var(--td-text-color-secondary); }
.crit-bar { display: flex; gap: 2px; height: 6px; border-radius: 3px; overflow: hidden; margin-bottom: 16px; background: var(--td-bg-color-component); }
.seg { min-width: 6px; }
.tone-success { --tone: var(--td-success-color); }
.tone-warning { --tone: var(--td-warning-color); }
.tone-danger { --tone: var(--td-error-color); }
.tone-primary { --tone: var(--td-brand-color); }
.tone-default { --tone: var(--td-text-color-placeholder); }
.seg { background: var(--tone); }
.ind-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
.ind {
  .gsms-elevated();
  display: flex; flex-direction: column; gap: 6px; padding: 12px 14px 12px 16px; min-width: 0;
  background: var(--td-bg-color-container); border: 1px solid var(--td-component-stroke); border-left: 3px solid var(--tone);
  color: inherit; text-decoration: none; transition: border-color .15s, transform .15s;
  &:hover { border-color: var(--td-brand-color); border-left-color: var(--tone); transform: translateY(-1px); }
  &:focus-visible { outline: 2px solid var(--td-brand-color); outline-offset: 2px; }
}
.ind-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ind-num { font-size: var(--app-text-xs); font-weight: 600; color: var(--td-text-color-secondary); }
.ind-name { font-family: var(--app-font-family-display); font-size: var(--app-text-base); font-weight: 600; line-height: 1.3; color: var(--td-text-color-primary); }
.ind-official {
  font-size: var(--app-text-sm); line-height: 1.35; color: var(--td-text-color-secondary);
  display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.ind-meta { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: auto; padding-top: 4px; font-size: var(--app-text-sm); color: var(--td-text-color-secondary);
  .t-icon { vertical-align: -2px; } }
.ind-gaps { color: var(--td-error-color); }
@media (prefers-reduced-motion: reduce) { .ind { transition: none; &:hover { transform: none; } } }
</style>
