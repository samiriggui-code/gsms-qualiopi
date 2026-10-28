<template>
  <div class="month" role="grid" :aria-label="title">
    <div class="month-row month-head" role="row">
      <span v-for="d in weekdays" :key="d" role="columnheader" class="month-wd">{{ d }}</span>
    </div>
    <div v-for="(w, i) in weeks" :key="i" class="month-row" role="row">
      <div v-for="day in w" :key="day" role="gridcell" class="cell"
        :class="{ 'cell--out': day.slice(0, 7) !== month, 'cell--today': day === today }">
        <button type="button" class="cell-day" :aria-label="t('gsms.planning.voirSemaine', { jour: fmtDate(day) })" @click="emit('day', day)">
          {{ Number(day.slice(8)) }}
        </button>
        <PlanningSlot v-for="s in (byDay.get(day) ?? []).slice(0, MAX)" :key="s.id" :item="s" :session="sessionOf(s)" compact
          @select="emit('select', s)" />
        <button v-if="(byDay.get(day)?.length ?? 0) > MAX" type="button" class="cell-more" @click="emit('day', day)">
          {{ t('gsms.planning.plus', { n: byDay.get(day)!.length - MAX }) }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/** Vue Mois : calendrier compact du lundi au dimanche ; trois créneaux par jour au plus, « + N » ouvre la semaine. */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PlanningSession, PlanningSlot as Slot } from '@/api/gsms/pilotage'
import { fmtDate } from '@/components/gsms/format'
import PlanningSlot from './PlanningSlot.vue'
import { addDays, parse } from './planningView'

const props = defineProps<{ weeks: string[][]; month: string; today: string; slots: Slot[]; sessionOf: (s: Slot) => PlanningSession | null }>()
const emit = defineEmits<{ select: [Slot]; day: [string] }>()
const { t, locale } = useI18n()
const MAX = 3

const title = computed(() => parse(`${props.month}-01`).toLocaleDateString(locale.value, { month: 'long', year: 'numeric' }))
const weekdays = computed(() => (props.weeks[0] ?? []).map((d) => parse(d).toLocaleDateString(locale.value, { weekday: 'short' })))
const byDay = computed(() => {
  const map = new Map<string, Slot[]>()
  const first = props.weeks[0]?.[0]
  const last = props.weeks.at(-1)?.[6]
  if (!first || !last) return map
  for (const s of props.slots) {
    // Une session entière couvre chacun de ses jours dans la grille.
    for (let d = s.debut < first ? first : s.debut; d <= s.fin && d <= last; d = addDays(d, 1)) {
      if (!map.has(d)) map.set(d, [])
      map.get(d)!.push(s)
    }
  }
  return map
})
</script>

<style scoped lang="less">
.month { display: flex; flex-direction: column; gap: 4px; }
.month-row { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
.month-wd { padding: 2px 6px; color: var(--td-text-color-secondary); font-size: var(--app-text-xs); font-weight: 600; text-transform: capitalize; }
.cell {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  min-height: 96px;
  padding: 4px;
  border: 1px solid var(--td-component-stroke);
  border-radius: var(--app-radius-sm);
  background: var(--td-bg-color-container);
  &--out { background: var(--td-bg-color-secondarycontainer); .cell-day { color: var(--td-text-color-placeholder); } }
  &--today { border-color: var(--td-brand-color); .cell-day { background: var(--td-brand-color); color: var(--td-text-color-anti); } }
}
.cell-day {
  align-self: flex-start;
  min-width: 22px;
  padding: 0 4px;
  border: 0;
  border-radius: var(--app-radius-pill);
  background: none;
  color: var(--td-text-color-primary);
  font: inherit;
  font-size: var(--app-text-xs);
  font-weight: 600;
  cursor: pointer;
  &:hover { background: var(--td-bg-color-component); }
  &:focus-visible { outline: 2px solid var(--td-brand-color); }
}
.cell-more {
  border: 0;
  background: none;
  color: var(--td-brand-color);
  font: inherit;
  font-size: var(--app-text-xs);
  text-align: left;
  cursor: pointer;
}
</style>
