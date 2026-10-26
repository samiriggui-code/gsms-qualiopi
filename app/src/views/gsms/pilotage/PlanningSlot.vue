<template>
  <article class="slot" :class="{ 'slot--conflict': item.conflits.length, 'slot--cancelled': item.session.statut === 'ANNULEE' }">
    <div class="slot-time">
      <t-icon name="time" size="13px" />
      <span>{{ when }}</span>
      <GsmsStatusTag v-if="item.session.statut === 'ANNULEE'" code="ANNULEE" />
    </div>
    <router-link :to="`/platform/sessions/${item.session.id}`" class="slot-ref">{{ item.session.reference }}</router-link>
    <span class="slot-line slot-program" :title="item.programme.intitule || undefined">
      <FormationThumb :image="item.programme.image_url" :size="20" />{{ item.programme.code || item.programme.intitule || '—' }}
    </span>
    <span class="slot-line">
      <GsmsPersonAvatar v-if="item.formateur" :name="item.formateur.nom" :photo="item.formateur.photo_url" :size="18" />
      <t-icon v-else name="user" size="13px" />{{ item.formateur?.nom || t('gsms.planning.sansFormateur') }}
    </span>
    <span v-if="place" class="slot-line"><t-icon name="location" size="13px" />{{ place }}</span>
    <span class="slot-line"><t-icon name="usergroup" size="13px" />{{ headcount }}</span>
    <ul v-if="item.conflits.length" class="slot-conflicts">
      <li v-for="(c, i) in item.conflits" :key="i">
        <GsmsStatusTag :code="c.certitude" :label="t(`gsms.planning.conflits.certitude.${c.certitude}`)" />
        <span>{{ t(`gsms.planning.conflits.types.${c.type}`) }} · {{ t('gsms.planning.conflits.avec', { sessions: others(c.sessions) }) }}</span>
      </li>
    </ul>
  </article>
</template>

<script setup lang="ts">
/** Un créneau du planning tel que l'API le donne (horaires, demi-journée ou session entière ; conflits signalés). */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import GsmsPersonAvatar from '@/components/gsms/GsmsPersonAvatar.vue'
import FormationThumb from '@/views/gsms/formations/FormationThumb.vue'
import type { PlanningSlot } from '@/api/gsms/pilotage'
import { fmtDate } from '@/components/gsms/format'

const props = defineProps<{ item: PlanningSlot }>()
const { t } = useI18n()

const when = computed(() => {
  const s = props.item
  if (s.heure_debut && s.heure_fin) return `${s.heure_debut} – ${s.heure_fin}`
  if (s.periode === 'MATIN' || s.periode === 'APRES_MIDI') return t(`gsms.planning.periodes.${s.periode}`)
  if (s.type === 'SESSION') return t('gsms.planning.sessionEntiere', { du: fmtDate(s.debut), au: fmtDate(s.fin) })
  return s.periode || '—'
})
const place = computed(() => [props.item.lieu, props.item.salle].filter(Boolean).join(' · '))
const headcount = computed(() => (props.item.capacite !== null
  ? t('gsms.planning.effectif', { n: props.item.effectif, capacite: props.item.capacite })
  : t('gsms.planning.effectifSansCapacite', { n: props.item.effectif })))
/** Les autres sessions du conflit (l'API donne les deux références). */
const others = (refs: string[]) => refs.filter((r) => r !== props.item.session.reference).join(', ') || refs.join(', ')
</script>

<style scoped lang="less">
.slot {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--td-component-stroke);
  border-left: 3px solid var(--td-brand-color);
  border-radius: var(--app-radius-sm);
  background: var(--td-bg-color-container);
  font-size: var(--app-text-sm);
  line-height: 18px;
  &--conflict { border-left-color: var(--td-warning-color); background: color-mix(in srgb, var(--td-warning-color) 5%, var(--td-bg-color-container)); }
  &--cancelled { opacity: 0.75; border-left-color: var(--td-text-color-disabled); }
}
.slot-time { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; color: var(--td-text-color-secondary); font-size: var(--app-text-xs); font-weight: 600; }
.slot-ref {
  color: var(--td-text-color-primary);
  font-weight: 600;
  text-decoration: none;
  overflow-wrap: anywhere;
  &:hover { color: var(--td-brand-color); }
  &:focus-visible { outline: 2px solid var(--td-brand-color); outline-offset: 2px; border-radius: var(--app-radius-xs); }
}
.slot-line {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  color: var(--td-text-color-secondary);
  overflow-wrap: anywhere;
  .t-icon { flex-shrink: 0; }
}
.slot-program { gap: 6px; }
.slot-conflicts {
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
  li { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; color: var(--td-text-color-primary); font-size: var(--app-text-xs); }
}
</style>
