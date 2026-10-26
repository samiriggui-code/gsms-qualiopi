<template>
  <PublicLinkPage :page-title="t('gsms.public.espace.titrePage')" :organisme="data?.organisme.nom"
                  :loading="loading" :error="loadError" :closed-title="t('gsms.public.espace.ferme')" :retry="load">
    <template v-if="data">
      <section class="public-card es-hero">
        <h1 class="public-title">{{ t('gsms.public.espace.bonjour', { prenom: data.stagiaire.prenom }) }}</h1>
        <i18n-t keypath="gsms.public.espace.intro" tag="p" class="public-text" scope="global">
          <template #formation><strong class="es-strong">{{ data.formation.intitule }}</strong></template>
          <template #periode>{{ period(data.formation.debut, data.formation.fin) }}</template>
        </i18n-t>
        <ul v-if="data.formation.lieu || data.formation.formateur" class="es-facts">
          <li v-if="data.formation.lieu">
            <t-icon name="location" aria-hidden="true" />
            <span><span class="sr-only">{{ t('gsms.public.espace.lieu') }} : </span>{{ place }}</span>
          </li>
          <li v-if="data.formation.formateur">
            <t-icon name="user" aria-hidden="true" />
            <span>{{ t('gsms.public.espace.formateur', { nom: data.formation.formateur }) }}</span>
          </li>
        </ul>
      </section>

      <section v-if="todo.length" class="public-card" aria-labelledby="es-todo">
        <h2 id="es-todo" class="public-subtitle"><t-icon name="time" aria-hidden="true" />{{ t('gsms.public.espace.aFaire') }}</h2>
        <ul class="es-list">
          <li v-for="q in todo" :key="q.href">
            <a :href="q.href" class="public-row">
              <span class="public-row__body">
                <span class="public-row__title">{{ q.titre }}</span>
                <span class="public-row__detail">{{ t('gsms.public.espace.jusquAu', { date: longDate(q.jusqu_au) }) }}</span>
              </span>
              <t-icon name="chevron-right" aria-hidden="true" />
            </a>
          </li>
        </ul>
      </section>

      <section v-if="upcoming.length" class="public-card" aria-labelledby="es-slots">
        <h2 id="es-slots" class="public-subtitle"><t-icon name="calendar" aria-hidden="true" />{{ t('gsms.public.espace.creneaux') }}</h2>
        <ul class="es-slots">
          <li v-for="c in upcoming" :key="`${c.jour}-${c.periode}`">
            <span class="es-day">{{ longDate(c.jour, { weekday: 'long', day: 'numeric', month: 'long' }) }}</span>
            <span class="public-small">{{ c.periode }}<template v-if="c.debut && c.fin"> · {{ c.debut }} – {{ c.fin }}</template></span>
          </li>
        </ul>
      </section>

      <section class="public-card" aria-labelledby="es-path">
        <h2 id="es-path" class="public-subtitle"><t-icon name="education" aria-hidden="true" />{{ t('gsms.public.espace.parcours') }}</h2>
        <ul class="es-steps">
          <li>
            <t-icon :name="data.convention ? 'check-circle-filled' : 'circle'" :class="data.convention ? 'public-ok' : 'es-todo-icon'" aria-hidden="true" />
            <span>{{ data.convention ? t('gsms.public.espace.conventionSignee', { date: longDate(data.convention.signee_le) }) : t('gsms.public.espace.conventionAttente') }}</span>
          </li>
          <li>
            <t-icon :name="data.assiduite.suivies > 0 ? 'check-circle-filled' : 'circle'" :class="data.assiduite.suivies > 0 ? 'public-ok' : 'es-todo-icon'" aria-hidden="true" />
            <span>
              {{ t('gsms.public.espace.presence', { suivies: data.assiduite.suivies, prevues: data.assiduite.prevues }) }}<template
                v-if="data.assiduite.heures_suivies"> {{ t('gsms.public.espace.heures', { heures: data.assiduite.heures_suivies }) }}</template>
            </span>
          </li>
          <li v-for="q in data.questionnaires_repondus" :key="q.titre">
            <t-icon name="check-circle-filled" class="public-ok" aria-hidden="true" />
            <span>{{ t('gsms.public.espace.repondu', { titre: q.titre, date: longDate(q.repondu_le) }) }}</span>
          </li>
        </ul>
      </section>

      <section class="public-card" aria-labelledby="es-docs">
        <h2 id="es-docs" class="public-subtitle"><t-icon name="file" aria-hidden="true" />{{ t('gsms.public.espace.documents') }}</h2>
        <p v-if="!docs.length" class="public-text es-flush">{{ t('gsms.public.espace.aucunDocument') }}</p>
        <ul v-else class="es-list">
          <li v-for="d in docs" :key="d.href">
            <a :href="d.href" target="_blank" rel="noopener noreferrer" class="public-row">
              <span class="public-row__body">
                <span class="public-row__title">{{ d.titre }}</span>
                <span class="public-row__detail">
                  <template v-if="d.emis_le">{{ t('gsms.public.espace.emisLe', { date: longDate(d.emis_le) }) }} · </template>{{ t('gsms.public.espace.nouvelOnglet') }}
                </span>
              </span>
              <t-icon name="jump" aria-hidden="true" />
            </a>
          </li>
        </ul>
      </section>

      <section v-if="data.organisme.contact || data.organisme.referent_handicap" class="public-card" aria-labelledby="es-help">
        <h2 id="es-help" class="public-subtitle"><t-icon name="mail" aria-hidden="true" />{{ t('gsms.public.espace.question') }}</h2>
        <p v-if="data.organisme.contact" class="es-flush">
          {{ t('gsms.public.espace.ecrire') }}
          <a class="public-link" :href="`mailto:${data.organisme.contact}`">{{ data.organisme.contact }}</a>
        </p>
        <p v-if="data.organisme.referent_handicap" class="es-flush es-ref">
          {{ t('gsms.public.espace.referent', { nom: data.organisme.referent_handicap.nom }) }}
          <template v-if="data.organisme.referent_handicap.email">
            (<a class="public-link" :href="`mailto:${data.organisme.referent_handicap.email}`">{{ data.organisme.referent_handicap.email }}</a>)
          </template>
        </p>
      </section>
    </template>

    <template v-if="data" #footer>
      {{ t('gsms.public.espace.pied', { date: longDate(data.expire_le) }) }}
    </template>
  </PublicLinkPage>
</template>

<script setup lang="ts">
/**
 * Espace du stagiaire (`/espace/{jeton}`) : lien personnel, sans compte, en lecture seule.
 * GET /api/v1/public/espace/{jeton} ; tout ce qui s'affiche vient de l'API (journey/espace.py).
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import PublicLinkPage from '@/components/gsms/PublicLinkPage.vue'
import { getEspace, type Espace } from '@/api/gsms/public'
import { longDate, period, publicError, safeHref, type PublicError } from './publicLinks'

const { t } = useI18n()
const route = useRoute()

const data = ref<Espace | null>(null)
const loading = ref(true)
const loadError = ref<PublicError | null>(null)

async function load() {
  loading.value = true
  loadError.value = null
  try {
    data.value = await getEspace(String(route.params.jeton || ''))
  } catch (err) {
    loadError.value = publicError(err)
  } finally {
    loading.value = false
  }
}
onMounted(load)

const place = computed(() => {
  const f = data.value?.formation
  return f ? [f.lieu, f.salle].filter(Boolean).join(', ') : ''
})
// Liens construits par l'API ; on écarte seulement ce qui ne serait pas une adresse web.
const todo = computed(() => (data.value?.a_faire ?? [])
  .map((q) => ({ ...q, href: safeHref(q.lien) }))
  .filter((q): q is typeof q & { href: string } => q.href !== null))
const docs = computed(() => (data.value?.documents ?? [])
  .map((d) => ({ ...d, href: safeHref(d.lien) }))
  .filter((d): d is typeof d & { href: string } => d.href !== null))
// Demi-journées à venir : celles dont l'API ne donne pas encore la présence (jour pas encore passé).
const upcoming = computed(() => (data.value?.creneaux ?? []).filter((c) => c.present === null))
</script>

<style scoped>
.es-hero {
  border-top: 4px solid var(--td-brand-color);
}

.es-strong {
  color: var(--td-text-color-primary);
}

.es-facts {
  list-style: none;
  margin: 16px 0 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.es-facts li,
.es-steps li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
  overflow-wrap: anywhere;
}

.es-facts .t-icon {
  flex: none;
  margin-top: 3px;
  color: var(--td-brand-color);
}

.es-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.es-slots {
  list-style: none;
  margin: 0;
  padding: 0;
}

.es-slots li {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 4px 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--td-component-stroke);
}

.es-slots li:last-child {
  border-bottom: 0;
}

.es-day {
  display: inline-block;
  font-weight: 700;
}

.es-day::first-letter {
  text-transform: uppercase;
}

.es-steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}

.es-steps .t-icon {
  flex: none;
  margin-top: 3px;
  font-size: var(--app-text-2xl);
}

.es-todo-icon {
  color: var(--td-text-color-secondary);
}

.es-flush {
  margin: 0;
}

.es-ref {
  margin-top: 8px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
