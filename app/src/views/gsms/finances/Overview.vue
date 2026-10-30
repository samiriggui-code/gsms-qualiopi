<template>
  <GsmsSectionLanding :title="t('gsms.finances.titre')" icon="wallet" :description="t('gsms.finances.sousTitre')"
    :error="bothRefused ? invoices.error : null" :kpis="kpis" :kpi-loading="loadingOf(invoices) && loadingOf(cases)"
    :alerts="alerts" :engine="null" :modules="modules">
    <template #charts>
      <GsmsChartCard v-if="!invoices.error" :title="t('gsms.graphiques.finances.montants')" :subtitle="t('gsms.graphiques.finances.montantsSous')"
        icon="money" :loading="loadingOf(invoices)" more-to="/platform/factures">
        <GsmsBarChart :caption="t('gsms.graphiques.finances.montants')" :data="amountChart" :format="euros" horizontal />
      </GsmsChartCard>
      <GsmsChartCard v-if="!invoices.error" :title="t('gsms.graphiques.finances.factures')" :subtitle="t('gsms.graphiques.finances.facturesSous')"
        icon="chart-ring" :loading="loadingOf(invoices)" more-to="/platform/factures">
        <GsmsDonut :data="invoiceChart" />
      </GsmsChartCard>
      <GsmsChartCard :title="t('gsms.graphiques.finances.dossiers')" :subtitle="t('gsms.graphiques.finances.dossiersSous')" icon="folder"
        :loading="loadingOf(cases)" :error="cases.error" more-to="/platform/financement">
        <GsmsDonut :data="caseChart" :total="cases.data?.length" :total-label="t('gsms.finances.kpi.dossiers')" />
      </GsmsChartCard>
    </template>
  </GsmsSectionLanding>
</template>

<script setup lang="ts">
/**
 * Vue d'ensemble Finances (niveau 1) : chiffres de GET /factures/synthese et des dossiers de financement,
 * points à traiter (factures en retard, échéances de financement dépassées). Les deux modules sont désactivés
 * par défaut : chacun montre son propre refus dans sa carte, jamais des compteurs à zéro.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import GsmsSectionLanding from '@/components/gsms/GsmsSectionLanding.vue'
import GsmsChartCard from '@/components/gsms/GsmsChartCard.vue'
import GsmsDonut from '@/components/gsms/GsmsDonut.vue'
import GsmsBarChart from '@/components/gsms/GsmsBarChart.vue'
import { countBy, fromCounts, type ChartDatum } from '@/components/gsms/chartTheme'
import { useApiSource } from '@/components/gsms/useApiSource'
import type { AlertItem, KpiItem, ModuleItem, Tone } from '@/components/gsms/types'
import { getInvoiceOverview, listPayments } from '@/api/gsms/invoicing'
import { listFundingCases, listFundingDeadlines } from '@/api/gsms/funding'
import { fmtDate, stateLabel } from '@/components/gsms/format'
import { centimes } from './display'

const { t } = useI18n()

const invoices = useApiSource(getInvoiceOverview).state
const payments = useApiSource(() => listPayments()).state
const cases = useApiSource(listFundingCases).state
const deadlines = useApiSource(() => listFundingDeadlines(15)).state

const loadingOf = (s: { data: unknown; error: unknown }) => !s.data && !s.error
const bothRefused = computed(() => !!invoices.error && !!cases.error)
const caseOfSource = computed(() => {
  const map = new Map<string, string>()
  for (const c of cases.data ?? []) for (const s of c.sources) map.set(s.id, c.inscription_id)
  return map
})
const lateDeadlines = computed(() => (deadlines.data ?? []).filter((d) => d.etat === 'EN_RETARD').length)
const pendingCases = computed(() => (cases.data ?? []).filter((c) => c.statut === 'PENDING').length)

const kpis = computed<KpiItem[]>(() => [
  ...(invoices.data ? [
    { key: 'aEncaisser', label: t('gsms.finances.kpi.aEncaisser'), value: centimes(invoices.data.a_encaisser_centimes),
      subtitle: t('gsms.finances.kpi.facturesEmises'), icon: 'wallet', to: '/platform/factures?type=FACTURE' },
    { key: 'enRetard', label: t('gsms.finances.kpi.enRetard'), value: centimes(invoices.data.en_retard_centimes),
      subtitle: t('gsms.finances.kpi.echeanceDepassee'), icon: 'error-circle', tone: 'danger' as const, to: '/platform/factures?retard=1' },
    { key: 'encaisse', label: t('gsms.finances.kpi.encaisseMois'), value: centimes(invoices.data.encaisse_ce_mois_centimes),
      subtitle: t('gsms.finances.kpi.horsAnnules'), icon: 'money', tone: 'success' as const, to: '/platform/paiements' },
    { key: 'brouillons', label: t('gsms.finances.kpi.brouillons'), value: invoices.data.brouillons,
      subtitle: t('gsms.finances.kpi.sansNumero'), icon: 'edit', to: '/platform/factures?statut=BROUILLON' },
  ] : []),
  ...(cases.data ? [
    { key: 'dossiers', label: t('gsms.finances.kpi.dossiers'), value: cases.data.length,
      subtitle: t('gsms.finances.kpi.dontAccordEnAttente', { n: pendingCases.value }), icon: 'folder', to: '/platform/financement' },
  ] : []),
])

const TONES: Record<string, Tone> = { danger: 'danger', warning: 'warning', info: 'muted' }

const alerts = computed(() => {
  const items: AlertItem[] = [
    ...(invoices.data?.alertes ?? []).map<AlertItem>((a, n) => ({
      id: `f${n}`, title: a.message, kind: t('gsms.finances.facture'), tone: TONES[a.niveau] ?? 'muted', to: `/platform/factures/${a.id}`,
    })),
    ...(deadlines.data ?? []).map<AlertItem>((d) => {
      const enrollment = caseOfSource.value.get(d.source_id)
      return {
        id: `d${d.source_id}${d.action}`, title: `${d.libelle} · ${d.stagiaire}`,
        subtitle: [d.session, d.portail ? t('gsms.finances.surPortail', { portail: d.portail }) : ''].filter(Boolean).join(' · '),
        kind: d.dispositif, when: fmtDate(d.echeance), tone: d.etat === 'EN_RETARD' ? 'danger' : 'warning',
        to: enrollment ? `/platform/financement/${enrollment}` : '/platform/financement',
      }
    }),
  ]
  // Un refus n'est jamais présenté comme « rien à traiter » : sans point à afficher, le refus s'affiche.
  const error = items.length ? null : (invoices.error ?? deadlines.error)
  return {
    title: t('gsms.finances.aTraiter'), subtitle: t('gsms.finances.aTraiterAide'), items,
    loading: loadingOf(invoices) && loadingOf(deadlines), error, empty: t('gsms.finances.rienATraiter'),
  }
})

const modules = computed<ModuleItem[]>(() => [
  { key: 'financement', title: t('gsms.menu.entrees.financement'), icon: 'wallet', to: '/platform/financement',
    description: t('gsms.finances.modules.financement'), loading: loadingOf(cases) || loadingOf(deadlines), error: cases.error ?? deadlines.error,
    figures: [{ label: t('gsms.finances.kpi.dossiers'), value: cases.data?.length ?? 0 },
      { label: t('gsms.finances.kpi.echeancesDepassees'), value: lateDeadlines.value }] },
  { key: 'factures', title: t('gsms.menu.entrees.factures'), icon: 'file', to: '/platform/factures',
    description: t('gsms.finances.modules.factures'), loading: loadingOf(invoices), error: invoices.error,
    figures: [{ label: stateLabel('EMISE'), value: invoices.data?.statuts.EMISE ?? 0 },
      { label: t('gsms.finances.kpi.brouillons'), value: invoices.data?.brouillons ?? 0 }] },
  { key: 'paiements', title: t('gsms.menu.entrees.paiements'), icon: 'money', to: '/platform/paiements',
    description: t('gsms.finances.modules.paiements'), loading: loadingOf(payments) || loadingOf(invoices), error: payments.error ?? invoices.error,
    figures: [{ label: t('gsms.finances.kpi.encaisseMois'), value: invoices.data ? centimes(invoices.data.encaisse_ce_mois_centimes) : '—' },
      { label: t('gsms.finances.kpi.encaissements'), value: payments.data?.length ?? 0 }] },
])

// Graphiques : montants et compteurs de GET /factures/synthese, dossiers regroupés par l'état que l'API leur donne.
// L'évolution mensuelle des encaissements n'est pas tracée : l'API ne renvoie pas encore de série par mois.
const euros = (n: number) => centimes(n)
const amountChart = computed<ChartDatum[]>(() => {
  const d = invoices.data
  if (!d) return []
  return [
    { key: 'encaisse', label: t('gsms.finances.kpi.encaisseMois'), value: d.encaisse_ce_mois_centimes, tone: 'success', to: '/platform/paiements' },
    { key: 'aEncaisser', label: t('gsms.finances.kpi.aEncaisser'), value: d.a_encaisser_centimes, tone: 'brand', to: '/platform/factures?type=FACTURE' },
    { key: 'enRetard', label: t('gsms.finances.kpi.enRetard'), value: d.en_retard_centimes, tone: 'danger', to: '/platform/factures?retard=1' },
  ]
})
const invoiceChart = computed(() => fromCounts(invoices.data?.statuts ?? {}, ['BROUILLON', 'EMISE', 'PAYEE_PARTIELLEMENT', 'PAYEE', 'ANNULEE'],
  stateLabel, (code) => `/platform/factures?statut=${code}`, { BROUILLON: 'neutral', ANNULEE: 'danger' }))
const caseChart = computed(() => fromCounts(countBy(cases.data ?? [], (c) => c.statut), ['FUNDED', 'PARTIALLY_FUNDED', 'PENDING', 'UNFUNDED'],
  stateLabel, () => '/platform/financement'))
</script>
