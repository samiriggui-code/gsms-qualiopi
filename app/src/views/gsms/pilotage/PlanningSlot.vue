<template>
  <button type="button" class="slot" :class="[{ 'slot--compact': compact, 'slot--cancelled': item.session.statut === 'ANNULEE' },
    item.alerte_max ? `slot--${item.alerte_max.toLowerCase()}` : '']" :style="{ '--tone': toneColor }"
    :aria-label="t('gsms.planning.ouvrirCreneau', { ref: item.session.reference, quand: when })" @click="emit('select', item)">
    <span class="slot-time">
      <t-icon name="time" size="13px" aria-hidden="true" />
      <span>{{ when }}</span>
      <GsmsStatusTag v-if="item.session.statut === 'ANNULEE'" code="ANNULEE" />
      <span v-if="alertCount" class="slot-badge" :class="`slot-badge--${(item.alerte_max || 'BASSE').toLowerCase()}`"
        :title="t('gsms.planning.alertes.nb', { n: alertCount })">
        <t-icon name="error-triangle" size="12px" aria-hidden="true" />{{ alertCount }}
      </span>
      <span v-else-if="item.conflits.length" class="slot-badge slot-badge--moyenne"><t-icon name="error-triangle" size="12px" aria-hidden="true" />{{ item.conflits.length }}</span>
    </span>
    <span class="slot-ref">
      <FormationThumb :image="item.programme.image_url" :size="compact ? 18 : 22" />
      <span class="slot-ref-text">{{ item.session.reference }}</span>
    </span>
    <span v-if="!compact" class="slot-line slot-program" :title="item.programme.intitule || undefined">{{ item.programme.intitule || item.programme.code || '—' }}</span>
    <span v-if="!compact" class="slot-line">
      <GsmsPersonAvatar v-if="item.formateur" :name="item.formateur.nom" :photo="item.formateur.photo_url" :size="18" />
      <t-icon v-else name="user" size="13px" aria-hidden="true" />{{ item.formateur?.nom || t('gsms.planning.sansFormateur') }}
    </span>
    <span v-if="place && !compact" class="slot-line"><t-icon name="location" size="13px" aria-hidden="true" />{{ place }}</span>
    <span class="slot-fill">
      <span class="slot-fill-text">{{ headcount }}</span>
      <span v-if="gauge" class="gauge" :class="{ 'gauge--over': gauge.over }" aria-hidden="true"><span :style="{ width: `${gauge.pct}%` }" /></span>
    </span>
  </button>
</template>

<script setup lang="ts">
/**
 * Un créneau du planning tel que l'API le donne : couleur de la formation (repère visuel), badge d'alertes (nombre et
 * gravité décidés par l'API), jauge inscrits / capacité. Un clic ouvre le panneau de la session.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import GsmsPersonAvatar from '@/components/gsms/GsmsPersonAvatar.vue'
import FormationThumb from '@/views/gsms/formations/FormationThumb.vue'
import type { PlanningSession, PlanningSlot } from '@/api/gsms/pilotage'
import { fmtDate } from '@/components/gsms/format'
import { fill, formationTone } from './planningView'

const props = withDefaults(defineProps<{ item: PlanningSlot; session?: PlanningSession | null; compact?: boolean }>(),
  { session: null, compact: false })
const emit = defineEmits<{ select: [PlanningSlot] }>()
const { t } = useI18n()

const toneColor = computed(() => `hsl(${formationTone(props.item.programme.id) * 45 + 210} 62% 50%)`)
const alertCount = computed(() => props.item.alertes?.length ?? 0)
const when = computed(() => {
  const s = props.item
  if (s.heure_debut && s.heure_fin) return `${s.heure_debut} – ${s.heure_fin}`
  if (s.periode === 'MATIN' || s.periode === 'APRES_MIDI') return t(`gsms.planning.periodes.${s.periode}`)
  if (s.type === 'SESSION') return props.compact ? t('gsms.planning.sessionEntiereCourt') : t('gsms.planning.sessionEntiere', { du: fmtDate(s.debut), au: fmtDate(s.fin) })
  return s.periode || '—'
})
const place = computed(() => [props.item.lieu, props.item.salle].filter(Boolean).join(' · '))
// Inscrits et capacité : ceux de la session (API), sinon ceux du créneau.
const inscrits = computed(() => props.session?.inscrits ?? props.item.effectif)
const capacite = computed(() => props.session?.capacite ?? props.item.capacite)
const headcount = computed(() => (capacite.value !== null
  ? t('gsms.planning.effectif', { n: inscrits.value, capacite: capacite.value })
  : t('gsms.planning.effectifSansCapacite', { n: inscrits.value })))
const gauge = computed(() => fill(inscrits.value, capacite.value))
</script>

<style scoped lang="less">
.slot {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 3px;
  width: 100%;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--td-component-stroke);
  border-left: 4px solid var(--tone);
  border-radius: var(--app-radius-sm);
  background: color-mix(in srgb, var(--tone) 7%, var(--td-bg-color-container));
  color: inherit;
  font: inherit;
  font-size: var(--app-text-sm);
  line-height: 18px;
  text-align: left;
  cursor: pointer;
  transition: border-color var(--app-motion-fast), box-shadow var(--app-motion-fast);
  &:hover { border-color: var(--tone); box-shadow: var(--td-shadow-1); }
  &:focus-visible { outline: 2px solid var(--td-brand-color); outline-offset: 2px; }
  &--haute { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--td-error-color) 40%, transparent); }
  &--cancelled { opacity: 0.7; border-left-color: var(--td-text-color-disabled); }
  &--compact { padding: 4px 6px; gap: 2px; font-size: var(--app-text-xs); line-height: 16px; }
}
.slot-time { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; color: var(--td-text-color-secondary); font-size: var(--app-text-xs); font-weight: 600; }
.slot-badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
  padding: 0 6px;
  border-radius: var(--app-radius-pill);
  font-size: var(--app-text-xs);
  font-weight: 600;
  &--haute { background: var(--td-error-color-1); color: var(--td-error-color); }
  &--moyenne { background: var(--td-warning-color-1); color: var(--td-warning-color); }
  &--basse { background: var(--td-bg-color-component); color: var(--td-text-color-secondary); }
}
.slot-ref { display: flex; align-items: center; gap: 6px; min-width: 0; color: var(--td-text-color-primary); font-weight: 600; }
.slot-ref-text { min-width: 0; overflow-wrap: anywhere; }
.slot-line {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  color: var(--td-text-color-secondary);
  overflow-wrap: anywhere;
  .t-icon { flex-shrink: 0; }
}
.slot-program { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.slot-fill { display: flex; align-items: center; gap: 6px; color: var(--td-text-color-secondary); font-size: var(--app-text-xs); }
.slot-fill-text { white-space: nowrap; }
.gauge {
  flex: 1;
  min-width: 24px;
  height: 4px;
  overflow: hidden;
  border-radius: var(--app-radius-pill);
  background: var(--td-bg-color-component);
  span { display: block; height: 100%; border-radius: inherit; background: var(--tone); }
  &--over span { background: var(--td-error-color); }
}
</style>
