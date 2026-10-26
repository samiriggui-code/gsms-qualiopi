<template>
  <div class="gsms-page">
    <div class="gsms-page-content">
      <GsmsPageHeader :title="t('gsms.planning.titre')" icon="calendar" :subtitle="t('gsms.planning.sousTitre')" />
      <div class="gsms-toolbar">
        <GsmsFilterTabs v-model="mode" :options="modeTabs" :label="t('gsms.commun.vue')" tabs />
        <div class="nav">
          <t-button size="small" variant="outline" shape="square" :aria-label="t('gsms.planning.precedent')" @click="shift(-1)">
            <template #icon><t-icon name="chevron-left" /></template>
          </t-button>
          <t-button size="small" variant="outline" @click="anchor = todayIso()">{{ t('gsms.planning.aujourdhui') }}</t-button>
          <t-button size="small" variant="outline" shape="square" :aria-label="t('gsms.planning.suivant')" @click="shift(1)">
            <template #icon><t-icon name="chevron-right" /></template>
          </t-button>
          <t-date-picker v-model="anchor" size="small" value-type="YYYY-MM-DD" format="DD/MM/YYYY" class="anchor"
            :clearable="false" :aria-label="t('gsms.planning.allerA')" />
          <t-select v-if="mode === 'liste'" v-model="span" size="small" :options="spanOptions" class="span" :aria-label="t('gsms.planning.duree')" />
        </div>
        <span class="period">{{ t('gsms.planning.periode', { du: fmtDate(range.du), au: fmtDate(range.au) }) }}</span>
      </div>

      <div class="gsms-page-main">
        <div class="filters">
          <t-select v-model="trainer" size="small" clearable filterable :options="trainerOptions" :placeholder="t('gsms.planning.filtres.formateur')"
            :aria-label="t('gsms.planning.filtres.formateur')" class="filter" />
          <t-select v-model="program" size="small" clearable filterable :options="programOptions" :placeholder="t('gsms.planning.filtres.formation')"
            :aria-label="t('gsms.planning.filtres.formation')" class="filter" />
          <t-select v-model="place" size="small" clearable filterable :options="placeOptions" :placeholder="t('gsms.planning.filtres.lieu')"
            :aria-label="t('gsms.planning.filtres.lieu')" class="filter" />
          <label class="cancelled"><t-switch v-model="cancelled" size="small" />{{ t('gsms.planning.filtres.annulees') }}</label>
        </div>

        <GsmsRefusal v-if="error" :error="error">
          <t-button size="small" variant="outline" @click="load">{{ t('gsms.commun.reessayer') }}</t-button>
        </GsmsRefusal>
        <template v-else>
          <GsmsKpiRow :items="kpis" :loading="loading && !planning" class="kpis" />

          <section v-if="planning?.conflits.length" class="conflicts" :aria-label="t('gsms.planning.conflits.titre')">
            <h3><t-icon name="error-triangle" size="16px" />{{ t('gsms.planning.conflits.titre') }}</h3>
            <p class="notice"><t-icon name="info-circle" size="14px" /> {{ planning.avertissement }}</p>
            <ul class="conflict-list">
              <li v-for="(c, i) in planning.conflits" :key="i">
                <GsmsStatusTag :code="c.certitude" :label="t(`gsms.planning.conflits.certitude.${c.certitude}`)" />
                <span class="conflict-text">
                  <strong>{{ fmtDate(c.le) }}</strong> · {{ t(`gsms.planning.conflits.types.${c.type}`) }}<template v-if="c.ressource"> ({{ c.ressource }})</template>
                  · {{ c.sessions.join(' / ') }}
                </span>
              </li>
            </ul>
          </section>

          <div v-if="loading && !planning" class="week"><div v-for="n in 7" :key="n" class="day is-skeleton"><t-skeleton animation="gradient" :row-col="[{ width: '60%' }, { width: '100%', height: '60px' }]" /></div></div>
          <template v-else-if="planning">
            <EmptyState v-if="!planning.creneaux.length" icon="calendar" :title="t('gsms.planning.vide')" :description="t('gsms.planning.videAide')" />

            <!-- Semaine, grand écran : une colonne par jour -->
            <div v-else-if="mode === 'semaine' && !isMobile" class="week">
              <section v-for="d in weekDays" :key="d.day" class="day" :class="{ 'day--today': d.day === today }" :aria-label="dayLabel(d.day)">
                <h4 class="day-head">{{ dayLabel(d.day) }}</h4>
                <PlanningSlot v-for="s in d.slots" :key="s.id" :item="s" />
                <p v-if="!d.slots.length" class="day-empty">{{ t('gsms.planning.rienCeJour') }}</p>
              </section>
            </div>

            <!-- Liste, grand écran : tableau des créneaux -->
            <t-table v-else-if="mode === 'liste' && !isMobile" :data="planning.creneaux" :columns="columns" row-key="id" hover size="medium"
              table-layout="auto" class="table" :on-row-click="({ row }: { row: PlanningSlotRow }) => router.push(`/platform/sessions/${row.session.id}`)">
              <template #date="{ row }">{{ row.debut === row.fin ? fmtDate(row.debut) : `${fmtDate(row.debut)} → ${fmtDate(row.fin)}` }}</template>
              <template #creneau="{ row }">{{ slotTime(row) }}</template>
              <template #session="{ row }">
                <router-link :to="`/platform/sessions/${row.session.id}`" class="cell-link" @click.stop>{{ row.session.reference }}</router-link>
                <GsmsStatusTag v-if="row.session.statut === 'ANNULEE'" code="ANNULEE" />
              </template>
              <template #programme="{ row }">
                <span class="cell-media"><FormationThumb :image="row.programme.image_url" :size="28" />{{ row.programme.intitule || row.programme.code || '—' }}</span>
              </template>
              <template #formateur="{ row }">
                <span v-if="row.formateur" class="cell-media"><GsmsPersonAvatar :name="row.formateur.nom" :photo="row.formateur.photo_url" :size="24" />{{ row.formateur.nom || '—' }}</span>
                <template v-else>{{ t('gsms.planning.sansFormateur') }}</template>
              </template>
              <template #lieu="{ row }">{{ [row.lieu, row.salle].filter(Boolean).join(' · ') || '—' }}</template>
              <template #effectif="{ row }">{{ row.capacite !== null ? `${row.effectif} / ${row.capacite}` : row.effectif }}</template>
              <template #conflits="{ row }">
                <span v-if="!row.conflits.length" class="muted">—</span>
                <span v-for="(c, i) in row.conflits" v-else :key="i" class="conflict-cell">
                  <GsmsStatusTag :code="c.certitude" :label="t(`gsms.planning.conflits.certitude.${c.certitude}`)" />
                  <span class="muted">{{ t(`gsms.planning.conflits.types.${c.type}`) }}</span>
                </span>
              </template>
            </t-table>

            <!-- Téléphone (semaine ou liste) : un bloc par jour, jamais un calendrier serré -->
            <div v-else class="days">
              <section v-for="d in mobileDays" :key="d.day" class="mday" :aria-label="dayLabel(d.day)">
                <h4 class="mday-head" :class="{ 'day--today': d.day === today }">{{ dayLabel(d.day, true) }}<span class="count">{{ d.slots.length }}</span></h4>
                <PlanningSlot v-for="s in d.slots" :key="s.id" :item="s" />
                <p v-if="!d.slots.length" class="day-empty">{{ t('gsms.planning.rienCeJour') }}</p>
              </section>
            </div>
          </template>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Planning (page 2) : créneaux de GET /planning sur une semaine ou une période (93 jours au plus), filtrés par l'API.
 * Les conflits (même formateur ou même salle) et leur certitude sont ceux de l'API : rien n'est recalculé ici.
 * Sans bibliothèque de calendrier : les créneaux sont des demi-journées souvent sans horaires, une grille horaire
 * n'apporterait rien ; une grille CSS de sept colonnes suffit, et le téléphone passe en liste par jour.
 */
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import EmptyState from '@/components/EmptyState.vue'
import GsmsPageHeader from '@/components/gsms/GsmsPageHeader.vue'
import GsmsFilterTabs from '@/components/gsms/GsmsFilterTabs.vue'
import GsmsKpiRow from '@/components/gsms/GsmsKpiRow.vue'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import GsmsPersonAvatar from '@/components/gsms/GsmsPersonAvatar.vue'
import FormationThumb from '@/views/gsms/formations/FormationThumb.vue'
import PlanningSlot from './PlanningSlot.vue'
import type { KpiItem } from '@/components/gsms/types'
import { getPlanning, type Planning, type PlanningSlot as PlanningSlotRow } from '@/api/gsms/pilotage'
import { useGsmsShellStore } from '@/stores/gsmsShell'
import { fmtDate } from '@/components/gsms/format'

const { t, locale } = useI18n()
const router = useRouter()
const { isMobile } = storeToRefs(useGsmsShellStore())

// ── Dates (affichage seulement : jours de la période demandée) ──
const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parse = (s: string) => new Date(`${s}T00:00:00`)
const addDays = (s: string, n: number) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d) }
const todayIso = () => iso(new Date())
const mondayOf = (s: string) => { const d = parse(s); return addDays(s, -((d.getDay() + 6) % 7)) }
const today = todayIso()

const mode = ref<'semaine' | 'liste'>('semaine')
const anchor = ref(today)
const span = ref(31)
const trainer = ref('')
const program = ref('')
const place = ref('')
const cancelled = ref(false)

const modeTabs = computed(() => [
  { value: 'semaine', label: t('gsms.planning.vues.semaine') },
  { value: 'liste', label: t('gsms.planning.vues.liste') },
])
// 93 jours : limite de l'API (au-delà, 422).
const spanOptions = computed(() => [7, 14, 31, 62, 93].map((n) => ({ value: n, label: t('gsms.planning.nJours', { n }) })))
const range = computed(() => {
  const du = mode.value === 'semaine' ? mondayOf(anchor.value) : anchor.value
  return { du, au: addDays(du, (mode.value === 'semaine' ? 7 : span.value) - 1) }
})
const shift = (dir: number) => { anchor.value = addDays(anchor.value, dir * (mode.value === 'semaine' ? 7 : span.value)) }

const planning = ref<Planning | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
let seq = 0

async function load() {
  const n = ++seq
  loading.value = true
  error.value = null
  try {
    const res = await getPlanning({
      du: range.value.du, au: range.value.au, formateur: trainer.value || undefined, programme: program.value || undefined,
      lieu: place.value || undefined, annulees: cancelled.value || undefined,
    })
    if (n === seq) planning.value = res
  } catch (e) {
    if (n === seq) { error.value = e; planning.value = null }
  } finally {
    if (n === seq) loading.value = false
  }
}
watch([range, trainer, program, place, cancelled], load, { immediate: true, deep: true })

// Valeurs proposées par l'API (ce que le compte voit sur la période) ; la valeur choisie reste proposée.
const trainerOptions = computed(() => (planning.value?.filtres.formateurs ?? []).map((f) => ({ value: f.id, label: f.nom || '—' })))
const programOptions = computed(() => (planning.value?.filtres.programmes ?? []).map((p) => ({ value: p.id, label: p.intitule || '—' })))
const placeOptions = computed(() => {
  const list = planning.value?.filtres.lieux ?? []
  return (place.value && !list.includes(place.value) ? [place.value, ...list] : list).map((l) => ({ value: l, label: l }))
})

const kpis = computed<KpiItem[]>(() => {
  const c = planning.value?.compteurs
  return [
    { key: 'creneaux', label: t('gsms.planning.kpi.creneaux'), value: c?.creneaux ?? '—', icon: 'time' },
    { key: 'sessions', label: t('gsms.planning.kpi.sessions'), value: c?.sessions ?? '—', icon: 'calendar-1' },
    { key: 'conflits', label: t('gsms.planning.kpi.conflits'), value: c?.conflits ?? '—', subtitle: t('gsms.planning.kpi.conflitsAide'),
      icon: 'error-triangle', tone: c?.conflits ? 'warning' : undefined },
  ]
})

const covers = (s: PlanningSlotRow, day: string) => s.debut <= day && day <= s.fin
const slots = computed(() => planning.value?.creneaux ?? [])
const weekDays = computed(() => Array.from({ length: 7 }, (_, i) => addDays(range.value.du, i))
  .map((day) => ({ day, slots: slots.value.filter((s) => covers(s, day)) })))
/** Téléphone : semaine = les sept jours ; liste = les jours qui ont des créneaux (une session entière à son premier jour). */
const mobileDays = computed(() => {
  if (mode.value === 'semaine') return weekDays.value
  const map = new Map<string, PlanningSlotRow[]>()
  for (const s of slots.value) {
    const day = s.debut < range.value.du ? range.value.du : s.debut
    if (!map.has(day)) map.set(day, [])
    map.get(day)!.push(s)
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, list]) => ({ day, slots: list }))
})

function dayLabel(day: string, long = false): string {
  const label = parse(day).toLocaleDateString(locale.value,
    long ? { weekday: 'long', day: 'numeric', month: 'long' } : { weekday: 'short', day: '2-digit', month: '2-digit' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}
function slotTime(s: PlanningSlotRow): string {
  if (s.heure_debut && s.heure_fin) return `${s.heure_debut} – ${s.heure_fin}`
  if (s.periode === 'MATIN' || s.periode === 'APRES_MIDI') return t(`gsms.planning.periodes.${s.periode}`)
  return s.type === 'SESSION' ? t('gsms.planning.sessionEntiereCourt') : '—'
}

const columns = computed(() => [
  { colKey: 'date', title: t('gsms.planning.col.date'), width: 120 },
  { colKey: 'creneau', title: t('gsms.planning.col.creneau'), width: 120 },
  { colKey: 'session', title: t('gsms.planning.col.session') },
  { colKey: 'programme', title: t('gsms.planning.col.formation') },
  { colKey: 'formateur', title: t('gsms.planning.col.formateur') },
  { colKey: 'lieu', title: t('gsms.planning.col.lieu') },
  { colKey: 'effectif', title: t('gsms.planning.col.effectif'), width: 90 },
  { colKey: 'conflits', title: t('gsms.planning.col.conflits') },
])
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.gsms-page { .gsms-page-shell(); }
.gsms-page-content { .resource-list-content(); }
.gsms-page-main { .resource-list-main(); }
.gsms-toolbar { .gsms-toolbar(); }
.nav { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.anchor { width: 140px; }
.span { width: 110px; }
.period { .gsms-muted(); margin-left: auto; }
.filters {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.filter { width: 220px; max-width: 100%; }
.cancelled { display: inline-flex; align-items: center; gap: 6px; color: var(--td-text-color-secondary); font-size: var(--app-text-sm); cursor: pointer; }
.kpis { margin-bottom: 12px; }
.notice { .gsms-notice(); }
.muted { .gsms-muted(); }
.conflicts {
  .gsms-panel();
  margin-bottom: 12px;
  border-color: color-mix(in srgb, var(--td-warning-color) 45%, var(--td-component-stroke));
  h3 { .gsms-panel-title(); display: flex; align-items: center; gap: 6px; .t-icon { color: var(--td-warning-color); } }
}
.conflict-list {
  list-style: none;
  margin: 0;
  padding: 0;
  li { display: flex; align-items: flex-start; gap: 8px; padding: 6px 0; font-size: var(--app-text-sm); line-height: 20px; }
  li + li { border-top: 1px dashed var(--td-component-stroke); }
}
.conflict-text { min-width: 0; overflow-wrap: anywhere; }
.conflict-cell { display: inline-flex; align-items: center; gap: 4px; margin-right: 6px; }
.week { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; align-items: start; }
.day {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  min-height: 120px;
  padding: 8px;
  border: 1px solid var(--td-component-stroke);
  border-radius: var(--app-radius-md);
  background: var(--td-bg-color-secondarycontainer);
}
.day--today { border-color: var(--td-brand-color); }
.day-head { margin: 0 0 2px; color: var(--td-text-color-primary); font-size: var(--app-text-sm); font-weight: 600; }
.day-empty { margin: 0; color: var(--td-text-color-placeholder); font-size: var(--app-text-xs); }
.table { .gsms-table(); }
.cell-media { display: inline-flex; align-items: center; gap: 8px; min-width: 0; }
.cell-link { margin-right: 6px; color: var(--td-text-color-primary); font-weight: 500; text-decoration: none; &:hover { color: var(--td-brand-color); } }
.days { display: flex; flex-direction: column; gap: 12px; }
.mday { display: flex; flex-direction: column; gap: 6px; }
.mday-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0;
  padding: 4px 0;
  border-bottom: 1px solid var(--td-component-stroke);
  color: var(--td-text-color-primary);
  font-size: var(--app-text-md);
  font-weight: 600;
  &.day--today { color: var(--td-brand-color); }
  .count { .gsms-chip(); }
}
@media (max-width: 1100px) { .week { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
@media (max-width: 720px) {
  .period { margin-left: 0; width: 100%; }
  .filter { width: 100%; }
  .anchor { width: 130px; }
}
</style>
