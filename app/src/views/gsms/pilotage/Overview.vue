<template>
  <GsmsSectionLanding :title="t('gsms.pilotage.titre')" icon="dashboard" :description="t('gsms.pilotage.sousTitre')"
    :kpis="kpis" :kpi-loading="loading && !roadmap" :error="error" :alerts="alerts" :modules="modules">
    <template #actions>
      <t-select v-model="weeks" :options="weekOptions" size="small" class="horizon" :aria-label="t('gsms.pilotage.horizon')" />
    </template>

    <section id="feuille-de-route" class="roadmap">
      <div class="roadmap-head">
        <h3>{{ t('gsms.pilotage.feuilleDeRoute') }}</h3>
        <GsmsFilterTabs v-model="state" :options="stateTabs" :label="t('gsms.commun.filtrerEtat')" />
      </div>
      <p v-if="roadmap" class="muted">{{ t('gsms.pilotage.periode', { du: fmtDate(roadmap.aujourd_hui), au: fmtDate(roadmap.jusqu_au) }) }}</p>
      <div v-if="loading && !roadmap" class="grid"><div v-for="n in 3" :key="n" class="card is-skeleton"><t-skeleton animation="gradient" :row-col="[{ width: '60%' }, { width: '90%' }]" /></div></div>
      <template v-else-if="roadmap">
        <EmptyState v-if="!roadmapItems.length" icon="calendar" compact :title="t('gsms.pilotage.aucuneEcheance')"
          :description="state === 'all' ? t('gsms.pilotage.aucuneEcheanceAide') : t('gsms.commun.aucunDansEtat')" />
        <template v-for="week in weekGroups" :key="week.key">
          <div class="section-header">
            <t-icon name="calendar" size="14px" />
            <span>{{ t('gsms.pilotage.semaineDu', { date: fmtDate(week.key) }) }}</span>
            <span class="section-count">{{ week.items.length }}</span>
          </div>
          <div class="grid">
            <component :is="item.to ? 'router-link' : 'div'" v-for="(item, i) in week.items" :key="i" :to="item.to || undefined"
              class="card" :class="{ 'card--static': !item.to }">
              <div class="card-header">
                <div class="card-header-left"><span class="card-title" :title="item.titre">{{ item.titre }}</span></div>
                <GsmsStatusTag :code="item.etat" />
              </div>
              <div class="card-content"><p class="card-description">{{ item.detail }}</p></div>
              <div class="card-bottom">
                <div class="card-meta">
                  <span><t-icon name="time" size="14px" />{{ fmtDate(item.echeance) }}</span>
                  <span>{{ sourceLabel(item.source) }}</span>
                </div>
                <div class="chips"><span v-for="n in item.indicateurs" :key="n" class="chip">I{{ n }}</span></div>
              </div>
            </component>
          </div>
        </template>
      </template>
    </section>
  </GsmsSectionLanding>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import EmptyState from '@/components/EmptyState.vue'
import GsmsSectionLanding from '@/components/gsms/GsmsSectionLanding.vue'
import GsmsFilterTabs from '@/components/gsms/GsmsFilterTabs.vue'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import type { AlertItem, KpiItem, ModuleItem } from '@/components/gsms/types'
import { getRoadmap, type Roadmap } from '@/api/gsms/pilotage'
import { getEvaluations, type Evaluations } from '@/api/gsms/qualite'
import { listSessions, type SessionRow } from '@/api/gsms/sessions'
import { useGsmsAccessStore } from '@/stores/gsmsAccess'
import { fmtDate, mapApiLink, stateLabel } from '@/components/gsms/format'

const { t, te } = useI18n()
const route = useRoute()
const access = useGsmsAccessStore()

const roadmap = ref<Roadmap | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const weeks = ref(6)
const state = ref(typeof route.query.etat === 'string' ? route.query.etat : 'all')
const weekOptions = computed(() => [2, 4, 6, 12, 26].map((n) => ({ label: t('gsms.pilotage.nSemaines', { n }), value: n })))
const sourceLabel = (s: string) => (te(`gsms.pilotage.sources.${s}`) ? t(`gsms.pilotage.sources.${s}`) : stateLabel(s))

async function loadRoadmap() {
  loading.value = true
  error.value = null
  try {
    roadmap.value = await getRoadmap(weeks.value)
  } catch (e) {
    error.value = e
    roadmap.value = null
  } finally {
    loading.value = false
  }
}
watch(weeks, loadRoadmap, { immediate: true })
watch(() => route.query.etat, (v) => { if (typeof v === 'string') state.value = v })

// Chiffres des modules : seulement ceux que le compte peut ouvrir (GET /bootstrap).
const evaluations = ref<Evaluations | null>(null)
const evaluationsError = ref<unknown>(null)
const sessions = ref<SessionRow[] | null>(null)
const sessionsError = ref<unknown>(null)
onMounted(async () => {
  await access.load()
  if (access.hasNav('qualite')) getEvaluations().then((v) => { evaluations.value = v }).catch((e) => { evaluationsError.value = e })
  if (access.hasNav('sessions', 'mes_sessions')) listSessions().then((v) => { sessions.value = v }).catch((e) => { sessionsError.value = e })
})

const items = computed(() => roadmap.value?.elements ?? [])
const count = (etat: string) => items.value.filter((i) => i.etat === etat).length
const kpis = computed<KpiItem[]>(() => [
  { key: 'retard', label: t('gsms.etats.EN_RETARD'), value: count('EN_RETARD'), subtitle: t('gsms.pilotage.kpi.echeancesDepassees'), icon: 'error-circle', tone: 'danger', to: '/platform/pilotage?etat=EN_RETARD#feuille-de-route' },
  { key: 'echeance', label: t('gsms.etats.A_ECHEANCE'), value: count('A_ECHEANCE'), subtitle: t('gsms.pilotage.kpi.cetteSemaine'), icon: 'time', tone: 'warning', to: '/platform/pilotage?etat=A_ECHEANCE#feuille-de-route' },
  { key: 'avenir', label: t('gsms.etats.A_VENIR'), value: count('A_VENIR'), subtitle: t('gsms.pilotage.kpi.surLaPeriode'), icon: 'calendar', to: '/platform/pilotage?etat=A_VENIR#feuille-de-route' },
  { key: 'sources', label: t('gsms.pilotage.kpi.sources'), value: roadmap.value?.sources.length ?? 0, subtitle: (roadmap.value?.sources ?? []).map(sourceLabel).join(', '), icon: 'root-list' },
])

const alerts = computed(() => ({
  title: t('gsms.pilotage.aTraiter'),
  subtitle: t('gsms.pilotage.aTraiterAide'),
  loading: loading.value && !roadmap.value,
  empty: t('gsms.pilotage.rienATraiter'),
  moreTo: '/platform/pilotage?etat=EN_RETARD#feuille-de-route',
  items: items.value
    .filter((i) => i.etat === 'EN_RETARD' || i.etat === 'A_ECHEANCE')
    .map<AlertItem>((i, n) => ({
      id: `${n}`, title: i.titre, subtitle: i.detail, kind: sourceLabel(i.source), when: fmtDate(i.echeance),
      tone: i.etat === 'EN_RETARD' ? 'danger' : 'warning', to: mapApiLink(i.lien),
    })),
}))

const modules = computed<ModuleItem[]>(() => {
  const out: ModuleItem[] = []
  if (access.hasNav('qualite')) {
    const ind = evaluations.value?.indicateurs ?? []
    out.push({
      key: 'qualiopi', title: t('gsms.menu.sections.qualiopi'), icon: 'secured', to: '/platform/qualite',
      description: t('gsms.pilotage.modules.qualiopi'), loading: !evaluations.value && !evaluationsError.value, error: evaluationsError.value,
      figures: [
        { label: t('gsms.etats.DEMONTRABLE'), value: ind.filter((i) => i.etat === 'DEMONTRABLE').length },
        { label: t('gsms.qualite.kpi.ecartsOuverts'), value: ind.reduce((n, i) => n + i.ecarts_ouverts, 0) },
      ],
    })
  }
  if (access.hasNav('sessions', 'mes_sessions')) {
    const rows = sessions.value ?? []
    out.push({
      key: 'sessions', title: t('gsms.menu.entrees.sessions'), icon: 'calendar-1', to: '/platform/sessions',
      description: t('gsms.pilotage.modules.sessions'), loading: !sessions.value && !sessionsError.value, error: sessionsError.value,
      figures: [
        { label: t('gsms.etats.EN_COURS'), value: rows.filter((s) => s.status === 'EN_COURS').length },
        { label: t('gsms.pilotage.modules.aVenir'), value: rows.filter((s) => s.status === 'PLANIFIEE' || s.status === 'CONFIRMEE').length },
      ],
    })
  }
  return out
})

const ORDER = ['EN_RETARD', 'A_ECHEANCE', 'A_VENIR']
const stateTabs = computed(() => {
  const present = [...new Set(items.value.map((i) => i.etat))].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))
  return [{ value: 'all', label: t('gsms.commun.toutes'), count: items.value.length },
    ...present.map((s) => ({ value: s, label: stateLabel(s), count: count(s) }))]
})
const roadmapItems = computed(() => items.value
  .filter((i) => state.value === 'all' || i.etat === state.value)
  .map((i) => ({ ...i, to: mapApiLink(i.lien) })))
const weekGroups = computed(() => {
  const map = new Map<string, typeof roadmapItems.value>()
  for (const item of roadmapItems.value) {
    if (!map.has(item.semaine)) map.set(item.semaine, [])
    map.get(item.semaine)!.push(item)
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, list]) => ({ key, items: list }))
})
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.roadmap { scroll-margin-top: 12px; }
.roadmap-head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; h3 { .gsms-panel-title(); margin: 0; } }
.grid { .gsms-grid(); margin-bottom: 8px; }
.card { .gsms-card(); text-decoration: none; color: inherit; }
.card--static { cursor: default; }
.section-header { .gsms-section-header(); .section-count { color: var(--td-text-color-placeholder); } }
.chips { display: flex; flex-wrap: wrap; gap: 4px; }
.chip { .gsms-chip(); }
.muted { .gsms-muted(); margin: 6px 0; }
.horizon { width: 150px; }
</style>
