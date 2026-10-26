<template>
  <GsmsSectionLanding :title="t('gsms.rh.titre')" icon="user-talk" :description="t('gsms.rh.sousTitre')"
    :error="trainers.error" :kpis="kpis" :kpi-loading="loadingOf(trainers)"
    :alerts="alerts" :engine="engine" :modules="modules" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import GsmsSectionLanding from '@/components/gsms/GsmsSectionLanding.vue'
import { useApiSource } from '@/components/gsms/useApiSource'
import type { AlertItem, KpiItem, ModuleItem } from '@/components/gsms/types'
import { listStaff, listStaffDevelopment, listTitleDeadlines, listTrainers } from '@/api/gsms/rh'
import { listRessources } from '@/api/gsms/ressources'
import { getCarnet } from '@/api/gsms/qualite'
import { fmtDate } from '@/components/gsms/format'
import { codeLabel } from './forms'

// Indicateurs du référentiel suivis par la rubrique RH : compétences des intervenants (21), développement des
// compétences (22), sous-traitance (27). Leur état vient du carnet calculé par le moteur.
const RH_INDICATORS = [21, 22, 27]

const { t } = useI18n()

const trainers = useApiSource(listTrainers).state
const deadlines = useApiSource(() => listTitleDeadlines()).state
const staff = useApiSource(() => listStaff()).state
const dev = useApiSource(listStaffDevelopment).state
const subs = useApiSource(() => listRessources('subcontractors')).state
const carnet = useApiSource(getCarnet).state

const loadingOf = (s: { data: unknown; error: unknown }) => !s.data && !s.error
const byState = (etat: string) => (deadlines.data ?? []).filter((d) => d.etat === etat).length
const devTodo = computed(() => (dev.data ?? []).filter((d) => !d.completed_on).length)

// Un chiffre refusé par l'API n'est pas affiché (jamais un zéro à sa place) : la carte du module montre le refus.
const kpis = computed<KpiItem[]>(() => [
  { key: 'formateurs', label: t('gsms.rh.kpi.formateurs'), value: trainers.data?.length ?? 0,
    subtitle: t('gsms.rh.kpi.dontExternes', { n: (trainers.data ?? []).filter((f) => f.is_external).length }), icon: 'user-talk', to: '/platform/formateurs' },
  ...(deadlines.error ? [] : [
    { key: 'expires', label: t('gsms.rh.kpi.titresExpires'), value: byState('EXPIRE'), subtitle: t('gsms.rh.kpi.aRenouveler'), icon: 'error-circle', tone: 'danger' as const, to: '/platform/formateurs' },
    { key: 'renouveler', label: t('gsms.rh.kpi.titresARenouveler'), value: byState('A_RENOUVELER'), subtitle: t('gsms.rh.kpi.sous90Jours'), icon: 'time', tone: 'warning' as const, to: '/platform/formateurs' },
  ]),
  ...(staff.error ? [] : [
    { key: 'personnel', label: t('gsms.rh.kpi.personnel'), value: staff.data?.length ?? 0, subtitle: t('gsms.rh.kpi.actifs'), icon: 'user-list', to: '/platform/personnel' },
  ]),
])

const alerts = computed(() => ({
  title: t('gsms.rh.aTraiter'), subtitle: t('gsms.rh.aTraiterAide'),
  items: (deadlines.data ?? []).map<AlertItem>((d, n) => ({
    id: `d${n}`, title: `${d.libelle} · ${d.formateur}`, subtitle: codeLabel(d.type), kind: t(`gsms.etats.${d.etat}`),
    when: fmtDate(d.fin), tone: d.etat === 'EXPIRE' ? 'danger' : 'warning', to: `/platform/formateurs/${d.formateur_id}`,
  })),
  loading: loadingOf(deadlines), error: deadlines.error, empty: t('gsms.rh.rienATraiter'), moreTo: '/platform/formateurs',
}))

const engine = computed(() => ({
  subtitle: carnet.data?.avertissement ?? '',
  loading: loadingOf(carnet),
  error: carnet.error,
  rows: (carnet.data?.fiches ?? []).filter((f) => RH_INDICATORS.includes(f.numero)).map((f) => ({
    numero: f.numero, nom: f.nom || f.titre, etat: f.etat, to: `/platform/qualite/indicateurs/${f.numero}`,
    detail: t('gsms.qualite.kpi.preuvesExploitables', { n: f.preuves.exploitables, total: f.preuves.total }),
  })),
}))

const modules = computed<ModuleItem[]>(() => [
  { key: 'formateurs', title: t('gsms.menu.entrees.formateurs'), icon: 'user-talk', to: '/platform/formateurs',
    description: t('gsms.rh.modules.formateurs'), loading: loadingOf(trainers), error: trainers.error,
    figures: [{ label: t('gsms.rh.kpi.formateurs'), value: trainers.data?.length ?? 0 },
      { label: t('gsms.rh.kpi.titres'), value: (trainers.data ?? []).reduce((n, f) => n + f.qualifications, 0) }] },
  { key: 'personnel', title: t('gsms.menu.entrees.personnel'), icon: 'user-list', to: '/platform/personnel',
    description: t('gsms.rh.modules.personnel'), loading: loadingOf(staff), error: staff.error,
    figures: [{ label: t('gsms.rh.kpi.actifs'), value: staff.data?.length ?? 0 },
      { label: t('gsms.rh.kpi.sansContrat'), value: (staff.data ?? []).filter((m) => !m.contrat_en_cours).length }] },
  { key: 'developpement', title: t('gsms.menu.entrees.developpement'), icon: 'chart-bar', to: '/platform/developpement',
    description: t('gsms.rh.modules.developpement'), loading: loadingOf(dev), error: dev.error,
    figures: [{ label: t('gsms.qualite.kpi.total'), value: dev.data?.length ?? 0 }, { label: t('gsms.rh.developpement.nonRealisees'), value: devTodo.value }] },
  { key: 'sousTraitants', title: t('gsms.menu.entrees.sousTraitants'), icon: 'link', to: '/platform/sous-traitants',
    description: t('gsms.rh.modules.sousTraitants'), loading: loadingOf(subs), error: subs.error,
    figures: [{ label: t('gsms.qualite.kpi.total'), value: subs.data?.length ?? 0 },
      { label: t('gsms.rh.kpi.declaresQualiopi'), value: (subs.data ?? []).filter((s) => s.qualiopi_certified).length }] },
])
</script>
