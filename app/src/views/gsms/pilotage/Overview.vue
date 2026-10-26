<template>
  <GsmsSectionLanding :title="t('gsms.pilotage.titre')" icon="dashboard" :description="t('gsms.pilotage.sousTitre')"
    :kpis="kpis" :kpi-loading="loading && !roadmap" :error="error" :modules="modules">
    <template #actions>
      <t-select v-model="weeks" :options="weekOptions" size="small" class="horizon" :aria-label="t('gsms.pilotage.horizon')" />
    </template>

    <template #charts>
      <div class="dash">
        <template v-if="!error">
          <GsmsChartCard :title="t('gsms.graphiques.pilotage.etats')" :subtitle="t('gsms.graphiques.pilotage.etatsSous')" icon="chart-ring"
            :loading="loading && !roadmap">
            <GsmsDonut :data="stateChart" :total="items.length" :total-label="t('gsms.graphiques.total')" />
          </GsmsChartCard>
          <GsmsChartCard :title="t('gsms.graphiques.pilotage.semaines')" :subtitle="t('gsms.graphiques.pilotage.semainesSous')" icon="chart-line"
            :loading="loading && !roadmap" class="span-2">
            <GsmsTrendChart :caption="t('gsms.graphiques.pilotage.semaines')" :categories="weekChart.categories" :series="weekChart.series"
              :height="230" />
          </GsmsChartCard>
        </template>
        <GsmsChartCard v-if="showQualite" :title="t('gsms.graphiques.indicateurs')" :subtitle="t('gsms.graphiques.indicateursSous')"
          icon="secured" :loading="!evaluations && !evaluationsError" :error="evaluationsError" more-to="/platform/qualite/indicateurs"
          :class="{ 'span-3': !showSessions }">
          <GsmsDonut :data="indicatorChart" :total="evaluations?.indicateurs.length" :total-label="t('gsms.qualite.kpi.indicateurs')" />
        </GsmsChartCard>
        <GsmsChartCard v-if="showSessions" :title="t('gsms.graphiques.pilotage.sessions')"
          :subtitle="t('gsms.graphiques.pilotage.sessionsSous')" icon="chart-bar" :loading="!sessions && !sessionsError" :error="sessionsError"
          more-to="/platform/sessions" :class="showQualite ? 'span-2' : 'span-3'">
          <GsmsBarChart :caption="t('gsms.graphiques.pilotage.sessions')" :data="sessionChart" horizontal />
        </GsmsChartCard>
      </div>
    </template>

    <template #body>
      <section v-if="!error" id="feuille-de-route" class="roadmap" :aria-labelledby="'roadmap-title'">
        <header class="roadmap-head">
          <span class="roadmap-icon" aria-hidden="true"><t-icon name="map-route-planning" size="18px" /></span>
          <div class="roadmap-titles">
            <h2 id="roadmap-title">{{ t('gsms.pilotage.feuilleDeRoute') }}</h2>
            <p v-if="roadmap" class="muted">{{ t('gsms.pilotage.periode', { du: fmtDate(roadmap.aujourd_hui), au: fmtDate(roadmap.jusqu_au) }) }}</p>
          </div>
          <GsmsFilterTabs v-if="sourceTabs.length > 2" v-model="source" :options="sourceTabs" :label="t('gsms.graphiques.pilotage.filtrerSource')" />
        </header>

        <div v-if="loading && !roadmap" class="board">
          <div v-for="n in 3" :key="n" class="column"><t-skeleton animation="gradient" :row-col="[{ width: '50%' }, { width: '100%', height: '72px' }, { width: '100%', height: '72px' }]" /></div>
        </div>
        <template v-else-if="roadmap">
          <EmptyState v-if="!items.length" icon="calendar" compact :title="t('gsms.pilotage.aucuneEcheance')" :description="t('gsms.pilotage.aucuneEcheanceAide')" />
          <template v-else>
            <p v-if="state !== 'all'" class="only-column">
              <t-button variant="text" theme="primary" size="small" @click="showAllColumns">
                <template #icon><t-icon name="view-column" /></template>{{ t('gsms.graphiques.pilotage.toutesColonnes') }}
              </t-button>
            </p>
            <div class="board" :class="{ 'board--single': state !== 'all' }">
              <section v-for="col in columns" :key="col.etat" class="column" :class="`column--${col.tone}`" :aria-labelledby="`col-${col.etat}`">
                <header class="column-head">
                  <t-icon :name="col.icon" size="16px" class="column-mark" aria-hidden="true" />
                  <div class="column-titles">
                    <h3 :id="`col-${col.etat}`">{{ stateLabel(col.etat) }}</h3>
                    <span class="column-sub">{{ t(`gsms.graphiques.pilotage.colonnes.${col.etat}`) }}</span>
                  </div>
                  <span class="column-count">{{ col.items.length }}</span>
                </header>
                <p v-if="!col.items.length" class="column-empty">{{ t('gsms.graphiques.pilotage.colonneVide') }}</p>
                <ul v-else class="cards">
                  <template v-for="(entry, i) in visible(col)" :key="i">
                    <li v-if="entry.week" class="week">{{ t('gsms.pilotage.semaineDu', { date: fmtDate(entry.week) }) }}</li>
                    <li v-else-if="entry.item">
                      <component :is="entry.item.to ? 'router-link' : 'div'" :to="entry.item.to || undefined" class="task" :class="{ 'task--static': !entry.item.to }">
                        <span class="task-source" :style="{ '--source': sourceColor(entry.item.source) }">{{ sourceLabel(entry.item.source) }}</span>
                        <span class="task-title">{{ entry.item.titre }}</span>
                        <span v-if="entry.item.detail" class="task-detail">{{ entry.item.detail }}</span>
                        <span class="task-foot">
                          <span class="task-when" :class="{ 'task-when--late': col.etat === 'EN_RETARD' }">
                            <t-icon name="time" size="13px" aria-hidden="true" />{{ relative(entry.item.echeance) }}
                            <span class="task-date">· {{ fmtDate(entry.item.echeance) }}</span>
                          </span>
                          <span class="chips"><span v-for="n in entry.item.indicateurs" :key="n" class="chip">I{{ n }}</span></span>
                        </span>
                      </component>
                    </li>
                  </template>
                </ul>
                <t-button v-if="col.items.length > LIMIT" variant="text" theme="primary" size="small" block class="more" @click="toggle(col.etat)">
                  {{ expanded[col.etat] ? t('gsms.graphiques.pilotage.reduire') : t('gsms.graphiques.pilotage.voirPlus', { n: col.items.length - LIMIT }) }}
                </t-button>
              </section>
            </div>
          </template>
        </template>
      </section>
    </template>
  </GsmsSectionLanding>
</template>

<script setup lang="ts">
/**
 * Tableau de bord (Pilotage) : chiffres clés, graphiques et feuille de route en colonnes. Les colonnes sont les
 * états que l'API donne à chaque échéance (en retard, à échéance, à venir) ; rien n'est recalculé ici, les
 * éléments sont seulement regroupés et filtrés pour l'affichage.
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import EmptyState from '@/components/EmptyState.vue'
import GsmsSectionLanding from '@/components/gsms/GsmsSectionLanding.vue'
import GsmsFilterTabs from '@/components/gsms/GsmsFilterTabs.vue'
import GsmsChartCard from '@/components/gsms/GsmsChartCard.vue'
import GsmsDonut from '@/components/gsms/GsmsDonut.vue'
import GsmsTrendChart from '@/components/gsms/GsmsTrendChart.vue'
import GsmsBarChart from '@/components/gsms/GsmsBarChart.vue'
import { countBy, fromCounts, useChartPalette, type ChartTone } from '@/components/gsms/chartTheme'
import type { KpiItem, ModuleItem } from '@/components/gsms/types'
import { getRoadmap, type Roadmap, type RoadmapItem } from '@/api/gsms/pilotage'
import { getEvaluations, type Evaluations } from '@/api/gsms/qualite'
import { listSessions, type SessionRow } from '@/api/gsms/sessions'
import { useGsmsAccessStore } from '@/stores/gsmsAccess'
import { fmtDate, mapApiLink, stateLabel } from '@/components/gsms/format'

const { t, te, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const access = useGsmsAccessStore()
const palette = useChartPalette()

const roadmap = ref<Roadmap | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const weeks = ref(6)
const state = ref(typeof route.query.etat === 'string' ? route.query.etat : 'all')
const source = ref('all')
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
watch(() => route.query.etat, (v) => { state.value = typeof v === 'string' ? v : 'all' })

// Chiffres des modules et graphiques : seulement ce que le compte peut ouvrir (GET /bootstrap).
const evaluations = ref<Evaluations | null>(null)
const evaluationsError = ref<unknown>(null)
const sessions = ref<SessionRow[] | null>(null)
const sessionsError = ref<unknown>(null)
const showQualite = computed(() => access.hasNav('qualite'))
const showSessions = computed(() => access.hasNav('sessions', 'mes_sessions'))
onMounted(async () => {
  await access.load()
  if (showQualite.value) getEvaluations().then((v) => { evaluations.value = v }).catch((e) => { evaluationsError.value = e })
  if (showSessions.value) listSessions().then((v) => { sessions.value = v }).catch((e) => { sessionsError.value = e })
})

const items = computed(() => roadmap.value?.elements ?? [])
const count = (etat: string) => items.value.filter((i) => i.etat === etat).length
const roadmapLink = (etat: string) => `/platform/pilotage?etat=${etat}#feuille-de-route`
const kpis = computed<KpiItem[]>(() => [
  { key: 'retard', label: t('gsms.etats.EN_RETARD'), value: count('EN_RETARD'), subtitle: t('gsms.pilotage.kpi.echeancesDepassees'), icon: 'error-circle', tone: 'danger', to: roadmapLink('EN_RETARD') },
  { key: 'echeance', label: t('gsms.etats.A_ECHEANCE'), value: count('A_ECHEANCE'), subtitle: t('gsms.pilotage.kpi.cetteSemaine'), icon: 'time', tone: 'warning', to: roadmapLink('A_ECHEANCE') },
  { key: 'avenir', label: t('gsms.etats.A_VENIR'), value: count('A_VENIR'), subtitle: t('gsms.pilotage.kpi.surLaPeriode'), icon: 'calendar', to: roadmapLink('A_VENIR') },
  { key: 'sources', label: t('gsms.pilotage.kpi.sources'), value: roadmap.value?.sources.length ?? 0, subtitle: (roadmap.value?.sources ?? []).map(sourceLabel).join(', '), icon: 'root-list' },
])

// Graphiques : lignes de la feuille de route regroupées par l'état et la semaine que l'API leur a donnés.
const stateChart = computed(() => fromCounts(countBy(items.value, (i) => i.etat), ['EN_RETARD', 'A_ECHEANCE', 'A_VENIR'], stateLabel, roadmapLink, { A_VENIR: 'brand' }))
const weekChart = computed(() => {
  const byWeek = countBy(items.value, (i) => i.semaine)
  const known = Object.keys(byWeek).sort()
  // Axe du temps continu : les semaines sans échéance entre la première et la dernière apparaissent à zéro.
  const weeksSorted: string[] = []
  if (known.length) {
    const last = new Date(`${known[known.length - 1]}T00:00:00Z`)
    for (let d = new Date(`${known[0]}T00:00:00Z`); d <= last && weeksSorted.length < 60; d.setUTCDate(d.getUTCDate() + 7)) {
      weeksSorted.push(d.toISOString().slice(0, 10))
    }
  }
  return {
    categories: weeksSorted.map((w) => fmtDate(w).slice(0, 5)),
    series: [{ key: 'echeances', label: t('gsms.graphiques.pilotage.semaines'), values: weeksSorted.map((w) => byWeek[w] ?? 0) }],
  }
})
const indicatorChart = computed(() => fromCounts(countBy(evaluations.value?.indicateurs ?? [], (i) => i.etat),
  ['DEMONTRABLE', 'A_RISQUE', 'PREUVES_INSUFFISANTES', 'NON_EVALUE', 'NON_APPLICABLE'], stateLabel,
  (etat) => `/platform/qualite/indicateurs?etat=${etat}`, { NON_EVALUE: 'info' }))
const sessionChart = computed(() => fromCounts(countBy(sessions.value ?? [], (s) => s.status),
  ['PLANIFIEE', 'CONFIRMEE', 'EN_COURS', 'TERMINEE', 'CLOTUREE', 'ANNULEE'], stateLabel, undefined, 'brand'))

const modules = computed<ModuleItem[]>(() => {
  const out: ModuleItem[] = []
  if (showQualite.value) {
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
  if (showSessions.value) {
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

// ── Feuille de route en colonnes ────────────────────────────────────────────────
const LIMIT = 5
const COLUMNS: { etat: string; tone: ChartTone; icon: string }[] = [
  { etat: 'EN_RETARD', tone: 'danger', icon: 'error-circle-filled' },
  { etat: 'A_ECHEANCE', tone: 'warning', icon: 'time-filled' },
  { etat: 'A_VENIR', tone: 'brand', icon: 'calendar' },
]
const sourceTabs = computed(() => [
  { value: 'all', label: t('gsms.commun.toutes'), count: items.value.length },
  ...(roadmap.value?.sources ?? []).map((s) => ({ value: s, label: sourceLabel(s), count: items.value.filter((i) => i.source === s).length })),
])
/** Couleur d'une source : teinte catégorielle de son rang dans la liste des sources renvoyée par l'API (ordre fixe). */
const sourceColor = (s: string) => {
  const i = Math.max(0, (roadmap.value?.sources ?? []).indexOf(s))
  return palette.value.categorical[i % palette.value.categorical.length]
}
type Card = RoadmapItem & { to: string | null }
const columns = computed(() => COLUMNS
  .filter((c) => state.value === 'all' || c.etat === state.value)
  .map((c) => ({
    ...c,
    items: items.value
      .filter((i) => i.etat === c.etat && (source.value === 'all' || i.source === source.value))
      .sort((a, b) => a.echeance.localeCompare(b.echeance))
      .map<Card>((i) => ({ ...i, to: mapApiLink(i.lien) })),
  })))
const expanded = reactive<Record<string, boolean>>({})
const toggle = (etat: string) => { expanded[etat] = !expanded[etat] }
/** Cartes affichées d'une colonne (les N premières, ou toutes) ; « À venir » est découpée par semaine de l'API. */
function visible(col: { etat: string; items: Card[] }) {
  const shown = expanded[col.etat] ? col.items : col.items.slice(0, LIMIT)
  const out: { week?: string; item?: Card }[] = []
  let week = ''
  for (const item of shown) {
    if (col.etat === 'A_VENIR' && item.semaine !== week) {
      week = item.semaine
      out.push({ week })
    }
    out.push({ item })
  }
  return out
}
/** Échéance relative à la date du jour renvoyée par l'API (« il y a 3 jours », « dans 5 jours »). */
function relative(echeance: string) {
  const today = roadmap.value?.aujourd_hui
  if (!today) return fmtDate(echeance)
  const days = Math.round((Date.parse(`${echeance.slice(0, 10)}T00:00:00Z`) - Date.parse(`${today.slice(0, 10)}T00:00:00Z`)) / 86_400_000)
  return new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' }).format(days, 'day')
}
function showAllColumns() {
  const query = { ...route.query }
  delete query.etat
  void router.replace({ query, hash: '#feuille-de-route' })
}
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.horizon { width: 150px; }
.muted { .gsms-muted(); margin: 2px 0 0; }

// Disposition des graphiques : 3 colonnes à grand écran (cartes larges sur 2), 2 en tablette, 1 au téléphone.
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

.roadmap { .gsms-panel(); padding: 18px 20px; scroll-margin-top: 12px; display: flex; flex-direction: column; gap: 14px; }
.roadmap-head { display: flex; align-items: center; flex-wrap: wrap; gap: 10px 12px; }
.roadmap-icon {
  display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 36px; height: 36px;
  border-radius: var(--app-radius-md); background: color-mix(in srgb, var(--td-brand-color) 12%, transparent); color: var(--td-brand-color);
}
.roadmap-titles { flex: 1 1 220px; min-width: 0;
  h2 { margin: 0; font-family: var(--app-font-family-display); font-size: var(--app-text-xl); font-weight: 700; line-height: 22px; color: var(--td-text-color-primary); } }
.only-column { margin: -4px 0 0; }

.board { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; align-items: start;
  &.board--single { grid-template-columns: minmax(0, 1fr); }
  @media (max-width: 960px) { grid-template-columns: minmax(0, 1fr); } }
.column {
  --tone: var(--td-brand-color);
  min-width: 0; display: flex; flex-direction: column; gap: 8px; padding: 12px;
  border-radius: var(--app-radius-lg);
  background: color-mix(in srgb, var(--tone) 5%, var(--td-bg-color-secondarycontainer));
  border-top: 3px solid var(--tone);
  &--danger { --tone: var(--td-error-color); }
  &--warning { --tone: var(--td-warning-color); }
}
.column-head { display: flex; align-items: center; gap: 8px; padding: 0 2px 2px; }
.column-mark { color: var(--tone); flex-shrink: 0; }
.column-titles { flex: 1; min-width: 0; display: flex; flex-direction: column;
  h3 { margin: 0; font-family: var(--app-font-family-display); font-size: var(--app-text-md); font-weight: 700; color: var(--td-text-color-primary); } }
.column-sub { color: var(--td-text-color-secondary); font-size: var(--app-text-xs); }
.column-count {
  min-width: 26px; padding: 2px 8px; border-radius: var(--app-radius-pill); text-align: center;
  background: color-mix(in srgb, var(--tone) 14%, transparent); color: var(--td-text-color-primary);
  font-size: var(--app-text-sm); font-weight: 700; font-variant-numeric: tabular-nums;
}
.column-empty { .gsms-muted(); margin: 4px 2px 6px; }
.cards { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.week { margin: 6px 2px 0; color: var(--td-text-color-placeholder); font-size: var(--app-text-xs); font-weight: 600; letter-spacing: 0.02em; text-transform: uppercase; }
.task {
  display: flex; flex-direction: column; gap: 4px; min-width: 0; padding: 10px 12px;
  border: 1px solid var(--td-component-stroke); border-radius: var(--app-radius-md);
  background: var(--td-bg-color-container); color: inherit; text-decoration: none;
  box-shadow: 0 1px 2px color-mix(in srgb, var(--td-text-color-primary) 5%, transparent);
  transition: border-color var(--app-motion-fast) ease, box-shadow var(--app-motion-fast) ease, transform var(--app-motion-fast) ease;
  &:not(.task--static):hover {
    border-color: color-mix(in srgb, var(--tone) 45%, var(--td-component-stroke));
    box-shadow: 0 6px 16px -8px color-mix(in srgb, var(--td-text-color-primary) 22%, transparent);
    transform: translateY(-1px);
  }
  &:focus-visible { outline: 2px solid var(--td-brand-color); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { transition: none; &:not(.task--static):hover { transform: none; } }
}
.task-source {
  align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; max-width: 100%;
  padding: 1px 8px 1px 6px; border-radius: var(--app-radius-pill);
  background: color-mix(in srgb, var(--source) 12%, transparent); color: var(--td-text-color-secondary);
  font-size: var(--app-text-xs); font-weight: 600; line-height: 18px;
  &::before { content: ''; flex-shrink: 0; width: 7px; height: 7px; border-radius: 50%; background: var(--source); }
}
.task-title { color: var(--td-text-color-primary); font-size: var(--app-text-base); font-weight: 600; line-height: 19px;
  display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.task-detail { color: var(--td-text-color-secondary); font-size: var(--app-text-sm); line-height: 17px;
  display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.task-foot { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 4px 8px; margin-top: 2px; }
.task-when { display: inline-flex; align-items: center; gap: 4px; color: var(--td-text-color-secondary); font-size: var(--app-text-sm); font-weight: 600;
  &--late { color: var(--td-error-color-7); } }
.task-date { color: var(--td-text-color-placeholder); font-weight: 400; }
.chips { display: flex; flex-wrap: wrap; gap: 4px; }
.chip { .gsms-chip(); }
.more { margin-top: 2px; }
</style>
