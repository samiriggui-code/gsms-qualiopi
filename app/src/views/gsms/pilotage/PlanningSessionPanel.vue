<template>
  <div v-if="slot" class="pd" :class="{ 'pd--inline': inline }">
    <!-- Session : formation, dates, lieu, formateur -->
    <section class="pd-head">
      <FormationThumb :image="formation.image_url" :size="inline ? 44 : 56" />
      <div class="pd-head-text">
        <strong class="pd-title"><span v-if="inline" class="pd-ref">{{ slot.session.reference }}</span>{{ formation.intitule || formation.code || '—' }}</strong>
        <span class="pd-sub">
          <GsmsStatusTag :code="statut" />
          <span>{{ dates }}</span>
        </span>
      </div>
      <t-button v-if="inline" class="pd-close" size="small" variant="text" shape="square" :aria-label="t('gsms.planning.panneau.fermer')"
        @click="emit('close')"><template #icon><t-icon name="close" /></template></t-button>
    </section>

    <dl class="pd-facts">
      <div><dt>{{ t('gsms.planning.panneau.creneau') }}</dt><dd>{{ when }}</dd></div>
      <div>
        <dt>{{ t('gsms.planning.panneau.lieu') }}</dt>
        <dd>
          {{ [slot.lieu, slot.salle].filter(Boolean).join(' · ') || t('gsms.planning.panneau.nonRenseigne') }}
          <span v-if="room" class="pd-muted">{{ room.capacite !== null ? t('gsms.planning.panneau.salleCapacite', { nom: room.nom, n: room.capacite }) : room.nom }}</span>
          <span v-else-if="slot.salle && session" class="pd-muted">{{ t('gsms.planning.panneau.salleNonRapprochee') }}</span>
        </dd>
      </div>
      <div>
        <dt>{{ t('gsms.planning.panneau.formateur') }}</dt>
        <dd>
          <router-link v-if="trainer" :to="`/platform/formateurs/${trainer.id}`" class="pd-person">
            <GsmsPersonAvatar :name="trainer.nom" :photo="trainer.photo_url" :size="32" />{{ trainer.nom || '—' }}
          </router-link>
          <span v-else>{{ t('gsms.planning.sansFormateur') }}</span>
        </dd>
      </div>
    </dl>

    <!-- Remplissage : chiffres de l'API -->
    <section class="pd-block">
      <h4>{{ t('gsms.planning.panneau.remplissage') }}</h4>
      <p class="pd-fill">
        <strong>{{ inscrits }}</strong>
        <span v-if="capacite !== null"> / {{ capacite }} · {{ t('gsms.planning.panneau.placesRestantes', { n: session?.places_restantes ?? '—' }) }}</span>
        <span v-else> {{ t('gsms.planning.panneau.sansCapacite') }}</span>
      </p>
      <span v-if="gauge" class="pd-gauge" :class="{ 'pd-gauge--over': gauge.over }" role="img"
        :aria-label="t('gsms.planning.panneau.jauge', { pct: gauge.pct })"><span :style="{ width: `${gauge.pct}%` }" /></span>
    </section>

    <!-- Alertes de la session, avec où agir -->
    <section class="pd-block">
      <h4>{{ t('gsms.planning.alertes.titre') }} <span class="pd-count">{{ alerts.length }}</span></h4>
      <p v-if="!alerts.length" class="pd-muted">{{ t('gsms.planning.alertes.aucuneSession') }}</p>
      <ul v-else class="pd-alerts">
        <li v-for="a in alerts" :key="a.id">
          <t-tag :theme="severityTheme(a.gravite)" variant="light" size="small">{{ t(`gsms.planning.gravites.${a.gravite}`) }}</t-tag>
          <span class="pd-alert-text">{{ a.message }}</span>
          <router-link v-if="alertRoute(a.lien)" :to="alertRoute(a.lien)!" class="pd-alert-link">{{ t(`gsms.planning.cibles.${a.lien.cible}`) }}</router-link>
        </li>
      </ul>
    </section>

    <!-- Échéances Qualiopi : jalons du circuit évalués par le moteur -->
    <section class="pd-block">
      <h4>{{ t('gsms.planning.panneau.echeances') }}</h4>
      <p v-if="!session" class="pd-muted">{{ t('gsms.planning.panneau.echeancesIndisponibles') }}</p>
      <p v-else-if="!session.echeances.length" class="pd-muted">{{ t('gsms.planning.panneau.echeancesNonEvaluees') }}</p>
      <template v-else>
        <ul class="pd-steps">
          <li v-for="m in session.echeances" :key="m.cle">
            <GsmsStatusTag :code="m.etat" />
            <span class="pd-step-text">
              <strong>{{ m.libelle }}</strong>
              <span class="pd-muted">{{ fmtDate(m.echeance) }}<template v-if="m.total"> · {{ m.fait }}/{{ m.total }}</template>
                <template v-if="m.indicateurs.length"> · {{ t('gsms.planning.panneau.indicateurs', { n: m.indicateurs.join(', ') }) }}</template></span>
            </span>
          </li>
        </ul>
        <p v-if="session.echeances_evaluees_le" class="pd-note">{{ t('gsms.planning.panneau.evalueLe', { date: fmtDate(session.echeances_evaluees_le.slice(0, 10)) }) }}</p>
      </template>
    </section>

    <div class="pd-actions">
      <t-button theme="primary" @click="go(`/platform/sessions/${slot.session.id}`)">
        <template #icon><t-icon name="browse" /></template>{{ t('gsms.planning.panneau.ouvrirSession') }}
      </t-button>
      <t-button variant="outline" @click="go(`/platform/emargement/${slot.session.id}`)">
        <template #icon><t-icon name="edit-1" /></template>{{ t('gsms.planning.panneau.ouvrirEmargement') }}
      </t-button>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Fiche d'un créneau : la session (formation, dates, salle, formateur), son remplissage, ses alertes et ses échéances
 * Qualiopi, tels que GET /planning les donne. Actions réelles : ouvrir la session, ouvrir l'émargement.
 * Affichée sous le diagramme (`inline` : en-tête avec fermeture, blocs côte à côte) ou dans le tiroir.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import GsmsPersonAvatar from '@/components/gsms/GsmsPersonAvatar.vue'
import FormationThumb from '@/views/gsms/formations/FormationThumb.vue'
import type { PlanningAlert, PlanningSession, PlanningSlot } from '@/api/gsms/pilotage'
import { fmtDate } from '@/components/gsms/format'
import { alertRoute, fill, severityTheme } from './planningView'

const props = withDefaults(defineProps<{ slot: PlanningSlot | null; session: PlanningSession | null; alerts: PlanningAlert[]; inline?: boolean }>(),
  { inline: false })
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const router = useRouter()

const formation = computed(() => props.session?.formation ?? {
  id: props.slot?.programme.id ?? '', code: props.slot?.programme.code ?? null, intitule: props.slot?.programme.intitule ?? null,
  image_url: props.slot?.programme.image_url ?? null,
})
const statut = computed(() => props.session?.statut ?? props.slot?.session.statut ?? null)
const trainer = computed(() => props.session?.formateur ?? props.slot?.formateur ?? null)
const room = computed(() => props.session?.salle_lieu ?? props.slot?.salle_lieu ?? null)
const inscrits = computed(() => props.session?.inscrits ?? props.slot?.effectif ?? 0)
const capacite = computed(() => props.session?.capacite ?? props.slot?.capacite ?? null)
const gauge = computed(() => fill(inscrits.value, capacite.value))
const dates = computed(() => {
  const s = props.session
  if (!s) return ''
  return s.debut === s.fin ? fmtDate(s.debut) : t('gsms.planning.panneau.duAu', { du: fmtDate(s.debut), au: fmtDate(s.fin) })
})
const when = computed(() => {
  const s = props.slot
  if (!s) return ''
  const day = s.debut === s.fin ? fmtDate(s.debut) : t('gsms.planning.panneau.duAu', { du: fmtDate(s.debut), au: fmtDate(s.fin) })
  if (s.heure_debut && s.heure_fin) return `${day} · ${s.heure_debut} – ${s.heure_fin}`
  if (s.periode === 'MATIN' || s.periode === 'APRES_MIDI') return `${day} · ${t(`gsms.planning.periodes.${s.periode}`)}`
  return `${day} · ${t('gsms.planning.sessionEntiereCourt')}`
})

function go(path: string) {
  emit('close')
  router.push(path)
}
</script>

<style scoped lang="less">
.pd { display: flex; flex-direction: column; gap: 16px; }
// Sous le diagramme : en-tête et actions sur toute la largeur, blocs en colonnes.
.pd--inline {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
  gap: 14px 24px;
  .pd-head, .pd-actions { grid-column: 1 / -1; }
  .pd-head { padding-bottom: 12px; border-bottom: 1px solid var(--td-component-stroke); }
  .pd-facts div { grid-template-columns: 90px minmax(0, 1fr); }
  .pd-block { padding-top: 0; border-top: 0; }
}
.pd-head { display: flex; align-items: center; gap: 12px; }
.pd-head-text { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.pd-title { color: var(--td-text-color-primary); font-size: var(--app-text-md); overflow-wrap: anywhere; }
.pd-ref { margin-right: 8px; color: var(--td-brand-color); font-family: var(--app-font-family-mono, monospace); }
.pd-close { margin-left: auto; align-self: flex-start; }
.pd-sub { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; color: var(--td-text-color-secondary); font-size: var(--app-text-sm); }
.pd-facts {
  display: grid;
  gap: 10px;
  margin: 0;
  div { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 8px; }
  dt { color: var(--td-text-color-secondary); font-size: var(--app-text-sm); }
  dd { display: flex; flex-direction: column; gap: 2px; margin: 0; color: var(--td-text-color-primary); font-size: var(--app-text-sm); overflow-wrap: anywhere; }
}
.pd-person { display: inline-flex; align-items: center; gap: 8px; color: var(--td-text-color-primary); text-decoration: none; &:hover { color: var(--td-brand-color); } }
.pd-muted { color: var(--td-text-color-secondary); font-size: var(--app-text-xs); }
.pd-note { margin: 6px 0 0; color: var(--td-text-color-placeholder); font-size: var(--app-text-xs); }
.pd-block {
  padding-top: 12px;
  border-top: 1px solid var(--td-component-stroke);
  h4 { display: flex; align-items: center; gap: 6px; margin: 0 0 8px; color: var(--td-text-color-primary); font-size: var(--app-text-sm); font-weight: 600; }
}
.pd-count { padding: 0 6px; border-radius: var(--app-radius-pill); background: var(--td-bg-color-component); font-size: var(--app-text-xs); }
.pd-fill { margin: 0 0 6px; color: var(--td-text-color-secondary); font-size: var(--app-text-sm); strong { color: var(--td-text-color-primary); font-size: var(--app-text-lg); } }
.pd-gauge {
  display: block;
  height: 6px;
  overflow: hidden;
  border-radius: var(--app-radius-pill);
  background: var(--td-bg-color-component);
  span { display: block; height: 100%; border-radius: inherit; background: var(--td-brand-color); }
  &--over span { background: var(--td-error-color); }
}
.pd-alerts, .pd-steps {
  list-style: none;
  margin: 0;
  padding: 0;
  li { display: flex; align-items: flex-start; flex-wrap: wrap; gap: 8px; padding: 6px 0; font-size: var(--app-text-sm); line-height: 20px; }
  li + li { border-top: 1px dashed var(--td-component-stroke); }
}
.pd-alert-text { flex: 1; min-width: 160px; color: var(--td-text-color-primary); overflow-wrap: anywhere; }
.pd-alert-link { color: var(--td-brand-color); font-size: var(--app-text-xs); font-weight: 600; text-decoration: none; white-space: nowrap; &:hover { text-decoration: underline; } }
.pd-step-text { display: flex; flex: 1; flex-direction: column; min-width: 0; strong { color: var(--td-text-color-primary); font-weight: 500; } }
.pd-actions { display: flex; flex-wrap: wrap; gap: 8px; padding-top: 12px; border-top: 1px solid var(--td-component-stroke); }
</style>
