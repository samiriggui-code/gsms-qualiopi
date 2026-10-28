<template>
  <div class="tl" :style="{ '--cols': cols }">
    <div class="tl-top">
      <h3>{{ t('gsms.planning.diagramme.titre') }}</h3>
      <GsmsFilterTabs :model-value="by" :options="byTabs" :label="t('gsms.planning.ressources.par')" @update:model-value="(v: string) => emit('update:by', v as By)" />
    </div>
    <div class="tl-scroll">
      <!-- En-tête : jours, puis matin / après-midi -->
      <div class="tl-row tl-head">
        <div class="tl-who tl-who--head">{{ by === 'formateurs' ? t('gsms.planning.col.formateur') : t('gsms.planning.ressources.salle') }}</div>
        <div class="tl-days">
          <span v-for="d in days" :key="d" class="tl-day" :class="{ 'is-today': d === today, 'is-weekend': weekend(d) }">
            <strong>{{ dayLabel(d) }}</strong>
            <span class="tl-halves"><i>{{ t('gsms.planning.diagramme.matin') }}</i><i>{{ t('gsms.planning.diagramme.apresMidi') }}</i></span>
          </span>
        </div>
      </div>

      <div v-for="r in rows" :key="r.key" class="tl-row" :class="{ 'is-on': r.placed.some((p) => p.items[0]!.session.id === selected) }">
        <button type="button" class="tl-who" @click="r.placed[0] && emit('select', r.placed[0].items[0]!)">
          <GsmsPersonAvatar v-if="by === 'formateurs' && r.key" :name="r.label" :photo="r.photo" :size="30" />
          <span v-else class="tl-icon" :class="{ 'tl-icon--none': !r.key }" aria-hidden="true">
            <t-icon :name="by === 'formateurs' ? 'user' : 'location'" size="15px" />
          </span>
          <span class="tl-who-text">
            <strong>{{ r.label }}</strong>
            <span class="tl-hint">
              <i class="tl-dot" :class="`tl-dot--${(r.worst || 'ok').toLowerCase()}`" />
              {{ r.sub ? `${r.sub} · ` : '' }}{{ t('gsms.planning.ressources.nCreneaux', { n: r.count }) }}<template v-if="r.alerted"> · {{ t('gsms.planning.alertes.nb', { n: r.alerted }) }}</template>
            </span>
          </span>
        </button>
        <div class="tl-lane" :style="{ height: `${r.lanes * LANE + 12}px` }">
          <i v-if="todayIndex >= 0" class="tl-today" :style="{ left: pct(todayIndex * 2), width: pct(2) }" aria-hidden="true" />
          <button v-for="p in r.placed" :key="p.items[0]!.id" type="button" class="tl-bar"
            :class="[{ 'is-sel': p.items[0]!.session.id === selected, 'is-whole': p.items[0]!.type === 'SESSION', 'is-cancelled': p.items[0]!.session.statut === 'ANNULEE' },
              worstOf(p.items) ? `is-${worstOf(p.items)!.toLowerCase()}` : '']"
            :style="{ left: pct(p.from), width: `calc(${pct(p.to - p.from)} - 4px)`, top: `${6 + p.lane * LANE}px`, '--tone': tone(p.items[0]!) }"
            :title="tooltip(p.items)" :aria-label="t('gsms.planning.ouvrirCreneau', { ref: p.items[0]!.session.reference, quand: span(p.items) })"
            @click="emit('select', p.items[0]!)">
            <span class="tl-bar-top">
              <span class="tl-bar-ref">{{ p.items[0]!.session.reference }}</span>
              <span v-if="alertsOf(p.items)" class="tl-badge"><t-icon name="error-triangle" size="11px" aria-hidden="true" />{{ alertsOf(p.items) }}</span>
            </span>
            <span class="tl-bar-when">{{ span(p.items) }}<template v-if="p.items[0]!.programme.intitule"> · {{ p.items[0]!.programme.intitule }}</template></span>
          </button>
        </div>
      </div>

      <p v-if="!rows.length" class="tl-empty">{{ t('gsms.planning.vide') }} — {{ t('gsms.planning.videAide') }}</p>
    </div>

    <div class="tl-legend">
      <span><i class="tl-sw" /> {{ t('gsms.planning.diagramme.legendeCouleur') }}</span>
      <span><i class="tl-sw tl-sw--whole" /> {{ t('gsms.planning.sessionEntiereCourt') }}</span>
      <span><i class="tl-sw tl-sw--haute" /> {{ t('gsms.planning.diagramme.legendeAlerte') }}</span>
      <span><i class="tl-sw tl-sw--today" /> {{ t('gsms.planning.aujourdhui') }}</span>
      <span>{{ t('gsms.planning.diagramme.legendeDemiJournees') }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Diagramme de la semaine : une ligne par formateur (ou par salle), les jours en colonnes coupées en matin et
 * après-midi. Les demi-journées d'une session qui se suivent forment une barre (comme un voyage et ses arrêts dans
 * Logistics) ; deux barres qui se chevauchent sur une ligne passent sur deux couloirs. Les
 * conflits et alertes restent ceux de l'API (badge et couleur de bord), le diagramme n'en déduit aucun.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import GsmsFilterTabs from '@/components/gsms/GsmsFilterTabs.vue'
import GsmsPersonAvatar from '@/components/gsms/GsmsPersonAvatar.vue'
import type { PlanningSeverity, PlanningSlot } from '@/api/gsms/pilotage'
import { formationTone, packLanes, parse, SEVERITIES, type Placed } from './planningView'

type By = 'formateurs' | 'salles'
const props = defineProps<{ slots: PlanningSlot[]; days: string[]; today: string; selected: string | null; by: By }>()
const emit = defineEmits<{ select: [PlanningSlot]; 'update:by': [By] }>()
const { t, locale } = useI18n()

const LANE = 44
const cols = computed(() => props.days.length * 2)
const pct = (n: number) => `${(n / cols.value) * 100}%`
const todayIndex = computed(() => props.days.indexOf(props.today))
const weekend = (d: string) => [0, 6].includes(parse(d).getDay())
const byTabs = computed(() => [
  { value: 'formateurs', label: t('gsms.planning.ressources.formateurs') },
  { value: 'salles', label: t('gsms.planning.ressources.salles') },
])

interface Row { key: string; label: string; sub: string; photo: string | null; placed: Placed<PlanningSlot>[]; lanes: number; count: number; worst: PlanningSeverity | null; alerted: number }
const rows = computed<Row[]>(() => {
  const du = props.days[0]
  const au = props.days.at(-1)
  if (!du || !au) return []
  const groups = new Map<string, { label: string; sub: string; photo: string | null; slots: PlanningSlot[] }>()
  for (const s of props.slots) {
    const key = props.by === 'formateurs' ? s.formateur?.id ?? '' : (s.lieu || s.salle ? `${s.lieu ?? ''}|${s.salle ?? ''}` : '')
    if (!groups.has(key)) {
      groups.set(key, props.by === 'formateurs'
        ? { label: s.formateur?.nom || t('gsms.planning.sansFormateur'), sub: '', photo: s.formateur?.photo_url ?? null, slots: [] }
        : {
          label: s.salle || s.lieu || t('gsms.planning.ressources.sansSalle'),
          sub: [s.salle ? s.lieu : '', s.salle_lieu?.capacite != null ? t('gsms.planning.ressources.places', { n: s.salle_lieu.capacite }) : '']
            .filter(Boolean).join(' · '),
          photo: null, slots: [],
        })
    }
    groups.get(key)!.slots.push(s)
  }
  return [...groups.entries()]
    .map(([key, g]) => {
      const { placed, lanes } = packLanes(g.slots, du, au, (s) => s.session.id)
      const count = placed.reduce((n, p) => n + p.items.length, 0)
      return { key, label: g.label, sub: g.sub, photo: g.photo, placed, lanes, count, worst: worstOf(g.slots), alerted: g.slots.filter((s) => s.alertes?.length).length }
    })
    .filter((r) => r.placed.length)
    // Lignes sans formateur ou sans salle en dernier : ce sont elles qu'il faut compléter.
    .sort((a, b) => Number(!a.key) - Number(!b.key) || a.label.localeCompare(b.label, locale.value))
})

const tone = (s: PlanningSlot) => `hsl(${formationTone(s.programme.id) * 45 + 210} 62% 50%)`
function when(s: PlanningSlot): string {
  if (s.heure_debut && s.heure_fin) return `${s.heure_debut}–${s.heure_fin}`
  if (s.periode === 'MATIN' || s.periode === 'APRES_MIDI') return t(`gsms.planning.periodes.${s.periode}`)
  return t('gsms.planning.sessionEntiereCourt')
}
/** Une barre : un créneau (son horaire) ou plusieurs demi-journées qui se suivent (leur nombre). */
const span = (items: PlanningSlot[]) => (items.length > 1 ? t('gsms.planning.diagramme.demiJournees', { n: items.length }) : when(items[0]!))
const worstOf = (items: PlanningSlot[]): PlanningSeverity | null => SEVERITIES.find((sev) => items.some((s) => s.alerte_max === sev)) ?? null
const alertsOf = (items: PlanningSlot[]) => new Set(items.flatMap((s) => s.alertes ?? [])).size
function tooltip(items: PlanningSlot[]): string {
  const s = items[0]!
  const place = [s.lieu, s.salle].filter(Boolean).join(' · ')
  return [`${s.session.reference} · ${s.programme.intitule || s.programme.code || ''}`,
    ...items.map((x) => `${dayLabel(x.debut)}${x.fin !== x.debut ? ` → ${dayLabel(x.fin)}` : ''} · ${when(x)}`),
    props.by === 'salles' ? s.formateur?.nom : place,
    s.capacite !== null ? t('gsms.planning.effectif', { n: s.effectif, capacite: s.capacite }) : t('gsms.planning.effectifSansCapacite', { n: s.effectif })]
    .filter(Boolean).join('\n')
}
function dayLabel(d: string): string {
  const label = parse(d).toLocaleDateString(locale.value, { weekday: 'short', day: '2-digit', month: '2-digit' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}
</script>

<style scoped lang="less">
.tl { display: flex; flex-direction: column; min-width: 0; }
.tl-scroll { overflow-x: auto; }
.tl-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--td-component-stroke);
  h3 { margin: 0; color: var(--td-text-color-primary); font-family: var(--app-font-family-display); font-size: var(--app-text-sm); font-weight: 600; }
}
.tl-row { display: grid; grid-template-columns: 190px minmax(0, 1fr); min-width: 900px; }
.tl-row + .tl-row { border-top: 1px solid var(--td-component-stroke); }
.tl-row.is-on { background: color-mix(in srgb, var(--td-brand-color) 5%, transparent); .tl-who { box-shadow: inset 3px 0 0 var(--td-brand-color); } }
.tl-head { position: sticky; top: 0; z-index: 4; background: var(--td-bg-color-container); }
.tl-who {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 8px 12px;
  border: 0;
  border-right: 1px solid var(--td-component-stroke);
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  &:hover strong { color: var(--td-brand-color); }
  &:focus-visible { outline: 2px solid var(--td-brand-color); outline-offset: -2px; }
  &--head { cursor: default; color: var(--td-text-color-secondary); font-size: var(--app-text-xs); }
}
.tl-icon {
  display: grid;
  flex: none;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 50%;
  background: var(--td-brand-color-light);
  color: var(--td-brand-color);
  &--none { border: 1px dashed var(--td-component-border); background: none; color: var(--td-text-color-placeholder); }
}
.tl-who-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  strong, .tl-hint { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  strong { color: var(--td-text-color-primary); font-size: var(--app-text-sm); font-weight: 600; }
}
.tl-hint { color: var(--td-text-color-secondary); font-size: var(--app-text-xs); }
.tl-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 4px;
  border-radius: 50%;
  vertical-align: 1px;
  &--ok { background: var(--td-success-color); box-shadow: 0 0 0 3px color-mix(in srgb, var(--td-success-color) 18%, transparent); }
  &--haute { background: var(--td-error-color); box-shadow: 0 0 0 3px color-mix(in srgb, var(--td-error-color) 20%, transparent); }
  &--moyenne { background: var(--td-warning-color); box-shadow: 0 0 0 3px color-mix(in srgb, var(--td-warning-color) 20%, transparent); }
  &--basse { background: var(--td-text-color-placeholder); }
}
.tl-days { display: grid; grid-template-columns: repeat(calc(var(--cols) / 2), minmax(0, 1fr)); }
.tl-day {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-left: 1px solid var(--td-component-stroke);
  strong { padding: 6px 8px 2px; color: var(--td-text-color-primary); font-size: var(--app-text-xs); font-weight: 600; white-space: nowrap; }
  &.is-weekend strong { color: var(--td-text-color-placeholder); }
  &.is-today strong { color: var(--td-brand-color); }
  &.is-today { background: color-mix(in srgb, var(--td-brand-color) 7%, transparent); }
}
.tl-halves {
  display: grid;
  grid-template-columns: 1fr 1fr;
  i { padding: 0 8px 5px; overflow: hidden; color: var(--td-text-color-placeholder); font-size: var(--app-text-2xs); font-style: normal; text-overflow: ellipsis; white-space: nowrap; }
  i + i { border-left: 1px dashed var(--td-component-stroke); }
}
.tl-lane {
  position: relative;
  min-height: 56px;
  // Un trait entre les jours ; un trait plus pâle (::before) entre matin et après-midi.
  background-image: linear-gradient(to right, var(--td-component-stroke) 1px, transparent 1px);
  background-size: calc(200% / var(--cols)) 100%;
}
.tl-lane::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image: linear-gradient(to right, transparent calc(50% - 0.5px), color-mix(in srgb, var(--td-component-stroke) 60%, transparent) calc(50% - 0.5px), color-mix(in srgb, var(--td-component-stroke) 60%, transparent) calc(50% + 0.5px), transparent calc(50% + 0.5px));
  background-size: calc(200% / var(--cols)) 100%;
  pointer-events: none;
}
.tl-today { position: absolute; top: 0; bottom: 0; background: color-mix(in srgb, var(--td-brand-color) 7%, transparent); pointer-events: none; }
.tl-bar {
  position: absolute;
  z-index: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1px;
  height: 38px;
  margin-left: 2px;
  padding: 3px 8px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--tone) 45%, transparent);
  border-left: 3px solid var(--tone);
  border-radius: var(--app-radius-sm);
  background: color-mix(in srgb, var(--tone) 13%, var(--td-bg-color-container));
  color: var(--td-text-color-primary);
  font: inherit;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
  transition: box-shadow var(--app-motion-fast), filter var(--app-motion-fast);
  &:hover, &:focus-visible { z-index: 3; box-shadow: var(--td-shadow-1); filter: brightness(1.04); }
  &:focus-visible { outline: 2px solid var(--td-brand-color); outline-offset: 1px; }
  &.is-sel { z-index: 2; outline: 2px solid var(--td-brand-color); outline-offset: 1px; }
  &.is-whole { border-style: dashed; border-left-style: solid; background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--tone) 12%, var(--td-bg-color-container)) 0 8px, color-mix(in srgb, var(--tone) 6%, var(--td-bg-color-container)) 8px 16px); }
  &.is-cancelled { opacity: 0.55; text-decoration: line-through; }
  &.is-haute { box-shadow: inset 0 0 0 1px var(--td-error-color), 0 0 10px color-mix(in srgb, var(--td-error-color) 22%, transparent); }
  &.is-moyenne { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--td-warning-color) 70%, transparent); }
}
.tl-bar-top { display: flex; align-items: center; gap: 4px; min-width: 0; }
.tl-bar-when { overflow: hidden; color: var(--td-text-color-secondary); font-size: var(--app-text-2xs); text-overflow: ellipsis; }
.tl-bar-ref { min-width: 0; overflow: hidden; font-size: var(--app-text-xs); font-weight: 700; text-overflow: ellipsis; }
.tl-badge {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 1px;
  margin-left: auto;
  padding: 0 4px;
  border-radius: var(--app-radius-pill);
  background: var(--td-warning-color-1);
  color: var(--td-warning-color);
  font-size: var(--app-text-2xs);
  font-weight: 700;
  .is-haute & { background: var(--td-error-color-1); color: var(--td-error-color); }
}
.tl-empty { margin: 0; padding: 18px 14px; color: var(--td-text-color-secondary); font-size: var(--app-text-sm); }
.tl-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  padding: 10px 14px;
  border-top: 1px solid var(--td-component-stroke);
  color: var(--td-text-color-secondary);
  font-size: var(--app-text-xs);
  span { display: inline-flex; align-items: center; gap: 6px; }
}
.tl-sw {
  display: inline-block;
  width: 14px;
  height: 9px;
  border: 1px solid var(--td-brand-color);
  border-left-width: 3px;
  border-radius: var(--app-radius-xs);
  background: var(--td-brand-color-light);
  &--whole { border-style: dashed; border-left-style: solid; }
  &--haute { border-color: var(--td-error-color); background: var(--td-error-color-1); }
  &--today { border: 0; background: color-mix(in srgb, var(--td-brand-color) 18%, transparent); }
}
</style>
