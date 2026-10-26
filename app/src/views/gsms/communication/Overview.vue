<template>
  <GsmsSectionLanding :title="t('gsms.communication.titre')" icon="mail" :description="t('gsms.communication.sousTitre')"
    :kpis="kpis" :kpi-loading="loadingOf(pending) || loadingOf(evidence)" :alerts="alerts" :engine="engine" :modules="modules">
    <template v-if="!pending.error" #charts>
      <GsmsChartCard :title="t('gsms.graphiques.communication.messages')" :subtitle="t('gsms.graphiques.communication.messagesSous')"
        icon="chart-bar" :loading="loadingOf(pending)" more-to="/platform/messages">
        <GsmsBarChart :caption="t('gsms.graphiques.communication.messages')" :data="messageChart" horizontal />
      </GsmsChartCard>
    </template>
    <p class="notice"><t-icon name="info-circle" size="14px" />{{ t('gsms.communication.messages.parDefaut') }}</p>
  </GsmsSectionLanding>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import GsmsSectionLanding from '@/components/gsms/GsmsSectionLanding.vue'
import GsmsChartCard from '@/components/gsms/GsmsChartCard.vue'
import GsmsBarChart from '@/components/gsms/GsmsBarChart.vue'
import { fromCounts } from '@/components/gsms/chartTheme'
import { useApiSource } from '@/components/gsms/useApiSource'
import type { AlertItem, KpiItem, ModuleItem } from '@/components/gsms/types'
import { listMessages, listRelanceRules } from '@/api/gsms/relances'
import { getCarnet, listEvidence } from '@/api/gsms/qualite'
import { fmtDate } from '@/components/gsms/format'

const { t, te } = useI18n()

// Messages à valider et en échec : les points à traiter ; les compteurs (tous statuts) viennent de la même réponse.
const pending = useApiSource(() => listMessages({ statut: 'A_VALIDER', limite: 20 })).state
const failed = useApiSource(() => listMessages({ statut: 'ECHEC', limite: 20 })).state
const rules = useApiSource(listRelanceRules).state
const evidence = useApiSource(() => listEvidence()).state
const carnet = useApiSource(getCarnet).state

const loadingOf = (s: { data: unknown; error: unknown }) => !s.data && !s.error
const count = (code: string) => pending.data?.compteurs[code] ?? 0
const statusLabel = (code: string) => (te(`gsms.communication.statuts.${code}`) ? t(`gsms.communication.statuts.${code}`) : code)
const documents = computed(() => (evidence.data?.preuves ?? []).filter((p) => !!p.document_id))
const msgLink = (statut: string) => `/platform/messages?statut=${statut}`

// Un chiffre refusé par l'API n'est pas affiché (jamais un zéro à sa place) : la carte du module montre le refus.
const kpis = computed<KpiItem[]>(() => [
  ...(pending.error ? [] : [
    { key: 'aValider', label: statusLabel('A_VALIDER'), value: count('A_VALIDER'), subtitle: t('gsms.communication.kpi.avantEnvoi'), icon: 'check-circle', tone: 'warning' as const, to: msgLink('A_VALIDER') },
    { key: 'prevus', label: statusLabel('PREVU'), value: count('PREVU'), icon: 'time', to: msgLink('PREVU') },
    { key: 'envoyes', label: statusLabel('ENVOYE'), value: count('ENVOYE'), icon: 'mail', tone: 'success' as const, to: msgLink('ENVOYE') },
    { key: 'echecs', label: statusLabel('ECHEC'), value: count('ECHEC'), subtitle: t('gsms.communication.kpi.sansAdresse', { n: count('SANS_ADRESSE') }), icon: 'error-circle', tone: 'danger' as const, to: msgLink('ECHEC') },
  ]),
  ...(evidence.error ? [] : [
    { key: 'documents', label: t('gsms.communication.kpi.documents'), value: documents.value.length,
      // Liste de preuves tronquée par l'API : le chiffre est partiel et le dit.
      subtitle: evidence.data && evidence.data.total > evidence.data.affichees
        ? t('gsms.communication.documents.tronque', { n: evidence.data.affichees, total: evidence.data.total })
        : t('gsms.communication.kpi.rattaches'),
      icon: 'folder-open', to: '/platform/documents' },
  ]),
])

const alerts = computed(() => {
  const items: AlertItem[] = []
  const envoi = pending.data?.envoi
  if (envoi && envoi.etat !== 'OK') {
    items.push({ id: 'envoi', title: t(`gsms.communication.envoi.${envoi.etat === 'EN_PANNE' ? 'enPanne' : 'aVerifier'}`), subtitle: envoi.motif ?? undefined,
      kind: t('gsms.communication.envoi.source'), tone: 'danger', to: msgLink('ECHEC') })
  }
  for (const m of pending.data?.messages ?? []) {
    items.push({ id: m.id, title: m.objet, subtitle: m.destinataire.nom ?? undefined, kind: statusLabel(m.statut), when: fmtDate(m.prevu_le), tone: 'warning', to: msgLink('A_VALIDER') })
  }
  for (const m of failed.data?.messages ?? []) {
    items.push({ id: m.id, title: m.objet, subtitle: m.erreur ?? undefined, kind: statusLabel(m.statut), when: fmtDate(m.prevu_le), tone: 'danger', to: msgLink('ECHEC') })
  }
  return {
    title: t('gsms.communication.aTraiter'), subtitle: t('gsms.communication.aTraiterAide'), items,
    loading: loadingOf(pending) || loadingOf(failed), error: pending.error ?? failed.error,
    empty: t('gsms.communication.rienATraiter'), moreTo: '/platform/messages',
  }
})

// Indicateurs que les règles de relance aident à démontrer (champ `indicateurs` de chaque règle), état tiré du carnet.
const ruleIndicators = computed(() => new Set((rules.data ?? []).flatMap((r) => r.indicateurs ?? [])))
const engine = computed(() => (rules.error || (rules.data && !ruleIndicators.value.size) ? null : {
  subtitle: carnet.data?.avertissement ?? '',
  loading: loadingOf(rules) || loadingOf(carnet),
  error: carnet.error,
  rows: (carnet.data?.fiches ?? []).filter((f) => ruleIndicators.value.has(f.numero)).map((f) => ({
    numero: f.numero, nom: f.nom || f.titre, etat: f.etat, to: `/platform/qualite/indicateurs/${f.numero}`,
    detail: t('gsms.qualite.kpi.preuvesExploitables', { n: f.preuves.exploitables, total: f.preuves.total }),
  })),
}))

const modules = computed<ModuleItem[]>(() => [
  { key: 'messages', title: t('gsms.menu.entrees.messages'), icon: 'mail', to: '/platform/messages',
    description: t('gsms.communication.modules.messages'), loading: loadingOf(pending), error: pending.error,
    figures: [{ label: statusLabel('A_VALIDER'), value: count('A_VALIDER') }, { label: t('gsms.communication.kpi.regles'), value: rules.data?.length ?? '—' }] },
  { key: 'documents', title: t('gsms.menu.entrees.documents'), icon: 'folder-open', to: '/platform/documents',
    description: t('gsms.communication.modules.documents'), loading: loadingOf(evidence), error: evidence.error,
    figures: [{ label: t('gsms.communication.kpi.documents'), value: documents.value.length },
      { label: t('gsms.communication.kpi.types'), value: new Set(documents.value.map((d) => d.type)).size }] },
])
// Graphique : compteurs par statut renvoyés avec la liste des messages (GET /communications).
const messageChart = computed(() => fromCounts(pending.data?.compteurs ?? {}, ['A_VALIDER', 'PREVU', 'ENVOYE', 'ECHEC', 'SANS_ADRESSE', 'ANNULE'],
  statusLabel, msgLink, { SANS_ADRESSE: 'neutral', ANNULE: 'neutral' }))
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.notice { .gsms-notice(); margin-top: 16px; }
</style>
