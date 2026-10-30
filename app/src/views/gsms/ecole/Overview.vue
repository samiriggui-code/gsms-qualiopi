<template>
  <GsmsSectionLanding :title="t('gsms.ecole.titre')" icon="education" :description="t('gsms.ecole.sousTitre')"
    :error="catalogue.error" :kpis="kpis" :kpi-loading="loadingOf(catalogue) || loadingOf(summary) || loadingOf(learners)"
    :alerts="alerts" :modules="modules">
    <template #charts>
      <GsmsChartCard :title="t('gsms.graphiques.ecole.etapes')" :subtitle="t('gsms.graphiques.ecole.etapesSous')" icon="chart-bar"
        :loading="loadingOf(summary)" :error="summary.error" more-to="/platform/parcours/inscriptions" class="chart-wide">
        <GsmsBarChart :caption="t('gsms.graphiques.ecole.etapes')" :categories="stepChart.categories" :series="stepChart.series"
          :links="stepChart.links" horizontal />
      </GsmsChartCard>
      <GsmsChartCard :title="t('gsms.graphiques.ecole.inscriptions')" :subtitle="t('gsms.graphiques.ecole.inscriptionsSous')" icon="chart-ring"
        :loading="loadingOf(summary)" :error="summary.error" more-to="/platform/parcours/inscriptions">
        <GsmsDonut :data="enrollmentChart" />
      </GsmsChartCard>
      <GsmsChartCard :title="t('gsms.graphiques.ecole.resultats')"
        :subtitle="t('gsms.graphiques.ecole.resultatsSous', { n: results.data?.periode.mois ?? 12 })" icon="chart-bar"
        :loading="loadingOf(results)" :error="results.error" :empty="!resultsChart.length">
        <GsmsBarChart :caption="t('gsms.graphiques.ecole.resultats')" :data="resultsChart" :max="100" :format="pct" horizontal />
      </GsmsChartCard>
      <GsmsChartCard :title="t('gsms.graphiques.ecole.filieres')" :subtitle="t('gsms.graphiques.ecole.filieresSous')" icon="book"
        :loading="loadingOf(catalogue)" :error="catalogue.error" more-to="/platform/formations">
        <GsmsBarChart :caption="t('gsms.graphiques.ecole.filieres')" :data="trackChart" horizontal />
      </GsmsChartCard>
    </template>
  </GsmsSectionLanding>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import GsmsSectionLanding from '@/components/gsms/GsmsSectionLanding.vue'
import GsmsChartCard from '@/components/gsms/GsmsChartCard.vue'
import GsmsDonut from '@/components/gsms/GsmsDonut.vue'
import GsmsBarChart from '@/components/gsms/GsmsBarChart.vue'
import { fromCounts, type ChartDatum, type ChartSeries, type ChartTone } from '@/components/gsms/chartTheme'
import { useApiSource, type ApiSource } from '@/components/gsms/useApiSource'
import type { AlertItem, KpiItem, ModuleItem } from '@/components/gsms/types'
import { getCatalogue, getResults } from '@/api/gsms/training'
import { getJourneySummary } from '@/api/gsms/journey'
import { listLearnerRecords, listSessions } from '@/api/gsms/sessions'
import { getEdofEstablishment } from '@/api/gsms/edof'
import { listPreinscriptions } from '@/api/gsms/preinscriptions'
import { listEditions } from '@/api/gsms/editions'
import { listCompanies } from '@/api/gsms/entreprises'
import { useGsmsAccessStore } from '@/stores/gsmsAccess'
import { fmtDate, stateLabel, stepLabel } from '@/components/gsms/format'

const { t } = useI18n()
const access = useGsmsAccessStore()

const catalogue = useApiSource(getCatalogue).state
const summary = useApiSource(getJourneySummary).state
const learners = useApiSource(() => listLearnerRecords()).state
const sessions = useApiSource(() => listSessions()).state
// Module EDOF : chargé seulement s'il est actif et lisible pour ce compte (GET /bootstrap) ; l'API reste juge.
const showEdof = computed(() => access.hasFeature('edof') && access.can('edof.read'))
const edof = useApiSource(async () => {
  await access.load()
  return showEdof.value ? getEdofEstablishment() : null
}).state

// Commercial : chaque module n'est chargé (et montré) que si le compte a le droit de lecture (GET /bootstrap).
const showLeads = computed(() => access.can('leads.read'))
const showQuotes = computed(() => access.can('documents.read'))
const leads = useApiSource(async () => {
  await access.load()
  return showLeads.value ? listPreinscriptions() : null
}).state
const quotes = useApiSource(async () => {
  await access.load()
  return showQuotes.value ? listEditions({ type: 'DEVIS' }) : null
}).state
const companies = useApiSource(listCompanies).state

const results = useApiSource(() => getResults()).state
const loadingOf = (s: ApiSource<unknown>) => s.loading || (!s.data && !s.error)
/** Une valeur d'une source refusée s'affiche « — », jamais 0. */
const value = (s: ApiSource<unknown>, n: number | undefined) => (s.error ? '—' : n ?? 0)
const sum = (counts: Record<string, number> | undefined) => Object.values(counts ?? {}).reduce((a, b) => a + b, 0)

const kpis = computed<KpiItem[]>(() => [
  { key: 'formations', label: t('gsms.ecole.kpi.formations'), value: value(catalogue, catalogue.data?.totaux.formations), icon: 'book',
    subtitle: t('gsms.ecole.kpi.fichesValidees', { n: catalogue.data?.totaux.fiches_validees ?? 0 }), to: '/platform/formations' },
  { key: 'sessions', label: t('gsms.ecole.kpi.sessionsAVenir'), value: value(catalogue, catalogue.data?.totaux.sessions_a_venir), icon: 'calendar-1', to: '/platform/sessions' },
  { key: 'stagiaires', label: t('gsms.ecole.kpi.stagiaires'), value: value(learners, learners.data?.length), icon: 'usergroup', to: '/platform/stagiaires' },
  { key: 'inscriptions', label: t('gsms.ecole.kpi.inscriptions'), value: value(summary, sum(summary.data?.inscriptions)), icon: 'user-checked', to: '/platform/parcours/inscriptions' },
  { key: 'retards', label: t('gsms.ecole.kpi.etapesEnRetard'), value: value(summary, summary.data?.en_retard.length), icon: 'time', tone: 'danger',
    subtitle: t('gsms.ecole.kpi.aTraiter'), to: '/platform/parcours/inscriptions' },
])

const alerts = computed(() => {
  const items: AlertItem[] = [
    ...(summary.data?.en_retard ?? []).map<AlertItem>((r, n) => ({
      id: `r${n}`, title: `${r.stagiaire} · ${stepLabel(r.etape)}`, kind: r.session, tone: 'danger',
      when: r.echeance ? fmtDate(r.echeance) : undefined, to: `/platform/parcours/${r.etape}`,
    })),
    ...(catalogue.data?.formations ?? []).filter((f) => f.fiche !== 'VALIDEE').map<AlertItem>((f) => ({
      id: `f${f.id}`, title: t('gsms.ecole.ficheAValider', { titre: f.title }), kind: f.code, tone: 'warning',
      subtitle: f.rubriques_manquantes ? t('gsms.ecole.rubriquesManquantes', { n: f.rubriques_manquantes }, f.rubriques_manquantes) : undefined,
      to: `/platform/formations/${f.id}`,
    })),
  ]
  return {
    title: t('gsms.ecole.aTraiter'), subtitle: t('gsms.ecole.aTraiterAide'), items,
    loading: loadingOf(summary) || loadingOf(catalogue), error: summary.error ?? catalogue.error,
    empty: t('gsms.ecole.rienATraiter'), moreTo: '/platform/parcours/inscriptions',
  }
})

const leadFigure = (code: string) => ({ label: leads.data?.statuts[code] ?? stateLabel(code), value: leads.data?.compteurs[code] ?? 0 })
const quoteCount = (code: string) => (quotes.data ?? []).filter((q) => q.statut === code).length

const modules = computed<ModuleItem[]>(() => [
  ...(showLeads.value ? [{ key: 'demandes', title: t('gsms.menu.entrees.demandes'), icon: 'user-add', to: '/platform/demandes',
    description: t('gsms.ecole.modules.demandes'), loading: loadingOf(leads), error: leads.error,
    figures: [leadFigure('NOUVELLE'), leadFigure('EN_COURS')] }] : []),
  ...(showQuotes.value ? [{ key: 'devis', title: t('gsms.menu.entrees.devis'), icon: 'file-paste', to: '/platform/devis',
    description: t('gsms.ecole.modules.devis'), loading: loadingOf(quotes), error: quotes.error,
    figures: [{ label: t('gsms.qualite.kpi.total'), value: quotes.data?.length ?? 0 },
      { label: stateLabel('EN_RELECTURE'), value: quoteCount('EN_RELECTURE') }] }] : []),
  { key: 'entreprises', title: t('gsms.menu.entrees.entreprises'), icon: 'city', to: '/platform/entreprises',
    description: t('gsms.ecole.modules.entreprises'), loading: loadingOf(companies), error: companies.error,
    figures: [{ label: t('gsms.qualite.kpi.total'), value: companies.data?.length ?? 0 },
      { label: t('gsms.commercial.entreprises.avecStagiaires'), value: (companies.data ?? []).filter((c) => c.learners).length }] },
  { key: 'formations', title: t('gsms.menu.entrees.formations'), icon: 'book', to: '/platform/formations',
    description: t('gsms.ecole.modules.formations'), loading: loadingOf(catalogue), error: catalogue.error,
    figures: [{ label: t('gsms.ecole.kpi.formations'), value: catalogue.data?.totaux.formations ?? 0 },
      { label: t('gsms.ecole.kpi.certificationIdentifiee'), value: catalogue.data?.totaux.certification_identifiee ?? 0 }] },
  ...(showEdof.value ? [{ key: 'edof', title: t('gsms.menu.entrees.edof'), icon: 'certificate', to: '/platform/edof',
    description: t('gsms.ecole.modules.edof'), loading: loadingOf(edof), error: edof.error,
    figures: [{ label: t('gsms.edof.etablissement'), value: edof.data?.dossier.display_label ?? '—' },
      { label: t('gsms.ecole.kpi.dossiersFormation'), value: (edof.data?.formations ?? []).filter((f) => f.dossier).length }] }] : []),
  { key: 'sessions', title: t('gsms.menu.entrees.sessions'), icon: 'calendar-1', to: '/platform/sessions',
    description: t('gsms.ecole.modules.sessions'), loading: loadingOf(sessions), error: sessions.error,
    figures: [{ label: t('gsms.qualite.kpi.total'), value: sessions.data?.length ?? 0 },
      { label: t('gsms.etats.EN_COURS'), value: (sessions.data ?? []).filter((s) => s.status === 'EN_COURS').length }] },
  { key: 'stagiaires', title: t('gsms.menu.entrees.stagiaires'), icon: 'usergroup', to: '/platform/stagiaires',
    description: t('gsms.ecole.modules.stagiaires'), loading: loadingOf(learners), error: learners.error,
    figures: [{ label: t('gsms.ecole.kpi.stagiaires'), value: learners.data?.length ?? 0 },
      { label: t('gsms.stagiaires.sansInscription'), value: (learners.data ?? []).filter((l) => !l.enrollments).length }] },
  { key: 'parcours', title: t('gsms.registres.titre'), icon: 'view-list', to: '/platform/parcours/inscriptions',
    description: t('gsms.ecole.modules.parcours'), loading: loadingOf(summary), error: summary.error,
    figures: [{ label: t('gsms.ecole.kpi.etapesEnRetard'), value: summary.data?.en_retard.length ?? 0 },
      { label: t('gsms.ecole.kpi.examensReussis'), value: summary.data ? `${summary.data.examens.reussis} / ${summary.data.examens.presentes}` : '—' }] },
])

// Graphiques : compteurs et taux tels que l'API les renvoie (GET /parcours/synthese, /formation/resultats, catalogue).
const STEP_STATES: [string, ChartTone][] = [['FAIT', 'success'], ['A_ECHEANCE', 'warning'], ['EN_RETARD', 'danger'], ['A_VENIR', 'info'], ['SANS_OBJET', 'neutral']]
const stepChart = computed(() => {
  const steps = Object.keys(summary.data?.etapes ?? {})
  return {
    categories: steps.map(stepLabel),
    links: steps.map((s) => `/platform/parcours/${s}`),
    series: STEP_STATES.map<ChartSeries>(([etat, tone]) => ({
      key: etat, label: stateLabel(etat), tone, values: steps.map((s) => summary.data?.etapes[s]?.[etat] ?? 0),
    })),
  }
})
const enrollmentChart = computed(() => fromCounts(summary.data?.inscriptions ?? {}, ['INSCRIT', 'CONFIRME', 'TERMINE', 'ABANDON', 'ANNULE'],
  stateLabel, () => '/platform/parcours/inscriptions', { INSCRIT: 'info', ANNULE: 'neutral' }))
const pct = (n: number) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(n)} %`
const resultsChart = computed<ChartDatum[]>(() => {
  const totals = results.data?.totaux
  if (!totals) return []
  const rates: [string, number | null][] = [
    ['reussite', totals.taux_reussite], ['satisfaction', totals.taux_satisfaction], ['abandon', totals.taux_abandon],
  ]
  // Un taux non mesuré (null) n'est pas dessiné : jamais un zéro à sa place.
  return rates.filter((r): r is [string, number] => r[1] !== null)
    .map(([key, value]) => ({ key, label: t(`gsms.graphiques.ecole.${key}`), value, tone: 'brand' as const }))
})
const trackChart = computed<ChartDatum[]>(() => (catalogue.data?.filieres ?? [])
  .map((f) => ({ key: f.value, label: f.label, value: f.count, tone: 'brand' as const, to: '/platform/formations' })))
</script>

<style scoped lang="less">
.chart-wide { grid-column: 1 / -1; }
</style>
