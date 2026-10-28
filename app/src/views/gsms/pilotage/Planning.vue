<template>
  <div class="gsms-page">
    <div class="gsms-page-content">
      <GsmsPageHeader :title="t('gsms.planning.titre')" icon="calendar" :subtitle="t('gsms.planning.sousTitre')">
        <template #actions>
          <GsmsAskAssistant assistant="preparationAudit" :label="t('gsms.planning.demander')"
            :question="t('gsms.planning.question', { du: fmtDate(range.du), au: fmtDate(range.au) })" />
        </template>
      </GsmsPageHeader>
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
          <t-select v-if="mode !== 'mois'" v-model="span" size="small" :options="spanOptions" class="span" :aria-label="t('gsms.planning.duree')" />
          <span class="period">{{ mode === 'mois' ? monthTitle : t('gsms.planning.periode', { du: fmtDate(range.du), au: fmtDate(range.au) }) }}</span>
        </div>
        <!-- Indicateurs de la période (compteurs de l'API) -->
        <div v-if="planning" class="stats" :aria-label="t('gsms.planning.indicateurs')">
          <span class="stat"><strong>{{ planning.compteurs.creneaux }}</strong> {{ t('gsms.planning.kpi.creneaux') }}</span>
          <span class="stat"><strong>{{ planning.compteurs.sessions }}</strong> {{ t('gsms.planning.kpi.sessions') }}</span>
          <span v-if="planning.compteurs.alertes !== undefined" class="stat"
            :class="counts.HAUTE ? 'stat--bad' : planning.compteurs.alertes ? 'stat--warn' : 'stat--ok'">
            <i class="dot" /><strong>{{ planning.compteurs.alertes }}</strong> {{ t('gsms.planning.kpi.alertes') }}
          </span>
          <span class="stat" :class="planning.compteurs.conflits ? 'stat--warn' : 'stat--ok'">
            <i class="dot" /><strong>{{ planning.compteurs.conflits }}</strong> {{ t('gsms.planning.kpi.conflits') }}
          </span>
        </div>
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
          <!-- File « À traiter » à gauche (alertes de l'API), vue de la période à droite -->
          <div class="board" :class="{ 'board--chart': chart }">
            <aside class="panel queue" :aria-label="t('gsms.planning.alertes.titre')">
              <div class="ph">
                <div>
                  <h3>{{ t('gsms.planning.file.titre') }}</h3>
                  <span class="hint">{{ planning?.alertes ? t('gsms.planning.file.aide') : t('gsms.planning.conflits.titre') }}</span>
                </div>
                <span v-if="planning" class="count" :class="{ 'count--bad': counts.HAUTE, 'count--warn': !counts.HAUTE && queueSize }">{{ queueSize }}</span>
              </div>
              <div v-if="planning?.alertes?.length" class="sev" role="group" :aria-label="t('gsms.planning.alertes.filtrer')">
                <button v-for="g in SEVERITIES" :key="g" type="button" class="sev-chip" :class="[`sev-chip--${g.toLowerCase()}`, { 'is-active': severity === g }]"
                  :aria-pressed="severity === g" :disabled="!counts[g]" @click="severity = severity === g ? '' : g">
                  {{ t(`gsms.planning.gravites.${g}`) }} <strong>{{ counts[g] }}</strong>
                </button>
              </div>
              <div class="queue-body">
                <t-skeleton v-if="loading && !planning" animation="gradient" :row-col="[{ width: '100%', height: '64px' }, { width: '100%', height: '64px' }, { width: '100%', height: '64px' }]" />
                <template v-else-if="planning?.alertes">
                  <p v-if="!filteredAlerts.length" class="ok-line"><t-icon name="check-circle" size="15px" />{{ t('gsms.planning.alertes.aucune') }}</p>
                  <article v-for="a in filteredAlerts" :key="a.id" class="job" :class="[`job--${a.gravite.toLowerCase()}`, { 'is-on': a.sessions.some((s) => s.id === selectedSession) }]">
                    <div class="job-head">
                      <t-tag :theme="severityTheme(a.gravite)" variant="light" size="small">{{ t(`gsms.planning.gravites.${a.gravite}`) }}</t-tag>
                      <span class="hint">{{ fmtDate(a.le) }}</span>
                    </div>
                    <p class="job-text">{{ a.message }}</p>
                    <div class="job-foot">
                      <button v-for="r in a.sessions" :key="r.id" type="button" class="ref" @click="openAlert(a, r.id)">{{ r.reference }}</button>
                      <router-link v-if="alertRoute(a.lien)" :to="alertRoute(a.lien)!" class="job-link">{{ t(`gsms.planning.cibles.${a.lien.cible}`) }}</router-link>
                    </div>
                  </article>
                </template>
                <!-- API sans alertes (version antérieure) : les conflits seuls -->
                <template v-else-if="planning">
                  <p v-if="!planning.conflits.length" class="ok-line"><t-icon name="check-circle" size="15px" />{{ t('gsms.planning.conflits.aucun') }}</p>
                  <article v-for="(c, i) in planning.conflits" :key="i" class="job job--moyenne">
                    <div class="job-head">
                      <GsmsStatusTag :code="c.certitude" :label="t(`gsms.planning.conflits.certitude.${c.certitude}`)" />
                      <span class="hint">{{ fmtDate(c.le) }}</span>
                    </div>
                    <p class="job-text">{{ t(`gsms.planning.conflits.types.${c.type}`) }}<template v-if="c.ressource"> ({{ c.ressource }})</template></p>
                    <div class="job-foot"><button v-for="r in c.sessions" :key="r" type="button" class="ref" @click="openSessionRef(r)">{{ r }}</button></div>
                  </article>
                </template>
              </div>
              <p v-if="planning" class="foot">{{ planning.avertissement_alertes || planning.avertissement }}</p>
            </aside>

            <div class="main">
              <p v-if="severity" class="filter-note">
                {{ t('gsms.planning.alertes.filtreActif', { g: t(`gsms.planning.gravites.${severity}`), n: slots.length }) }}
                <t-button size="small" variant="text" @click="severity = ''">{{ t('gsms.planning.alertes.toutes') }}</t-button>
              </p>
              <div v-if="loading && !planning" class="panel pad"><t-skeleton animation="gradient" :row-col="[{ width: '40%' }, { width: '100%', height: '48px' }, { width: '100%', height: '48px' }, { width: '100%', height: '48px' }]" /></div>
              <template v-else-if="planning">
                <!-- Semaine, grand écran : diagramme par formateur ou par salle -->
                <section v-if="chart" class="panel chart" :aria-label="t('gsms.planning.diagramme.titre')">
                  <PlanningTimeline v-model:by="by" :slots="slots" :days="rangeDays" :today="today" :selected="selectedSession" @select="pick" />
                </section>

                <div v-else-if="!slots.length" class="panel pad">
                  <EmptyState icon="calendar" :title="t('gsms.planning.vide')" :description="t('gsms.planning.videAide')" />
                </div>

                <!-- Mois, grand écran : calendrier compact -->
                <section v-else-if="mode === 'mois' && !isMobile" class="panel pad">
                  <PlanningMonth :weeks="grid.weeks" :month="grid.month" :today="today" :slots="slots" :session-of="sessionOf" @select="openSlot" @day="goWeek" />
                </section>

                <!-- Liste, grand écran : tableau des créneaux -->
                <t-table v-else-if="mode === 'liste' && !isMobile" :data="slots" :columns="columns" row-key="id" hover size="medium"
                  table-layout="auto" class="table" :on-row-click="({ row }: { row: PlanningSlotRow }) => openSlot(row)">
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
                  <template #effectif="{ row }">
                    <span class="cell-fill">
                      {{ (sessionOf(row)?.capacite ?? row.capacite) !== null ? `${sessionOf(row)?.inscrits ?? row.effectif} / ${sessionOf(row)?.capacite ?? row.capacite}` : (sessionOf(row)?.inscrits ?? row.effectif) }}
                      <span v-if="gaugeOf(row)" class="mini-gauge" :class="{ 'mini-gauge--over': gaugeOf(row)!.over }" aria-hidden="true"><span :style="{ width: `${gaugeOf(row)!.pct}%` }" /></span>
                    </span>
                  </template>
                  <template #alertes="{ row }">
                    <span v-if="!(row.alertes?.length) && !row.conflits.length" class="muted">—</span>
                    <t-tag v-else-if="row.alertes?.length" :theme="severityTheme(row.alerte_max)" variant="light" size="small">
                      {{ t('gsms.planning.alertes.nb', { n: row.alertes.length }) }}
                    </t-tag>
                    <span v-for="(c, i) in row.conflits" v-else :key="i" class="conflict-cell">
                      <GsmsStatusTag :code="c.certitude" :label="t(`gsms.planning.conflits.certitude.${c.certitude}`)" />
                    </span>
                  </template>
                </t-table>

                <!-- Téléphone : un bloc par jour, jamais un calendrier serré -->
                <div v-else class="days">
                  <EmptyState v-if="!mobileDays.length" icon="calendar" :title="t('gsms.planning.vide')" :description="t('gsms.planning.videAide')" />
                  <section v-for="d in mobileDays" :key="d.day" class="mday" :aria-label="dayLabel(d.day)">
                    <h4 class="mday-head" :class="{ 'day--today': d.day === today }">{{ dayLabel(d.day, true) }}<span class="count">{{ d.slots.length }}</span></h4>
                    <PlanningSlot v-for="s in d.slots" :key="s.id" :item="s" :session="sessionOf(s)" @select="openSlot" />
                    <p v-if="!d.slots.length" class="day-empty">{{ t('gsms.planning.rienCeJour') }}</p>
                  </section>
                </div>
              </template>
            </div>
          </div>

          <!-- Sous le diagramme : la session sélectionnée (sans masquer le diagramme) et les conflits de la période -->
          <div v-if="chart && planning" class="below" :class="{ 'below--solo': !planning.alertes }">
            <section class="panel pad" :aria-label="t('gsms.planning.panneau.titre')">
              <PlanningSessionPanel v-if="current" :key="current.id" inline :slot="current" :session="sessionOf(current)" :alerts="alertsOf(current)"
                @close="selectedId = ''" />
              <EmptyState v-else compact icon="cursor" :title="t('gsms.planning.panneau.aucun')" :description="t('gsms.planning.panneau.aucunAide')" />
            </section>
            <!-- Sans alertes (API antérieure), la file montre déjà les conflits : pas de doublon ici. -->
            <section v-if="planning.alertes" class="panel conflicts" :aria-label="t('gsms.planning.conflits.titre')">
              <div class="ph">
                <h3>{{ t('gsms.planning.conflits.titre') }}</h3>
                <span class="count" :class="{ 'count--warn': planning.conflits.length }">{{ planning.conflits.length }}</span>
              </div>
              <p v-if="!planning.conflits.length" class="ok-line"><t-icon name="check-circle" size="15px" />{{ t('gsms.planning.conflits.aucun') }}</p>
              <ul v-else class="conflict-list">
                <li v-for="(c, i) in planning.conflits" :key="i">
                  <div class="conflict-head">
                    <GsmsStatusTag :code="c.certitude" :label="t(`gsms.planning.conflits.certitude.${c.certitude}`)" />
                    <span class="hint">{{ fmtDate(c.le) }}</span>
                  </div>
                  <span class="conflict-text">{{ t(`gsms.planning.conflits.types.${c.type}`) }}<template v-if="c.ressource"> · {{ c.ressource }}</template></span>
                  <span class="job-foot"><button v-for="r in c.sessions" :key="r" type="button" class="ref" @click="openSessionRef(r)">{{ r }}</button></span>
                </li>
              </ul>
              <p class="foot">{{ planning.avertissement }}</p>
            </section>
          </div>
        </template>
      </div>
    </div>
    <PlanningDrawer v-model:visible="drawer" :slot="current" :session="current ? sessionOf(current) : null" :alerts="current ? alertsOf(current) : []" />
  </div>
</template>

<script setup lang="ts">
/**
 * Planning (page 2) : créneaux de GET /planning en semaine, mois ou liste (93 jours au plus), sur le modèle du planning
 * des chauffeurs de GSMS Logistics : file « À traiter » à gauche (alertes de l'API), diagramme par formateur ou par
 * salle à droite, session sélectionnée et conflits dessous, sans tiroir qui masquerait le diagramme.
 * Tout ce qui est affiché vient de l'API : conflits, alertes et gravités, remplissage, salle rapprochée, échéances du
 * circuit. La page ne fait que ranger (par jour, par formateur ou salle) et filtrer l'affichage par gravité.
 * Mois, liste et téléphone ouvrent la fiche dans un tiroir.
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import EmptyState from '@/components/EmptyState.vue'
import GsmsPageHeader from '@/components/gsms/GsmsPageHeader.vue'
import GsmsFilterTabs from '@/components/gsms/GsmsFilterTabs.vue'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import GsmsPersonAvatar from '@/components/gsms/GsmsPersonAvatar.vue'
import GsmsAskAssistant from '@/components/gsms/GsmsAskAssistant.vue'
import FormationThumb from '@/views/gsms/formations/FormationThumb.vue'
import PlanningSlot from './PlanningSlot.vue'
import PlanningMonth from './PlanningMonth.vue'
import PlanningTimeline from './PlanningTimeline.vue'
import PlanningSessionPanel from './PlanningSessionPanel.vue'
import PlanningDrawer from './PlanningDrawer.vue'
import { getPlanning, type Planning, type PlanningAlert, type PlanningSeverity, type PlanningSession,
  type PlanningSlot as PlanningSlotRow } from '@/api/gsms/pilotage'
import { useGsmsShellStore } from '@/stores/gsmsShell'
import { fmtDate } from '@/components/gsms/format'
import { addDays, alertRoute, fill, monthGrid, parse, rangeFor, SEVERITIES, severityTheme, shiftAnchor, todayIso, type View } from './planningView'

const { t, locale } = useI18n()
const { isMobile } = storeToRefs(useGsmsShellStore())
const today = todayIso()

// Préférences d'affichage retenues sur ce navigateur (une ancienne vue « ressources » revient à la semaine).
const VIEWS: View[] = ['semaine', 'mois', 'liste']
const pref = (key: string) => { try { return localStorage.getItem(key) } catch { return null } }
const keep = (key: string, v: string) => { try { localStorage.setItem(key, v) } catch { /* stockage indisponible : rien à retenir */ } }
const mode = ref<View>(VIEWS.includes(pref('gsms.planning.vue') as View) ? (pref('gsms.planning.vue') as View) : 'semaine')
const by = ref<'formateurs' | 'salles'>(pref('gsms.planning.par') === 'salles' ? 'salles' : 'formateurs')
watch(mode, (v) => keep('gsms.planning.vue', v))
watch(by, (v) => keep('gsms.planning.par', v))
const anchor = ref(today)
const listSpan = ref(31)
const weekSpan = ref(7)
const span = computed({
  get: () => (mode.value === 'semaine' ? weekSpan.value : listSpan.value),
  set: (n: number) => { if (mode.value === 'semaine') weekSpan.value = n; else listSpan.value = n },
})
const trainer = ref('')
const program = ref('')
const place = ref('')
const cancelled = ref(false)
const severity = ref<PlanningSeverity | ''>('')

const modeTabs = computed(() => VIEWS.map((v) => ({ value: v, label: t(`gsms.planning.vues.${v}`) })))
// 93 jours : limite de l'API (au-delà, 422).
const spanOptions = computed(() => (mode.value === 'semaine'
  ? [{ value: 7, label: t('gsms.planning.uneSemaine') }, { value: 14, label: t('gsms.planning.deuxSemaines') }]
  : [7, 14, 31, 62, 93].map((n) => ({ value: n, label: t('gsms.planning.nJours', { n }) }))))
const range = computed(() => rangeFor(mode.value, anchor.value, span.value))
const grid = computed(() => monthGrid(anchor.value))
const monthTitle = computed(() => {
  const label = parse(`${grid.value.month}-01`).toLocaleDateString(locale.value, { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
})
const shift = (dir: number) => { anchor.value = shiftAnchor(mode.value, anchor.value, dir, span.value) }
const goWeek = (day: string) => { anchor.value = day; mode.value = 'semaine' }
/** Diagramme : semaine sur grand écran (le téléphone garde la liste par jour). */
const chart = computed(() => mode.value === 'semaine' && !isMobile.value)

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

// ── File « À traiter » : alertes de l'API, filtrables par gravité ──
const alerts = computed(() => planning.value?.alertes ?? [])
const alertById = computed(() => new Map(alerts.value.map((a) => [a.id, a])))
const counts = computed<Record<PlanningSeverity, number>>(() => planning.value?.compteurs.alertes_par_gravite ?? { HAUTE: 0, MOYENNE: 0, BASSE: 0 })
const filteredAlerts = computed(() => (severity.value ? alerts.value.filter((a) => a.gravite === severity.value) : alerts.value))
const queueSize = computed(() => (planning.value?.alertes ? alerts.value.length : planning.value?.conflits.length ?? 0))
watch(planning, () => { if (severity.value && !counts.value[severity.value]) severity.value = '' })

const sessionsById = computed(() => new Map((planning.value?.sessions ?? []).map((s) => [s.id, s])))
const sessionOf = (s: PlanningSlotRow): PlanningSession | null => sessionsById.value.get(s.session.id) ?? null
const gaugeOf = (s: PlanningSlotRow) => fill(sessionOf(s)?.inscrits ?? s.effectif, sessionOf(s)?.capacite ?? s.capacite)
const alertsOf = (s: PlanningSlotRow): PlanningAlert[] => alerts.value.filter((a) => a.sessions.some((x) => x.id === s.session.id))

// Filtre d'affichage par gravité : les créneaux qui portent au moins une alerte de cette gravité (selon l'API).
const slots = computed(() => {
  const all = planning.value?.creneaux ?? []
  if (!severity.value) return all
  return all.filter((s) => (s.alertes ?? []).some((id) => alertById.value.get(id)?.gravite === severity.value))
})
const covers = (s: PlanningSlotRow, day: string) => s.debut <= day && day <= s.fin
const rangeDays = computed(() => {
  const out: string[] = []
  for (let d = range.value.du; d <= range.value.au; d = addDays(d, 1)) out.push(d)
  return out
})
/** Téléphone : semaine = chaque jour ; mois et liste = les jours qui ont des créneaux (une session entière à son premier jour). */
const mobileDays = computed(() => {
  if (mode.value === 'semaine') return rangeDays.value.map((day) => ({ day, slots: slots.value.filter((s) => covers(s, day)) }))
  const map = new Map<string, PlanningSlotRow[]>()
  for (const s of slots.value) {
    const day = s.debut < range.value.du ? range.value.du : s.debut
    if (!map.has(day)) map.set(day, [])
    map.get(day)!.push(s)
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, list]) => ({ day, slots: list }))
})

// ── Sélection : sous le diagramme en semaine, dans le tiroir ailleurs ──
const drawer = ref(false)
const selectedId = ref<string | null>(null)
const allSlots = computed(() => planning.value?.creneaux ?? [])
// Sans sélection, le diagramme montre le prochain créneau à partir d'aujourd'hui (sinon le premier) plutôt qu'un vide.
const current = computed<PlanningSlotRow | null>(() => {
  const list = allSlots.value
  const picked = list.find((s) => s.id === selectedId.value)
  if (picked || !chart.value) return picked ?? null
  if (selectedId.value === '') return null
  return list.find((s) => s.fin >= today && s.session.statut !== 'ANNULEE') ?? list[0] ?? null
})
const selectedSession = computed(() => current.value?.session.id ?? null)
watch(range, () => { selectedId.value = null })
function pick(s: PlanningSlotRow) { selectedId.value = s.id }
function openSlot(s: PlanningSlotRow) { selectedId.value = s.id; if (!chart.value) drawer.value = true }
function openAlert(a: PlanningAlert, sessionId: string) {
  const s = allSlots.value.find((c) => c.session.id === sessionId && a.creneaux.includes(c.id)) ?? allSlots.value.find((c) => c.session.id === sessionId)
  if (s) openSlot(s)
}
function openSessionRef(ref: string) {
  const s = allSlots.value.find((c) => c.session.reference === ref)
  if (s) openSlot(s)
}

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
  { colKey: 'effectif', title: t('gsms.planning.col.effectif'), width: 110 },
  { colKey: 'alertes', title: t('gsms.planning.col.alertes') },
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
.span { width: 120px; }
.period { .gsms-muted(); margin-left: 6px; }
// Indicateurs compacts de la période, alignés à droite (comme les pastilles du planning Logistics).
.stats { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-left: auto; }
.stat {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--td-component-stroke);
  border-radius: var(--app-radius-pill);
  background: var(--td-bg-color-container);
  color: var(--td-text-color-secondary);
  font-size: var(--app-text-xs);
  white-space: nowrap;
  strong { color: var(--td-text-color-primary); font-size: var(--app-text-sm); }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--td-text-color-placeholder); }
  &--ok .dot { background: var(--td-success-color); box-shadow: 0 0 0 3px color-mix(in srgb, var(--td-success-color) 18%, transparent); }
  &--warn .dot { background: var(--td-warning-color); box-shadow: 0 0 0 3px color-mix(in srgb, var(--td-warning-color) 20%, transparent); }
  &--bad .dot { background: var(--td-error-color); box-shadow: 0 0 0 3px color-mix(in srgb, var(--td-error-color) 20%, transparent); }
}
.filters { flex-shrink: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; }
.filter { width: 220px; max-width: 100%; }
.cancelled { display: inline-flex; align-items: center; gap: 6px; color: var(--td-text-color-secondary); font-size: var(--app-text-sm); cursor: pointer; }
.muted { .gsms-muted(); }

// Panneaux compacts : en-tête serré, pied en petit texte.
.panel {
  position: relative;
  min-width: 0;
  border: 1px solid var(--td-component-stroke);
  border-radius: var(--app-radius-md);
  background: var(--td-bg-color-container);
  .gsms-elevated();
}
.pad { padding: 14px 16px; }
.ph {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px 8px;
  h3 { margin: 0; color: var(--td-text-color-primary); font-family: var(--app-font-family-display); font-size: var(--app-text-sm); font-weight: 600; }
  .count { margin-left: auto; }
}
.hint { color: var(--td-text-color-secondary); font-size: var(--app-text-xs); }
.count {
  min-width: 22px;
  padding: 1px 8px;
  border-radius: var(--app-radius-pill);
  background: var(--td-bg-color-component);
  color: var(--td-text-color-secondary);
  font-size: var(--app-text-xs);
  font-weight: 700;
  text-align: center;
  &--warn { background: var(--td-warning-color-1); color: var(--td-warning-color); }
  &--bad { background: var(--td-error-color-1); color: var(--td-error-color); }
}
.ok-line { display: flex; align-items: center; gap: 6px; margin: 0; padding: 4px 2px; color: var(--td-success-color); font-size: var(--app-text-sm); font-weight: 600; }
.foot { margin: 0; padding: 8px 14px; border-top: 1px solid var(--td-component-stroke); color: var(--td-text-color-placeholder); font-size: var(--app-text-xs); line-height: 16px; }

// Grille : file « À traiter » | vue de la période. Avec le diagramme, la file prend sa hauteur et défile dedans.
.board { display: grid; grid-template-columns: minmax(220px, 260px) minmax(0, 1fr); gap: 12px; align-items: start; }
.board--chart { align-items: stretch; .queue { contain: size; min-height: 280px; } }
.board:not(.board--chart) .queue { position: sticky; top: 0; max-height: calc(100vh - 140px); }
.main { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.queue { display: flex; flex-direction: column; }
.queue-body { display: flex; flex: 1; flex-direction: column; gap: 8px; min-height: 0; padding: 4px 10px 10px; overflow-y: auto; }
.sev { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 10px 8px; }
.sev-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 26px;
  padding: 0 10px;
  border: 1px solid var(--td-component-stroke);
  border-radius: var(--app-radius-pill);
  background: var(--td-bg-color-container);
  color: var(--td-text-color-primary);
  font: inherit;
  font-size: var(--app-text-xs);
  cursor: pointer;
  &:disabled { opacity: 0.5; cursor: default; }
  &:focus-visible { outline: 2px solid var(--td-brand-color); outline-offset: 1px; }
  &--haute strong { color: var(--td-error-color); }
  &--moyenne strong { color: var(--td-warning-color); }
  &--basse strong { color: var(--td-text-color-secondary); }
  &.is-active { border-color: var(--td-brand-color); background: var(--td-brand-color-light); }
}
// Carte d'une alerte (comme une expédition de la file Logistics) : gravité en liseré.
.job {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 9px 10px;
  border: 1px solid var(--td-component-stroke);
  border-left: 3px solid var(--td-text-color-placeholder);
  border-radius: var(--app-radius-sm);
  background: var(--td-bg-color-secondarycontainer);
  font-size: var(--app-text-sm);
  &--haute { border-left-color: var(--td-error-color); }
  &--moyenne { border-left-color: var(--td-warning-color); }
  &.is-on { border-color: var(--td-brand-color); box-shadow: inset 0 0 0 1px var(--td-brand-color); }
}
.job-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.job-text { margin: 0; color: var(--td-text-color-primary); line-height: 18px; overflow-wrap: anywhere; }
.job-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.ref {
  padding: 0 6px;
  border: 1px solid var(--td-component-stroke);
  border-radius: var(--app-radius-xs);
  background: var(--td-bg-color-container);
  color: var(--td-text-color-primary);
  font: inherit;
  font-size: var(--app-text-xs);
  font-weight: 600;
  cursor: pointer;
  &:hover { border-color: var(--td-brand-color); color: var(--td-brand-color); }
  &:focus-visible { outline: 2px solid var(--td-brand-color); }
}
.job-link { margin-left: auto; color: var(--td-brand-color); font-size: var(--app-text-xs); font-weight: 600; text-decoration: none; &:hover { text-decoration: underline; } }
.filter-note { display: flex; align-items: center; gap: 4px; margin: 0; color: var(--td-text-color-secondary); font-size: var(--app-text-sm); }
.chart { overflow: hidden; }

// Dessous : session sélectionnée | conflits.
.below { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(260px, 1fr); gap: 12px; align-items: start; margin-top: 12px; }
.below--solo { grid-template-columns: minmax(0, 1fr); }
.conflict-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0 14px 12px;
  list-style: none;
  li { display: flex; flex-direction: column; gap: 4px; padding-top: 8px; font-size: var(--app-text-sm); }
  li + li { border-top: 1px dashed var(--td-component-stroke); }
}
.conflicts .ok-line { padding: 0 14px 12px; }
.conflict-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.conflict-text { color: var(--td-text-color-primary); overflow-wrap: anywhere; }
.conflict-cell { display: inline-flex; align-items: center; gap: 4px; margin-right: 6px; }

.cell-fill { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.mini-gauge {
  display: inline-block;
  width: 36px;
  height: 4px;
  overflow: hidden;
  border-radius: var(--app-radius-pill);
  background: var(--td-bg-color-component);
  span { display: block; height: 100%; background: var(--td-brand-color); }
  &--over span { background: var(--td-error-color); }
}
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
@media (max-width: 1200px) { .below { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 960px) {
  .board, .board--chart { grid-template-columns: minmax(0, 1fr); }
  .board--chart .queue { contain: none; }
  .queue, .board:not(.board--chart) .queue { position: static; max-height: 360px; }
}
@media (max-width: 720px) {
  .stats { margin-left: 0; }
  .period { width: 100%; margin-left: 0; }
  .filter { width: 100%; }
  .anchor { width: 130px; }
}
</style>
