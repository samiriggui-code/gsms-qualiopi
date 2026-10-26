<template>
  <GsmsSectionLanding :title="t('gsms.ecole.titre')" icon="education" :description="t('gsms.ecole.sousTitre')"
    :error="catalogue.error" :kpis="kpis" :kpi-loading="loadingOf(catalogue) || loadingOf(summary) || loadingOf(learners)"
    :alerts="alerts" :modules="modules" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import GsmsSectionLanding from '@/components/gsms/GsmsSectionLanding.vue'
import { useApiSource, type ApiSource } from '@/components/gsms/useApiSource'
import type { AlertItem, KpiItem, ModuleItem } from '@/components/gsms/types'
import { getCatalogue } from '@/api/gsms/training'
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
const learners = useApiSource(listLearnerRecords).state
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
  return showQuotes.value ? (await listEditions()).filter((e) => e.type === 'DEVIS') : null
}).state
const companies = useApiSource(listCompanies).state

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
</script>
