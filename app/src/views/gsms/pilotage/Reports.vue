<template>
  <GsmsSectionLanding :title="t('gsms.bilans.titre')" icon="chart-pie" :description="t('gsms.bilans.sousTitre')"
    :kpis="kpis" :kpi-loading="kpiLoading" :modules="[]">
    <template #actions>
      <GsmsAskAssistant assistant="preparationAudit" :question="t('gsms.bilans.questions.synthese')" variant="base" size="medium" />
    </template>

    <template #charts>
      <div class="dash">
        <!-- Préparation Qualiopi : états calculés par le moteur, puis les mêmes états rangés par critère -->
        <template v-if="showQualite">
          <GsmsChartCard :title="t('gsms.bilans.synthese.preparation')" :subtitle="preparationSub" icon="chart-ring"
            :loading="loadingOf(evaluations)" :error="evaluations.error" more-to="/platform/qualite/indicateurs">
            <GsmsDonut :data="indicatorChart" :total="evaluations.data?.indicateurs.length" :total-label="t('gsms.qualite.kpi.indicateurs')" />
          </GsmsChartCard>
          <GsmsChartCard :title="t('gsms.bilans.synthese.parCritere')" :subtitle="t('gsms.bilans.synthese.parCritereSous')" icon="chart-stacked"
            :loading="loadingOf(evaluations)" :error="evaluations.error" more-to="/platform/qualite/indicateurs" class="span-2">
            <GsmsBarChart :caption="t('gsms.bilans.synthese.parCritere')" :categories="criteria.categories" :series="criteria.series"
              :links="criteria.links" horizontal />
          </GsmsChartCard>
        </template>

        <!-- Activité : inscriptions par état et étapes du parcours (GET /parcours/synthese) -->
        <template v-if="showParcours">
          <GsmsChartCard :title="t('gsms.graphiques.ecole.inscriptions')" :subtitle="t('gsms.bilans.synthese.inscriptionsSous')" icon="chart-ring"
            :loading="loadingOf(journey)" :error="journey.error" more-to="/platform/parcours/inscriptions">
            <GsmsDonut :data="enrollmentChart" :total="sum(journey.data?.inscriptions)" :total-label="t('gsms.bilans.apercu.inscriptions')" />
          </GsmsChartCard>
          <GsmsChartCard :title="t('gsms.graphiques.ecole.etapes')" :subtitle="t('gsms.graphiques.ecole.etapesSous')" icon="chart-bar"
            :loading="loadingOf(journey)" :error="journey.error" more-to="/platform/parcours/inscriptions" class="span-2">
            <GsmsBarChart :caption="t('gsms.graphiques.ecole.etapes')" :categories="stepChart.categories" :series="stepChart.series"
              :links="stepChart.links" horizontal />
            <template v-if="journey.data" #note>
              {{ t('gsms.bilans.synthese.examens', { reussis: journey.data.examens.reussis, presentes: journey.data.examens.presentes }) }}
            </template>
          </GsmsChartCard>
        </template>

        <!-- Résultats pédagogiques : taux mesurés par l'API (null = non mesuré, jamais 0) -->
        <template v-if="showResults">
          <GsmsChartCard id="resultats" :title="t('gsms.bilans.resultats.titre')"
            :subtitle="t('gsms.bilans.resultats.sous', { n: RESULTS_MONTHS })" icon="chart-column"
            :loading="loadingOf(results)" :error="results.error" :empty="!formationChart.rows.length"
            :empty-text="t('gsms.bilans.resultats.aucune')" class="span-2">
            <GsmsBarChart :caption="t('gsms.bilans.resultats.titre')" :categories="formationChart.categories" :series="formationChart.series"
              :max="100" :format="pct" grouped horizontal />
            <div class="table-toggle">
              <t-button variant="text" theme="primary" size="small" :aria-expanded="showTable" aria-controls="resultats-table" @click="showTable = !showTable">
                <template #icon><t-icon :name="showTable ? 'chevron-up' : 'table'" /></template>
                {{ showTable ? t('gsms.bilans.resultats.masquerTableau') : t('gsms.bilans.resultats.voirTableau') }}
              </t-button>
              <GsmsAskAssistant assistant="resultats" :question="t('gsms.bilans.questions.resultats')" variant="text" />
            </div>
            <div v-if="showTable" id="resultats-table" class="table-wrap">
              <table class="rtable">
                <caption class="sr-only">{{ t('gsms.bilans.resultats.titre') }}</caption>
                <thead>
                  <tr>
                    <th scope="col">{{ t('gsms.bilans.resultats.formation') }}</th>
                    <th scope="col" class="num">{{ t('gsms.bilans.apercu.sessions') }}</th>
                    <th scope="col" class="num">{{ t('gsms.bilans.apercu.stagiaires') }}</th>
                    <th scope="col" class="num">{{ t('gsms.graphiques.ecole.reussite') }}</th>
                    <th scope="col" class="num">{{ t('gsms.graphiques.ecole.satisfaction') }}</th>
                    <th scope="col" class="num">{{ t('gsms.graphiques.ecole.abandon') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="f in formationChart.rows" :key="f.id">
                    <th scope="row"><router-link :to="`/platform/formations/${f.id}`">{{ f.title }}</router-link></th>
                    <td class="num">{{ f.mesure!.sessions }}</td>
                    <td class="num">{{ f.mesure!.stagiaires }}</td>
                    <td class="num">{{ rate(f.mesure!.taux_reussite) }}</td>
                    <td class="num">{{ rate(f.mesure!.taux_satisfaction) }}</td>
                    <td class="num">{{ rate(f.mesure!.taux_abandon) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </GsmsChartCard>
          <GsmsChartCard :title="t('gsms.bilans.resultats.ensemble')" :subtitle="resultsSub" icon="chart-bar"
            :loading="loadingOf(results)" :error="results.error" :empty="!totalsChart.length" :empty-text="t('gsms.bilans.resultats.aucune')">
            <GsmsBarChart :caption="t('gsms.bilans.resultats.ensemble')" :data="totalsChart" :max="100" :format="pct" horizontal />
            <template v-if="results.data && missingRates.length" #note>{{ t('gsms.bilans.resultats.nonMesures', { liste: missingRates.join(', ') }) }}</template>
          </GsmsChartCard>
        </template>

        <!-- Écarts et actions correctives (GET /qualiopi/actions) -->
        <GsmsChartCard v-if="showQualite" :title="t('gsms.bilans.synthese.actions')" :subtitle="t('gsms.bilans.synthese.actionsSous')" icon="task-checked"
          :loading="loadingOf(capa)" :error="capa.error" :empty="!capa.data?.length" :empty-text="t('gsms.bilans.synthese.aucuneAction')"
          more-to="/platform/qualite/constats?onglet=actions" :class="{ 'span-3': !showFinances }">
          <GsmsDonut :data="capaChart" :total="capa.data?.length" :total-label="t('gsms.bilans.synthese.actionsTotal')" />
          <template v-if="capa.data" #note>{{ t('gsms.bilans.synthese.actionsEnRetard', { n: capaLate }) }}</template>
        </GsmsChartCard>

        <!-- Finances : seulement avec le droit de lecture des factures ; module coupé = refus de l'API affiché -->
        <GsmsChartCard v-if="showFinances" :title="t('gsms.bilans.synthese.finances')" :subtitle="t('gsms.bilans.synthese.financesSous')" icon="wallet"
          :loading="loadingOf(invoices)" :error="invoices.error" more-to="/platform/factures" :class="showQualite ? 'span-2' : 'span-3'">
          <GsmsBarChart :caption="t('gsms.bilans.synthese.finances')" :data="financeChart" :format="centimes" horizontal />
          <template v-if="invoices.data" #note>{{ t('gsms.bilans.synthese.brouillons', { n: invoices.data.brouillons }) }}</template>
        </GsmsChartCard>
      </div>
    </template>

    <template #body>
      <!-- Bibliothèque : un rapport par entrée de GET /bilans ; l'accès est décidé par l'API -->
      <section class="library" aria-labelledby="library-title">
        <header class="library-head">
          <span class="library-icon" aria-hidden="true"><t-icon name="root-list" size="18px" /></span>
          <div class="library-titles">
            <h2 id="library-title">{{ t('gsms.bilans.bibliotheque') }}</h2>
            <p class="muted">{{ t('gsms.bilans.bibliothequeSous') }}</p>
          </div>
          <GsmsFilterTabs v-if="reports.data" v-model="filter" :options="filterTabs" :label="t('gsms.bilans.filtrer')" />
        </header>
        <div v-if="loadingOf(reports)" class="lib-grid">
          <div v-for="n in 6" :key="n" class="report is-skeleton"><t-skeleton animation="gradient" :row-col="[{ width: '60%' }, { width: '100%' }, { width: '40%' }]" /></div>
        </div>
        <GsmsRefusal v-else-if="reports.error" :error="reports.error">
          <t-button size="small" variant="outline" @click="reloadReports">{{ t('gsms.commun.reessayer') }}</t-button>
        </GsmsRefusal>
        <div v-else class="lib-grid">
          <component :is="r.disponible ? 'button' : 'div'" v-for="r in shownReports" :key="r.code" :type="r.disponible ? 'button' : undefined"
            :class="['report', { 'report--locked': !r.disponible }]" @click="r.disponible && openReport(r)">
            <span class="report-icon" aria-hidden="true"><t-icon :name="reportIcon(r.code)" size="20px" /></span>
            <span class="report-body">
              <span class="report-title">{{ r.intitule }}</span>
              <span class="report-tags">
                <span class="report-nature"><t-icon :name="natureIcon(r.nature)" size="13px" aria-hidden="true" />{{ natureLabel(r.nature) }}</span>
                <t-tag :theme="r.disponible ? 'success' : 'default'" variant="light" size="small">
                  {{ r.disponible ? t('gsms.bilans.disponible') : t('gsms.bilans.nonDisponible') }}
                </t-tag>
              </span>
              <span v-if="!r.disponible" class="report-perms">
                {{ t('gsms.bilans.droits') }} <code v-for="p in r.permissions" :key="p" class="chip">{{ p }}</code>
              </span>
              <span v-else class="report-open">{{ t('gsms.bilans.apercuOuvrir') }}<t-icon name="chevron-right" size="14px" aria-hidden="true" /></span>
            </span>
          </component>
          <GsmsEmptyState v-if="!shownReports.length" :title="t('gsms.bilans.aucun')" />
        </div>
      </section>
    </template>
  </GsmsSectionLanding>

  <t-drawer v-model:visible="drawerVisible" :header="selected?.intitule || ''" size="min(600px, 100vw)" attach="body" :footer="false"
    :close-btn="true" destroy-on-close>
    <ReportPreview v-if="selected" :report="selected" :page="pageOf(selected.code)" />
  </t-drawer>
</template>

<script setup lang="ts">
/**
 * Bilans et rapports : la page de synthèse de l'organisme, à ouvrir avant un audit ou un comité de direction.
 * En haut, les chiffres et graphiques des routes de synthèse de l'API (moteur Qualiopi, parcours, résultats, actions
 * correctives, factures), chacun chargé seulement si GET /bootstrap ouvre le droit au compte ; puis la bibliothèque
 * de GET /bilans, avec un aperçu de chaque rapport dans un panneau latéral. Aucun calcul métier : les lignes de l'API
 * sont seulement comptées par l'état qu'elle leur a donné ; une donnée absente est dite absente.
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import GsmsSectionLanding from '@/components/gsms/GsmsSectionLanding.vue'
import GsmsChartCard from '@/components/gsms/GsmsChartCard.vue'
import GsmsDonut from '@/components/gsms/GsmsDonut.vue'
import GsmsBarChart from '@/components/gsms/GsmsBarChart.vue'
import GsmsFilterTabs from '@/components/gsms/GsmsFilterTabs.vue'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import GsmsEmptyState from '@/components/gsms/GsmsEmptyState.vue'
import GsmsAskAssistant from '@/components/gsms/GsmsAskAssistant.vue'
import ReportPreview from './ReportPreview.vue'
import { countBy, fromCounts, type ChartDatum, type ChartTone } from '@/components/gsms/chartTheme'
import { useApiSource, type ApiSource } from '@/components/gsms/useApiSource'
import { stateLabel, stepLabel } from '@/components/gsms/format'
import type { KpiItem } from '@/components/gsms/types'
import { useGsmsAccessStore } from '@/stores/gsmsAccess'
import { getReports, type ReportEntry } from '@/api/gsms/pilotage'
import { getEvaluations, listCapa, listOpenGaps } from '@/api/gsms/qualite'
import { getJourneySummary } from '@/api/gsms/journey'
import { getResults } from '@/api/gsms/training'
import { getInvoiceOverview } from '@/api/gsms/invoicing'
import { centimes } from '@/views/gsms/finances/display'
import { INDICATOR_STATES, criterionChart, pct, resultsChart } from './reportCharts'

const { t, te } = useI18n()
const router = useRouter()
const access = useGsmsAccessStore()
const RESULTS_MONTHS = 12

// Droits lus dans GET /bootstrap : une carte dont le compte n'a pas le droit n'est ni chargée ni montrée.
const showQualite = computed(() => access.can('quality.read'))
const showParcours = computed(() => access.can('sessions.read') || access.can('sessions.read_own'))
const showResults = computed(() => access.can('sessions.read') || access.can('quality.read'))
const showFinances = computed(() => access.can('invoices.read'))
const gated = <T,>(allowed: () => boolean, load: () => Promise<T>) => async () => {
  await access.load()
  return allowed() ? load() : null
}
const evaluations = useApiSource(gated(() => showQualite.value, getEvaluations)).state
const gaps = useApiSource(gated(() => showQualite.value, listOpenGaps)).state
const capa = useApiSource(gated(() => showQualite.value, listCapa)).state
const journey = useApiSource(gated(() => showParcours.value, getJourneySummary)).state
const results = useApiSource(gated(() => showResults.value, () => getResults(RESULTS_MONTHS))).state
const invoices = useApiSource(gated(() => showFinances.value, getInvoiceOverview)).state
const { state: reports, run: reloadReports } = useApiSource(getReports)

const loadingOf = (s: ApiSource<unknown>) => s.loading || (!s.data && !s.error)
const sum = (o: Record<string, number> | undefined) => Object.values(o ?? {}).reduce((a, b) => a + b, 0)
/** Une valeur d'une source refusée s'affiche « — », jamais 0. */
const shown = (s: ApiSource<unknown>, v: string | number | undefined | null) => (s.error ? '—' : v ?? '—')
const rate = (v: number | null) => (v === null ? t('gsms.bilans.nonMesure') : pct(v))

// ── Chiffres clés ───────────────────────────────────────────────────────────────
const indicators = computed(() => evaluations.data?.indicateurs ?? [])
const demonstrable = computed(() => indicators.value.filter((i) => i.etat === 'DEMONTRABLE').length)
const applicable = computed(() => indicators.value.filter((i) => i.etat !== 'NON_APPLICABLE').length)
const capaLate = computed(() => (capa.data ?? []).filter((c) => c.en_retard).length)
const kpiLoading = computed(() => [
  showQualite.value && loadingOf(evaluations), showResults.value && loadingOf(results),
].some(Boolean))
const kpis = computed<KpiItem[]>(() => [
  ...(showQualite.value ? [
    { key: 'demontrables', label: t('gsms.bilans.kpi.demontrables'), icon: 'secured', to: '/platform/qualite/indicateurs?etat=DEMONTRABLE',
      value: shown(evaluations, evaluations.data ? `${demonstrable.value} / ${applicable.value}` : null),
      subtitle: t('gsms.bilans.kpi.demontrablesSous'),
      meter: evaluations.data && applicable.value ? { value: demonstrable.value, max: applicable.value } : undefined },
    { key: 'ecarts', label: t('gsms.bilans.kpi.ecarts'), icon: 'error-circle', tone: 'danger' as const, to: '/platform/qualite/constats',
      value: shown(gaps, gaps.data?.length), subtitle: t('gsms.bilans.kpi.ecartsSous') },
    { key: 'actions', label: t('gsms.bilans.kpi.actionsEnRetard'), icon: 'time', tone: 'warning' as const, to: '/platform/qualite/constats?onglet=actions',
      value: shown(capa, capa.data ? capaLate.value : null), subtitle: capa.data ? t('gsms.bilans.kpi.surActions', { n: capa.data.length }) : undefined },
  ] : []),
  ...(showResults.value ? [
    { key: 'sessions', label: t('gsms.bilans.kpi.sessions'), icon: 'calendar-1',
      value: shown(results, results.data?.totaux.sessions),
      subtitle: results.data ? t('gsms.bilans.kpi.stagiaires', { n: results.data.totaux.stagiaires, mois: RESULTS_MONTHS }) : undefined },
    { key: 'reussite', label: t('gsms.graphiques.ecole.reussite'), icon: 'chart-analytics', tone: 'success' as const,
      value: shown(results, results.data ? rate(results.data.totaux.taux_reussite) : null),
      subtitle: results.data ? t('gsms.bilans.kpi.examines', { n: results.data.totaux.examines }) : undefined },
  ] : []),
])

// ── Graphiques ─────────────────────────────────────────────────────────────────
const INDICATOR_TONES = Object.fromEntries(INDICATOR_STATES) as Record<string, ChartTone>
const indicatorChart = computed(() => fromCounts(countBy(indicators.value, (i) => i.etat), INDICATOR_STATES.map(([s]) => s), stateLabel,
  (etat) => `/platform/qualite/indicateurs?etat=${etat}`, INDICATOR_TONES))
const preparationSub = computed(() => (evaluations.data
  ? t('gsms.bilans.synthese.preparationSous', { n: demonstrable.value, total: applicable.value, ref: evaluations.data.referentiel })
  : t('gsms.graphiques.indicateursSous')))
const criteria = computed(() => criterionChart(indicators.value.map((i) => ({ critere: i.critere, critereNom: i.critere_nom, etat: i.etat })),
  (n, nom) => `${n} · ${nom}`))

const STEP_STATES: [string, ChartTone][] = [['FAIT', 'success'], ['A_ECHEANCE', 'warning'], ['EN_RETARD', 'danger'], ['A_VENIR', 'info'], ['SANS_OBJET', 'neutral']]
const stepChart = computed(() => {
  const etapes = journey.data?.etapes ?? {}
  const steps = Object.keys(etapes)
  return {
    categories: steps.map(stepLabel),
    links: steps.map((s) => `/platform/parcours/${s}`),
    series: STEP_STATES.map(([etat, tone]) => ({ key: etat, label: stateLabel(etat), tone, values: steps.map((s) => etapes[s]?.[etat] ?? 0) })),
  }
})
const enrollmentChart = computed(() => fromCounts(journey.data?.inscriptions ?? {}, ['INSCRIT', 'CONFIRME', 'TERMINE', 'ABANDON', 'ANNULE'],
  stateLabel, () => '/platform/parcours/inscriptions', { INSCRIT: 'info', ANNULE: 'neutral' }))

const showTable = ref(false)
const formationChart = computed(() => resultsChart(results.data?.formations ?? [], {
  reussite: t('gsms.graphiques.ecole.reussite'), satisfaction: t('gsms.graphiques.ecole.satisfaction'), abandon: t('gsms.graphiques.ecole.abandon'),
}))
const RATES = [['reussite', 'taux_reussite', 'success'], ['satisfaction', 'taux_satisfaction', 'brand'], ['abandon', 'taux_abandon', 'danger']] as const
const totalsChart = computed<ChartDatum[]>(() => {
  const totals = results.data?.totaux
  if (!totals) return []
  return RATES.filter(([, k]) => totals[k] !== null)
    .map(([key, k, tone]) => ({ key, label: t(`gsms.graphiques.ecole.${key}`), value: totals[k] as number, tone }))
})
const missingRates = computed(() => {
  const totals = results.data?.totaux
  return totals ? RATES.filter(([, k]) => totals[k] === null).map(([key]) => t(`gsms.graphiques.ecole.${key}`)) : []
})
const resultsSub = computed(() => (results.data
  ? t('gsms.bilans.resultats.ensembleSous', { sessions: results.data.totaux.sessions, formations: results.data.formations_mesurees })
  : t('gsms.bilans.resultats.sous', { n: RESULTS_MONTHS })))

// Actions correctives par statut, avec le libellé que l'API donne à chaque statut.
const capaChart = computed(() => {
  const rows = capa.data ?? []
  const labels = Object.fromEntries(rows.map((c) => [c.statut, c.statut_libelle || stateLabel(c.statut)]))
  return fromCounts(countBy(rows, (c) => c.statut), [], (code) => labels[code] ?? code)
})

const financeChart = computed<ChartDatum[]>(() => {
  const f = invoices.data
  if (!f) return []
  return [
    { key: 'a_encaisser', label: t('gsms.bilans.synthese.aEncaisser'), value: f.a_encaisser_centimes, tone: 'brand' },
    { key: 'en_retard', label: t('gsms.bilans.synthese.enRetard'), value: f.en_retard_centimes, tone: 'danger', to: '/platform/factures' },
    { key: 'encaisse', label: t('gsms.bilans.synthese.encaisseMois'), value: f.encaisse_ce_mois_centimes, tone: 'success' },
  ]
})

// ── Bibliothèque des rapports ──────────────────────────────────────────────────
/** Rapport de l'API → page de cette application qui l'affiche en entier. */
const PAGES: Record<string, string> = {
  carnet_qualiopi: 'gsmsCarnet',
  carnet_impression: 'gsmsCarnet',
  etat_indicateurs: 'gsmsIndicateurs',
  feuille_de_route: 'gsmsPilotage',
  synthese_parcours: 'gsmsParcours',
  evaluations_acquis: 'gsmsEvaluations',
  resultats_formations: 'gsmsEcole',
  synthese_documents: 'gsmsDevis',
  aide_bpf: 'gsmsBpf',
}
const pageOf = (code: string) => (PAGES[code] && router.hasRoute(PAGES[code]) ? PAGES[code] : '')
const ICONS: Record<string, string> = {
  carnet_qualiopi: 'book-open', carnet_impression: 'print', etat_indicateurs: 'secured', feuille_de_route: 'map-route-planning',
  synthese_parcours: 'usergroup', evaluations_acquis: 'education', resultats_formations: 'chart-analytics',
  synthese_documents: 'file-paste', aide_bpf: 'chart-pie',
}
const reportIcon = (code: string) => ICONS[code] ?? 'file-1'

const filter = ref('all')
const filterTabs = computed(() => {
  const list = reports.data?.rapports ?? []
  return [
    { value: 'all', label: t('gsms.commun.tous'), count: list.length },
    { value: 'yes', label: t('gsms.bilans.disponibles'), count: list.filter((r) => r.disponible).length },
    { value: 'no', label: t('gsms.bilans.nonDisponibles'), count: list.filter((r) => !r.disponible).length },
  ]
})
// Accessibles d'abord, dans l'ordre de l'API.
const shownReports = computed(() => [...(reports.data?.rapports ?? [])]
  .filter((r) => filter.value === 'all' || r.disponible === (filter.value === 'yes'))
  .sort((a, b) => Number(b.disponible) - Number(a.disponible)))

const selected = ref<ReportEntry | null>(null)
const drawerVisible = ref(false)
function openReport(r: ReportEntry) {
  selected.value = r
  drawerVisible.value = true
}

const natureLabel = (n: string) => (te(`gsms.bilans.natures.${n}`) ? t(`gsms.bilans.natures.${n}`) : n)
const natureIcon = (n: string) => (n === 'IMPRESSION' ? 'print' : n === 'AIDE' ? 'help-circle' : 'view-list')
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.muted { .gsms-muted(); margin: 2px 0 0; }

// Grille des graphiques : 3 colonnes à grand écran (cartes larges sur 2), 2 en tablette, 1 au téléphone.
.dash {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  > * { min-width: 0; }
  .span-2 { grid-column: span 2; }
  .span-3 { grid-column: 1 / -1; }
  @media (max-width: 1280px) { grid-template-columns: repeat(2, minmax(0, 1fr)); .span-2 { grid-column: 1 / -1; } }
  @media (max-width: 760px) { grid-template-columns: minmax(0, 1fr); }
}

.table-toggle { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
.table-wrap { overflow-x: auto; margin-top: 8px; border: 1px solid var(--td-component-stroke); border-radius: var(--app-radius-md); }
.rtable { width: 100%; border-collapse: collapse; font-size: var(--app-text-sm);
  th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--td-component-stroke); white-space: nowrap; }
  thead th { background: var(--td-bg-color-secondarycontainer); color: var(--td-text-color-secondary); font-weight: 600; font-size: var(--app-text-xs); }
  tbody th { font-weight: 500; white-space: normal; min-width: 160px; a { color: var(--td-brand-color); text-decoration: none; &:hover { text-decoration: underline; } } }
  tbody tr:last-child > * { border-bottom: 0; }
  .num { text-align: right; font-variant-numeric: tabular-nums; } }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }

.library { .gsms-panel(); padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; }
.library-head { display: flex; align-items: center; flex-wrap: wrap; gap: 10px 12px; }
.library-icon {
  display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 36px; height: 36px;
  border-radius: var(--app-radius-md); background: color-mix(in srgb, var(--td-brand-color) 12%, transparent); color: var(--td-brand-color);
}
.library-titles { flex: 1 1 240px; min-width: 0;
  h2 { margin: 0; font-family: var(--app-font-family-display); font-size: var(--app-text-xl); font-weight: 700; line-height: 22px; color: var(--td-text-color-primary); } }
.lib-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); gap: 12px; }
.report {
  display: flex; align-items: flex-start; gap: 12px; min-width: 0; padding: 14px; text-align: left; font: inherit; color: inherit;
  border: 1px solid var(--td-component-stroke); border-radius: var(--app-radius-lg); background: var(--td-bg-color-container);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--td-text-color-primary) 5%, transparent);
  transition: border-color var(--app-motion-fast) ease, box-shadow var(--app-motion-fast) ease, transform var(--app-motion-fast) ease;
  &:is(button) { cursor: pointer; }
  &:is(button):hover {
    border-color: color-mix(in srgb, var(--td-brand-color) 45%, var(--td-component-stroke));
    box-shadow: 0 8px 20px -10px color-mix(in srgb, var(--td-text-color-primary) 25%, transparent);
    transform: translateY(-1px);
  }
  &:focus-visible { outline: 2px solid var(--td-brand-color); outline-offset: 2px; }
  &.is-skeleton { display: block; }
  @media (prefers-reduced-motion: reduce) { transition: none; &:is(button):hover { transform: none; } }
}
.report--locked { background: var(--td-bg-color-secondarycontainer); .report-icon { color: var(--td-text-color-placeholder); background: var(--td-bg-color-component); } }
.report-icon {
  display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 40px; height: 40px;
  border-radius: var(--app-radius-md); background: color-mix(in srgb, var(--td-brand-color) 12%, transparent); color: var(--td-brand-color);
}
.report-body { display: flex; flex-direction: column; gap: 6px; min-width: 0; flex: 1; }
.report-title { color: var(--td-text-color-primary); font-family: var(--app-font-family-display); font-size: var(--app-text-md); font-weight: 600; line-height: 20px; overflow-wrap: anywhere; }
.report-tags { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px; }
.report-nature { display: inline-flex; align-items: center; gap: 4px; color: var(--td-text-color-secondary); font-size: var(--app-text-xs); }
.report-perms { color: var(--td-text-color-secondary); font-size: var(--app-text-xs); line-height: 20px; }
.report-open { display: inline-flex; align-items: center; gap: 2px; color: var(--td-brand-color); font-size: var(--app-text-sm); font-weight: 500; }
.chip { .gsms-chip(); margin-left: 4px; font-family: var(--app-font-family-mono); }
</style>
