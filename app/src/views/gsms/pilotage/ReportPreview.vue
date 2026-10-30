<template>
  <div class="preview">
    <div class="preview-meta">
      <t-tag variant="light" size="small"><t-icon :name="natureIcon(report.nature)" size="13px" />{{ natureLabel(report.nature) }}</t-tag>
      <code class="route">{{ report.route }}</code>
    </div>

    <div v-if="source.loading" class="preview-loading">
      <t-skeleton animation="gradient" :row-col="[[{ width: '30%' }, { width: '30%' }, { width: '30%' }], { width: '100%', height: '180px' }]" />
    </div>
    <GsmsRefusal v-else-if="source.error" :error="source.error" inline />
    <template v-else-if="view">
      <p v-if="view.note" class="preview-note"><t-icon name="info-circle" size="14px" aria-hidden="true" />{{ view.note }}</p>
      <dl v-if="view.figures.length" class="figures">
        <div v-for="f in view.figures" :key="f.label" class="figure">
          <dt>{{ f.label }}</dt>
          <dd :class="{ 'figure--missing': f.value === null }">{{ f.value === null ? t('gsms.bilans.nonMesure') : f.value }}</dd>
        </div>
      </dl>
      <section v-if="view.chart" class="preview-chart" :aria-label="view.chart.caption">
        <h4>{{ view.chart.caption }}</h4>
        <GsmsDonut v-if="view.chart.kind === 'donut'" :data="view.chart.data" :total="view.chart.total" :total-label="view.chart.totalLabel" />
        <GsmsBarChart v-else :caption="view.chart.caption" :data="view.chart.data" :categories="view.chart.categories"
          :series="view.chart.series" :links="view.chart.links" :grouped="view.chart.grouped" :max="view.chart.max"
          :format="view.chart.format" horizontal />
      </section>
    </template>

    <div class="preview-actions">
      <t-button v-if="page" theme="primary" @click="router.push({ name: page })">
        <template #icon><t-icon name="jump" /></template>{{ t('gsms.bilans.ouvrirPage') }}
      </t-button>
      <t-button v-if="printable" variant="outline" :loading="downloading === 'print'" @click="download('print')">
        <template #icon><t-icon name="print" /></template>{{ t('gsms.bilans.telechargerCarnet') }}
      </t-button>
      <t-button v-if="dataPath" variant="outline" :loading="downloading === 'data'" @click="download('data')">
        <template #icon><t-icon name="download" /></template>{{ t('gsms.bilans.telechargerDonnees') }}
      </t-button>
      <GsmsAskAssistant v-if="ask" :assistant="ask.assistant" :question="ask.question" size="medium" />
    </div>
    <GsmsRefusal v-if="downloadError" :error="downloadError" inline />
    <p v-if="!page" class="preview-muted">{{ t('gsms.bilans.sansEcranDedie') }}</p>
  </div>
</template>

<script setup lang="ts">
/**
 * Aperçu d'un rapport de GET /bilans dans le panneau latéral : la route de l'API qui le produit, un résumé chiffré et
 * un graphique quand le rapport s'y prête, puis les actions réelles (page complète, fichier, assistant). Tout vient
 * de la route du rapport ; un taux non mesuré est dit « non mesuré », jamais remplacé par 0.
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import GsmsDonut from '@/components/gsms/GsmsDonut.vue'
import GsmsBarChart from '@/components/gsms/GsmsBarChart.vue'
import GsmsAskAssistant from '@/components/gsms/GsmsAskAssistant.vue'
import { countBy, fmtNumber, fromCounts, type ChartDatum, type ChartSeries } from '@/components/gsms/chartTheme'
import { useApiSource } from '@/components/gsms/useApiSource'
import { fmtDate, fmtDateTime, stateLabel, stepLabel } from '@/components/gsms/format'
import type { GsmsAssistantKey } from '@/config/gsmsAssistants'
import { downloadFile } from '@/api/gsms/files'
import { getBpfHelp, getRoadmap, type ReportEntry } from '@/api/gsms/pilotage'
import { downloadCarnet, getCarnet, getEvaluations } from '@/api/gsms/qualite'
import { getAssessments, getJourneySummary } from '@/api/gsms/journey'
import { getResults } from '@/api/gsms/training'
import { getEditionsOverview } from '@/api/gsms/editions'
import { INDICATOR_STATES, criterionChart, pct, resultsChart } from './reportCharts'

const props = defineProps<{ report: ReportEntry; page: string }>()
const { t, te } = useI18n()
const router = useRouter()

/** Exercice de l'aide au BPF : le dernier exercice clos (le BPF porte sur l'année écoulée). */
const BPF_YEAR = new Date().getFullYear() - 1
const RESULTS_MONTHS = 12
const STEP_STATES: [string, ChartDatum['tone']][] = [['FAIT', 'success'], ['A_ECHEANCE', 'warning'], ['EN_RETARD', 'danger'], ['A_VENIR', 'info'], ['SANS_OBJET', 'neutral']]
const INDICATOR_TONES = Object.fromEntries(INDICATOR_STATES)

type Chart =
  | { kind: 'donut'; caption: string; data: ChartDatum[]; total?: number; totalLabel?: string }
  | { kind: 'bars'; caption: string; data?: ChartDatum[]; categories?: string[]; series?: ChartSeries[]; links?: string[];
      grouped?: boolean; max?: number; format?: (n: number) => string }
interface View { figures: { label: string; value: string | number | null }[]; chart?: Chart; note?: string }

const sum = (o: Record<string, number> | undefined) => Object.values(o ?? {}).reduce((a, b) => a + b, 0)
const critLabel = (n: number, nom: string) => `${t('gsms.qualite.critere', { n })} · ${nom}`

/** Chargement et mise en forme d'un rapport, par code de GET /bilans ; un code inconnu n'a pas d'aperçu. */
const LOADERS: Record<string, () => Promise<View>> = {
  carnet_qualiopi: carnetView,
  carnet_impression: carnetView,
  async etat_indicateurs() {
    const e = await getEvaluations()
    const counts = countBy(e.indicateurs, (i) => i.etat)
    return {
      note: e.avertissement,
      figures: [
        { label: t('gsms.bilans.apercu.referentiel'), value: e.referentiel },
        { label: t('gsms.bilans.apercu.periode'), value: e.periode.label },
        { label: t('gsms.bilans.apercu.derniereEvaluation'), value: e.derniere ? fmtDateTime(e.derniere.fin || e.derniere.debut) : null },
      ],
      chart: { kind: 'donut', caption: t('gsms.bilans.apercu.indicateursParEtat'), total: e.indicateurs.length, totalLabel: t('gsms.qualite.kpi.indicateurs'),
        data: fromCounts(counts, INDICATOR_STATES.map(([s]) => s), stateLabel, (s) => `/platform/qualite/indicateurs?etat=${s}`, INDICATOR_TONES) },
    }
  },
  async feuille_de_route() {
    const r = await getRoadmap(6)
    return {
      figures: [
        { label: t('gsms.bilans.apercu.periode'), value: `${fmtDate(r.aujourd_hui)} → ${fmtDate(r.jusqu_au)}` },
        { label: t('gsms.bilans.apercu.echeances'), value: r.elements.length },
      ],
      chart: { kind: 'donut', caption: t('gsms.graphiques.pilotage.etats'), total: r.elements.length, totalLabel: t('gsms.graphiques.total'),
        data: fromCounts(countBy(r.elements, (i) => i.etat), ['EN_RETARD', 'A_ECHEANCE', 'A_VENIR'], stateLabel,
          (s) => `/platform/pilotage?etat=${s}#feuille-de-route`, { A_VENIR: 'brand' }) },
    }
  },
  async synthese_parcours() {
    const s = await getJourneySummary()
    const steps = Object.keys(s.etapes)
    return {
      figures: [
        { label: t('gsms.bilans.apercu.inscriptions'), value: sum(s.inscriptions) },
        { label: t('gsms.ecole.kpi.examensReussis'), value: `${s.examens.reussis} / ${s.examens.presentes}` },
        { label: t('gsms.ecole.kpi.etapesEnRetard'), value: s.en_retard.length },
      ],
      chart: { kind: 'bars', caption: t('gsms.graphiques.ecole.etapes'), categories: steps.map(stepLabel), links: steps.map((x) => `/platform/parcours/${x}`),
        series: STEP_STATES.map(([etat, tone]) => ({ key: etat, label: stateLabel(etat), tone, values: steps.map((x) => s.etapes[x]?.[etat] ?? 0) })) },
    }
  },
  async evaluations_acquis() {
    const a = await getAssessments()
    const certif = a.compteurs.certification
    return {
      figures: [
        { label: t('gsms.bilans.apercu.inscriptions'), value: a.lignes.length },
        { label: t('gsms.bilans.apercu.evaluationsFaites'), value: a.compteurs.evaluations.FAIT ?? 0 },
        { label: t('gsms.bilans.apercu.attestationsFaites'), value: a.compteurs.attestation.FAIT ?? 0 },
      ],
      chart: { kind: 'donut', caption: t('gsms.bilans.apercu.certification'), total: sum(certif), totalLabel: t('gsms.bilans.apercu.inscriptions'),
        data: fromCounts(certif, ['REUSSI', 'NON_REUSSI', 'EN_ATTENTE', 'AUCUN'],
          (c) => (te(`gsms.evaluations.resultats.${c}`) ? t(`gsms.evaluations.resultats.${c}`) : stateLabel(c)), undefined,
          { REUSSI: 'success', NON_REUSSI: 'danger', EN_ATTENTE: 'warning', AUCUN: 'neutral' }) },
    }
  },
  async resultats_formations() {
    const r = await getResults(RESULTS_MONTHS)
    const chart = resultsChart(r.formations ?? [], rateLabels())
    return {
      note: t('gsms.bilans.apercu.periodeResultats', { du: fmtDate(r.periode.du), au: fmtDate(r.periode.au) }),
      figures: [
        { label: t('gsms.bilans.apercu.formationsMesurees'), value: r.formations_mesurees },
        { label: t('gsms.graphiques.ecole.reussite'), value: r.totaux.taux_reussite === null ? null : pct(r.totaux.taux_reussite) },
        { label: t('gsms.graphiques.ecole.satisfaction'), value: r.totaux.taux_satisfaction === null ? null : pct(r.totaux.taux_satisfaction) },
        { label: t('gsms.graphiques.ecole.abandon'), value: r.totaux.taux_abandon === null ? null : pct(r.totaux.taux_abandon) },
      ],
      chart: chart.rows.length
        ? { kind: 'bars', caption: t('gsms.bilans.resultats.titre'), categories: chart.categories, series: chart.series, grouped: true, max: 100, format: pct }
        : undefined,
    }
  },
  async synthese_documents() {
    const d = await getEditionsOverview()
    return {
      figures: [
        { label: t('gsms.bilans.apercu.documents'), value: d.total },
        { label: t('gsms.bilans.apercu.alertes'), value: d.alertes.length },
        ...d.types.map((x) => ({ label: x.libelle, value: x.nombre })),
      ],
      chart: { kind: 'donut', caption: t('gsms.bilans.apercu.documentsParStatut'), total: d.total, totalLabel: t('gsms.bilans.apercu.documents'),
        data: fromCounts(Object.fromEntries(Object.entries(d.statuts).filter(([, n]) => n > 0)), [], stateLabel) },
    }
  },
  async aide_bpf() {
    const b = await getBpfHelp(BPF_YEAR)
    return {
      note: t('gsms.bilans.apercu.bpfExercice', { annee: b.exercice }) + ' ' + t('gsms.bilans.bpf.pasLeBpfAide'),
      figures: [
        { label: t('gsms.bilans.apercu.sessions'), value: b.synthese.sessions },
        { label: t('gsms.bilans.apercu.stagiaires'), value: b.synthese.stagiaires },
        { label: t('gsms.bilans.apercu.heuresStagiaires'), value: fmtNumber(b.synthese.heures_stagiaires) },
      ],
      chart: { kind: 'donut', caption: t('gsms.bilans.apercu.cadresParEtat'), total: b.cadres.length, totalLabel: t('gsms.bilans.apercu.cadres'),
        data: fromCounts(countBy(b.cadres, (c) => c.etat), ['CALCULE', 'INDICATIF', 'PARTIEL', 'NON_CALCULABLE'],
          (c) => (te(`gsms.bilans.bpf.etats.${c}`) ? t(`gsms.bilans.bpf.etats.${c}`) : c), () => '/platform/rapports/bpf',
          { CALCULE: 'success', INDICATIF: 'info', PARTIEL: 'warning', NON_CALCULABLE: 'neutral' }) },
    }
  },
}

async function carnetView(): Promise<View> {
  const c = await getCarnet()
  const chart = criterionChart(c.fiches.map((f) => ({ critere: f.critere.numero, critereNom: f.critere.nom, etat: f.etat })), critLabel)
  return {
    note: c.avertissement,
    figures: [
      { label: t('gsms.bilans.apercu.referentiel'), value: `${c.referentiel.version} · ${fmtDate(c.referentiel.en_vigueur_le)}` },
      { label: t('gsms.bilans.apercu.fiches'), value: c.fiches.length },
      { label: stateLabel('DEMONTRABLE'), value: c.fiches.filter((f) => f.etat === 'DEMONTRABLE').length },
      { label: t('gsms.bilans.apercu.preuvesExploitables'), value: c.fiches.reduce((n, f) => n + f.preuves.exploitables, 0) },
      { label: t('gsms.bilans.apercu.ecarts'), value: c.fiches.reduce((n, f) => n + f.ecarts.length, 0) },
      { label: t('gsms.bilans.apercu.editeLe'), value: fmtDateTime(c.edite_le) },
    ],
    chart: { kind: 'bars', caption: t('gsms.bilans.apercu.etatsParCritere'), ...chart },
  }
}

function rateLabels() {
  return { reussite: t('gsms.graphiques.ecole.reussite'), satisfaction: t('gsms.graphiques.ecole.satisfaction'), abandon: t('gsms.graphiques.ecole.abandon') }
}

const { state: source, run } = useApiSource<View | null>(async () => (LOADERS[props.report.code] ? LOADERS[props.report.code]() : null), false)
watch(() => props.report.code, () => { void run() }, { immediate: true })
const view = computed(() => source.data)

// Actions réelles : version imprimable du carnet, données brutes de la route du rapport, assistant adapté.
const printable = computed(() => props.report.code === 'carnet_qualiopi' || props.report.code === 'carnet_impression')
const dataPath = computed(() => {
  if (props.report.nature === 'IMPRESSION') return ''
  const path = props.report.route.startsWith('/api/v1') ? props.report.route.slice('/api/v1'.length) : ''
  if (!path) return ''
  if (props.report.code === 'aide_bpf') return `${path}?exercice=${BPF_YEAR}`
  if (props.report.code === 'resultats_formations') return `${path}?mois=${RESULTS_MONTHS}`
  return path
})
const ASK: Record<string, { assistant: GsmsAssistantKey; key: string }> = {
  carnet_qualiopi: { assistant: 'preparationAudit', key: 'carnet' },
  carnet_impression: { assistant: 'preparationAudit', key: 'carnet' },
  etat_indicateurs: { assistant: 'preparationAudit', key: 'indicateurs' },
  feuille_de_route: { assistant: 'preparationAudit', key: 'feuilleDeRoute' },
  synthese_parcours: { assistant: 'preparationAudit', key: 'parcours' },
  evaluations_acquis: { assistant: 'resultats', key: 'evaluations' },
  resultats_formations: { assistant: 'resultats', key: 'resultats' },
}
const ask = computed(() => {
  const a = ASK[props.report.code]
  return a ? { assistant: a.assistant, question: t(`gsms.bilans.questions.${a.key}`) } : null
})

const downloading = ref<'' | 'print' | 'data'>('')
const downloadError = ref<unknown>(null)
/** Fichier servi par l'API (fetch + blob, docs/API.md §4 point 9) : jamais de HTML injecté dans la page. */
async function download(kind: 'print' | 'data') {
  downloading.value = kind
  downloadError.value = null
  try {
    if (kind === 'print') await downloadCarnet()
    else await downloadFile(dataPath.value, `${props.report.code}.json`)
    MessagePlugin.success(t('gsms.bilans.fichierTelecharge'))
  } catch (e) {
    downloadError.value = e
  } finally {
    downloading.value = ''
  }
}

const natureLabel = (n: string) => (te(`gsms.bilans.natures.${n}`) ? t(`gsms.bilans.natures.${n}`) : n)
const natureIcon = (n: string) => (n === 'IMPRESSION' ? 'print' : n === 'AIDE' ? 'help-circle' : 'view-list')
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.preview { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.preview-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
  :deep(.t-tag) { gap: 4px; } }
.route { .gsms-chip(); font-family: var(--app-font-family-mono); font-size: var(--app-text-xs); overflow-wrap: anywhere; }
.preview-note { display: flex; gap: 6px; margin: 0; padding: 10px 12px; border-radius: var(--app-radius-md);
  background: var(--td-bg-color-secondarycontainer); color: var(--td-text-color-secondary); font-size: var(--app-text-sm); line-height: 1.45;
  .t-icon { flex-shrink: 0; margin-top: 2px; color: var(--td-brand-color); } }
.figures { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; margin: 0; }
.figure { padding: 10px 12px; border: 1px solid var(--td-component-stroke); border-radius: var(--app-radius-md); background: var(--td-bg-color-container); min-width: 0;
  dt { color: var(--td-text-color-secondary); font-size: var(--app-text-xs); line-height: 16px; }
  dd { margin: 4px 0 0; color: var(--td-text-color-primary); font-family: var(--app-font-family-display); font-size: var(--app-text-lg);
    font-weight: 700; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  .figure--missing { font-family: inherit; font-size: var(--app-text-sm); font-weight: 500; color: var(--td-text-color-placeholder); } }
.preview-chart { .gsms-panel(); padding: 14px 16px;
  h4 { margin: 0 0 8px; font-family: var(--app-font-family-display); font-size: var(--app-text-md); font-weight: 700; color: var(--td-text-color-primary); } }
.preview-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.preview-muted { .gsms-muted(); margin: 0; }
</style>
