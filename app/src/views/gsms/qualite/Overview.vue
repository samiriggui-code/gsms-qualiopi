<template>
  <GsmsSectionLanding :title="t('gsms.qualite.titre')" icon="secured" :description="t('gsms.qualite.sousTitre')"
    :error="evaluations.error" :kpis="kpis" :kpi-loading="!evaluations.data && !evaluations.error"
    :alerts="alerts" :engine="engine" :modules="modules" />
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import GsmsSectionLanding from '@/components/gsms/GsmsSectionLanding.vue'
import type { AlertItem, KpiItem, ModuleItem } from '@/components/gsms/types'
import {
  getCarnet, getEvaluations, listAudits, listCapa, listComplaints, listEvidence, listMilestones, listOpenGaps, listWatchItems,
} from '@/api/gsms/qualite'
import { getPieceDossier } from '@/api/gsms/dossiers'
import { getOrganisme } from '@/api/gsms/platform'
import { fmtDate } from '@/components/gsms/format'

const { t } = useI18n()

/** Une source de chiffres : sa réponse, ou son refus (affiché tel quel, jamais remplacé par des zéros). */
function source<T>(load: () => Promise<T>) {
  const s = reactive({ data: null as T | null, error: null as unknown })
  load().then((d) => { s.data = d as never }).catch((e) => { s.error = e })
  return s
}

const evaluations = source(getEvaluations)
const carnet = source(getCarnet)
const evidence = source(() => listEvidence())
const gaps = source(listOpenGaps)
const capas = source(listCapa)
const audits = source(listAudits)
const complaints = source(listComplaints)
const watch = source(listWatchItems)
const milestones = source(() => listMilestones(15))
const dossier = source(async () => {
  const org = await getOrganisme()
  if (!org.id) throw new Error(t('gsms.qualite.dossier.organismeAbsent'))
  return getPieceDossier('ORGANISME', org.id)
})

const loadingOf = (s: { data: unknown; error: unknown }) => !s.data && !s.error
const byState = (etat: string) => (evaluations.data?.indicateurs ?? []).filter((i) => i.etat === etat).length
const toReview = computed(() => evidence.data?.par_statut.find((s) => s.statut === 'DETECTEE')?.nombre ?? 0)
const lateCapa = computed(() => (capas.data ?? []).filter((c) => c.en_retard).length)

const kpis = computed<KpiItem[]>(() => [
  { key: 'demontrables', label: t('gsms.etats.DEMONTRABLE'), value: byState('DEMONTRABLE'), subtitle: t('gsms.qualite.kpi.surN', { n: evaluations.data?.indicateurs.length ?? 0 }), icon: 'check-circle', tone: 'success', to: '/platform/qualite/indicateurs?etat=DEMONTRABLE' },
  { key: 'insuffisantes', label: t('gsms.etats.PREUVES_INSUFFISANTES'), value: byState('PREUVES_INSUFFISANTES'), subtitle: t('gsms.qualite.kpi.indicateurs'), icon: 'error-circle', tone: 'danger', to: '/platform/qualite/indicateurs?etat=PREUVES_INSUFFISANTES' },
  { key: 'risque', label: t('gsms.etats.A_RISQUE'), value: byState('A_RISQUE'), subtitle: t('gsms.qualite.kpi.indicateurs'), icon: 'time', tone: 'warning', to: '/platform/qualite/indicateurs?etat=A_RISQUE' },
  { key: 'ecarts', label: t('gsms.qualite.kpi.ecartsOuverts'), value: (evaluations.data?.indicateurs ?? []).reduce((n, i) => n + i.ecarts_ouverts, 0), subtitle: t('gsms.qualite.kpi.aTraiter'), icon: 'flag', to: '/platform/qualite/constats' },
])

const alerts = computed(() => {
  const items: AlertItem[] = [
    ...(gaps.data ?? []).map<AlertItem>((f) => ({
      id: f.id, title: f.titre, subtitle: f.explication ?? undefined, kind: f.indicateur ? `I${f.indicateur}` : t('gsms.qualite.kpi.ecart'),
      when: fmtDate(f.constate_le), tone: f.gravite === 'majeure' ? 'danger' : 'warning', to: '/platform/qualite/constats',
    })),
    ...(milestones.data ?? []).map<AlertItem>((m, n) => ({
      id: `m${n}`, title: `${m.label} · ${m.session}`, subtitle: m.explanation, kind: m.indicators.map((i) => `I${i}`).join(' ') || undefined,
      when: fmtDate(m.due_on), tone: m.status === 'EN_RETARD' ? 'danger' : 'warning', to: `/platform/sessions/${m.session_id}`,
    })),
  ]
  return {
    title: t('gsms.qualite.aTraiter'), subtitle: t('gsms.qualite.aTraiterAide'), items,
    loading: loadingOf(gaps) || loadingOf(milestones), error: gaps.error ?? milestones.error,
    empty: t('gsms.qualite.rienATraiter'), moreTo: '/platform/qualite/constats',
  }
})

const engine = computed(() => ({
  subtitle: evaluations.data?.avertissement ?? '',
  loading: loadingOf(carnet),
  error: carnet.error,
  rows: (carnet.data?.fiches ?? []).map((f) => ({
    numero: f.numero, nom: f.nom || f.titre, etat: f.etat, to: `/platform/qualite/indicateurs/${f.numero}`,
    detail: t('gsms.qualite.kpi.preuvesExploitables', { n: f.preuves.exploitables, total: f.preuves.total }),
  })),
}))

const modules = computed<ModuleItem[]>(() => [
  { key: 'indicateurs', title: t('gsms.menu.entrees.indicateurs'), icon: 'chart-bar', to: '/platform/qualite/indicateurs',
    description: t('gsms.qualite.modules.indicateurs'), loading: loadingOf(evaluations), error: evaluations.error,
    figures: [{ label: t('gsms.etats.DEMONTRABLE'), value: byState('DEMONTRABLE') }, { label: t('gsms.qualite.kpi.indicateurs'), value: evaluations.data?.indicateurs.length ?? 0 }] },
  { key: 'carnet', title: t('gsms.menu.entrees.carnet'), icon: 'book-open', to: '/platform/qualite/carnet',
    description: t('gsms.qualite.modules.carnet'), loading: loadingOf(carnet), error: carnet.error,
    figures: [{ label: t('gsms.qualite.kpi.fiches'), value: carnet.data?.fiches.length ?? 0 }, { label: t('gsms.qualite.kpi.referentiel'), value: carnet.data?.referentiel.version ?? '—' }] },
  { key: 'preuves', title: t('gsms.menu.entrees.preuves'), icon: 'file-safety', to: '/platform/qualite/preuves',
    description: t('gsms.qualite.modules.preuves'), loading: loadingOf(evidence), error: evidence.error,
    figures: [{ label: t('gsms.qualite.kpi.total'), value: evidence.data?.total ?? 0 }, { label: t('gsms.etats.DETECTEE'), value: toReview.value }] },
  { key: 'constats', title: t('gsms.menu.entrees.constats'), icon: 'flag', to: '/platform/qualite/constats',
    description: t('gsms.qualite.modules.constats'), loading: loadingOf(gaps) || loadingOf(capas), error: gaps.error ?? capas.error,
    figures: [{ label: t('gsms.qualite.kpi.aTraiter'), value: gaps.data?.length ?? 0 }, { label: t('gsms.qualite.kpi.actionsEnRetard'), value: lateCapa.value }] },
  { key: 'audits', title: t('gsms.menu.entrees.audits'), icon: 'fact-check', to: '/platform/qualite/audits',
    description: t('gsms.qualite.modules.audits'), loading: loadingOf(audits), error: audits.error,
    figures: [{ label: t('gsms.qualite.kpi.total'), value: audits.data?.audits.length ?? 0 }, { label: t('gsms.etats.EN_COURS'), value: (audits.data?.audits ?? []).filter((a) => a.statut === 'EN_COURS').length }] },
  { key: 'reclamations', title: t('gsms.menu.entrees.reclamations'), icon: 'chat-bubble-error', to: '/platform/qualite/reclamations',
    description: t('gsms.qualite.modules.reclamations'), loading: loadingOf(complaints), error: complaints.error,
    figures: [{ label: t('gsms.qualite.kpi.total'), value: complaints.data?.length ?? 0 }, { label: t('gsms.qualite.reclamations.nonResolues'), value: (complaints.data ?? []).filter((c) => !c.resolved_on).length }] },
  { key: 'veille', title: t('gsms.menu.entrees.veille'), icon: 'browse', to: '/platform/qualite/veille',
    description: t('gsms.qualite.modules.veille'), loading: loadingOf(watch), error: watch.error,
    figures: [{ label: t('gsms.qualite.kpi.total'), value: watch.data?.length ?? 0 }, { label: t('gsms.qualite.veille.nonExploitees'), value: (watch.data ?? []).filter((w) => !w.exploited_on).length }] },
  { key: 'dossier', title: t('gsms.menu.entrees.dossier'), icon: 'folder', to: '/platform/qualite/dossier',
    description: t('gsms.qualite.modules.dossier'), loading: loadingOf(dossier), error: dossier.error,
    figures: [{ label: t('gsms.qualite.kpi.recues'), value: dossier.data?.complete ?? 0 }, { label: t('gsms.qualite.kpi.obligatoires'), value: dossier.data?.required ?? 0 }] },
])
</script>
