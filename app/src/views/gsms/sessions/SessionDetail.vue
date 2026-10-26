<template>
  <GsmsRecordSheet :title="detail?.session.reference || t('gsms.sessions.session')" icon="calendar-1" back="/platform/sessions"
    :back-label="t('gsms.sessions.titre')" :subtitle="detail?.session.program_title || ''" :meta="meta" :image="detail?.session.program_image_url"
    :ready="!!detail" :loading="loading" :error="error" :tabs="tabs" :tab="tab" @update:tab="(v) => (tab = v)" @retry="load">
    <template v-if="detail" #status><GsmsStatusTag :code="detail.session.status" /></template>
    <template v-if="detail" #before><GsmsRefusal v-if="actionError" :error="actionError" inline /></template>
    <template v-if="detail" #side>
      <section class="side-section">
        <h3>{{ t('gsms.sessions.infos') }}</h3>
        <dl>
          <div><dt>{{ t('gsms.sessions.colDates') }}</dt><dd>{{ fmtDate(detail.session.start_date) }} → {{ fmtDate(detail.session.end_date) }}</dd></div>
          <div><dt>{{ t('gsms.sessions.colLieu') }}</dt><dd>{{ [detail.session.location, detail.session.room].filter(Boolean).join(' · ') || '—' }}</dd></div>
          <div><dt>{{ t('gsms.sessions.colFormateur') }}</dt><dd>
            <span v-if="detail.session.trainer_name" class="side-person"><GsmsPersonAvatar :name="detail.session.trainer_name" :photo="detail.session.trainer_photo_url" :size="24" />{{ detail.session.trainer_name }}</span>
            <template v-else>—</template></dd></div>
          <div><dt>{{ t('gsms.sessions.colInscrits') }}</dt><dd>{{ detail.session.learners_count }}<template v-if="detail.session.capacity"> / {{ t('gsms.sessions.nPlaces', { n: detail.session.capacity }) }}</template></dd></div>
          <div v-if="detail.session.cancel_reason"><dt>{{ t('gsms.sessions.motifAnnulation') }}</dt><dd>{{ detail.session.cancel_reason }}</dd></div>
        </dl>
      </section>
      <section class="side-section">
        <h3>{{ t('gsms.sessions.cycle') }}</h3>
        <div class="lifecycle">
          <GsmsActionGate v-for="a in TRANSITIONS" :key="a" :decision="detail.capabilities[a]" show-reason
            :theme="a === 'cancel' ? 'danger' : 'primary'" :variant="a === 'cancel' ? 'outline' : 'base'" :pending="busy === a" @run="transition(a)">
            {{ t(`gsms.sessions.transitions.${a}`) }}
          </GsmsActionGate>
          <GsmsActionGate :decision="detail.capabilities.delete" show-reason theme="danger" variant="outline" :pending="busy === 'delete'" @run="remove">
            {{ t('gsms.sessions.supprimer') }}
          </GsmsActionGate>
        </div>
      </section>
    </template>

    <template v-if="detail">
      <!-- Inscriptions -->
      <section v-if="tab === 'inscriptions'" class="panel">
        <div class="panel-bar">
          <h3 class="title">{{ t('gsms.sessions.inscriptions') }}</h3>
          <GsmsActionGate :decision="detail.capabilities.enroll" @run="openEnroll">{{ t('gsms.sessions.inscrire') }}</GsmsActionGate>
        </div>
        <p v-if="!detail.inscriptions.length" class="muted">{{ t('gsms.sessions.aucuneInscription') }}</p>
        <ul v-else class="rows">
          <li v-for="e in detail.inscriptions" :key="e.id">
            <router-link :to="`/platform/sessions/${id}/inscriptions/${e.id}`" class="row">
              <GsmsPersonAvatar :name="e.stagiaire" :photo="e.photo_url" />
              <span class="row-main">{{ e.stagiaire }}</span>
              <span class="muted">{{ e.financement || t('gsms.sessions.financementNonRenseigne') }}</span>
              <GsmsStatusTag :code="e.statut" />
              <t-icon name="chevron-right" class="row-chevron" />
            </router-link>
          </li>
        </ul>
      </section>

      <!-- Parcours : stagiaires × étapes, états calculés par l'API -->
      <section v-else-if="tab === 'parcours'" class="panel">
        <GsmsRefusal v-if="journeyError" :error="journeyError" inline />
        <t-skeleton v-else-if="!journey" animation="gradient" :row-col="[{ width: '100%' }, { width: '100%' }]" />
        <p v-else-if="!journey.stagiaires.length" class="muted">{{ t('gsms.sessions.aucuneInscription') }}</p>
        <ul v-else class="rows">
          <li v-for="r in journey.stagiaires" :key="r.inscription">
            <router-link :to="`/platform/sessions/${id}/inscriptions/${r.inscription}`" class="row">
              <GsmsPersonAvatar :name="r.stagiaire" :photo="r.stagiaire_photo_url" />
              <span class="row-main">{{ r.stagiaire }}</span>
              <span class="steps">
                <GsmsStepMark v-for="s in journey.etapes" :key="s" :state="r.etats[s]" :label="stepLabel(s)" />
              </span>
              <GsmsStatusTag :code="r.statut" />
            </router-link>
          </li>
        </ul>
        <p v-if="journey?.etapes.length" class="muted legend">{{ journey.etapes.map(stepLabel).join(' · ') }}</p>
      </section>

      <section v-else-if="tab === 'emargement'"><AttendanceSheetView :session-id="id" /></section>

      <section v-else class="panel">
        <GsmsRefusal v-if="activityError" :error="activityError" inline />
        <t-skeleton v-else-if="!activity" animation="gradient" :row-col="[{ width: '100%' }, { width: '100%' }]" />
        <p v-else-if="!activity.length" class="muted">{{ t('gsms.commun.aucunHistorique') }}</p>
        <ul v-else class="timeline">
          <li v-for="a in activity" :key="String(a.id)">
            <span class="tl-date">{{ fmtDateTime(String(a.le ?? '')) }}</span>
            <span>{{ a.action }}<template v-if="a.stagiaire"> · {{ a.stagiaire }}</template></span>
            <span class="muted">{{ a.qui }}</span>
          </li>
        </ul>
      </section>
    </template>
  </GsmsRecordSheet>

  <ActionDialog v-model:visible="cancelVisible" :title="t('gsms.sessions.transitions.cancel')" :confirm-label="t('gsms.sessions.transitions.cancel')" danger
    :consequence="t('gsms.sessions.annulationConsequence')" :confirm-text="detail?.session.reference || ''"
    :fields="['motif']" :run="(v) => sessionTransition(id, 'cancel', v.motif)" @done="load" />
  <ActionDialog v-model:visible="enrollVisible" :title="t('gsms.sessions.inscrire')" :confirm-label="t('gsms.sessions.inscrire')"
    :fields="[{ name: 'learner_id', label: t('gsms.sessions.stagiaire'), type: 'select', options: learnerOptions }]"
    :intro="t('gsms.sessions.inscrireAide')" :run="(v) => enrollLearner(id, v.learner_id)" @done="load">
    <GsmsRefusal v-if="learnersError" :error="learnersError" inline />
  </ActionDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { MessagePlugin } from 'tdesign-vue-next'
import { confirmCritical } from '@/components/gsms/critical'
import GsmsRecordSheet from '@/components/gsms/GsmsRecordSheet.vue'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import GsmsActionGate from '@/components/gsms/GsmsActionGate.vue'
import GsmsStepMark from '@/components/gsms/GsmsStepMark.vue'
import GsmsPersonAvatar from '@/components/gsms/GsmsPersonAvatar.vue'
import ActionDialog from '@/components/gsms/ActionDialog.vue'
import AttendanceSheetView from '@/components/gsms/AttendanceSheetView.vue'
import {
  deleteSession, enrollLearner, getSession, getSessionActivity, listLearners, sessionTransition,
  type ActivityRow, type LearnerRow, type SessionDetail,
} from '@/api/gsms/sessions'
import { getSessionJourney, type SessionJourney } from '@/api/gsms/journey'
import { fmtDate, fmtDateTime, stepLabel } from '@/components/gsms/format'

// Puces de l'en-tête : dates, lieu, formateur (valeurs de l'API, telles quelles).
const meta = computed(() => {
  const s = detail.value?.session
  if (!s) return []
  return [
    { icon: 'calendar', label: `${fmtDate(s.start_date)} → ${fmtDate(s.end_date)}`, title: t('gsms.sessions.colDates') },
    ...(s.location ? [{ icon: 'location', label: s.location, title: t('gsms.sessions.colLieu') }] : []),
    ...(s.trainer_name ? [{ icon: 'user-talk', label: s.trainer_name, title: t('gsms.sessions.colFormateur') }] : []),
  ]
})
const TRANSITIONS = ['confirm', 'start', 'finish', 'close', 'cancel'] as const

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const id = computed(() => String(route.params.sessionId || ''))

const detail = ref<SessionDetail | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const actionError = ref<unknown>(null)
const busy = ref('')
const TABS = ['inscriptions', 'parcours', 'emargement', 'activite']
const tab = ref(TABS.includes(String(route.query.onglet)) ? String(route.query.onglet) : 'inscriptions')
const journey = ref<SessionJourney | null>(null)
const journeyError = ref<unknown>(null)
const activity = ref<ActivityRow[] | null>(null)
const activityError = ref<unknown>(null)
const cancelVisible = ref(false)
const enrollVisible = ref(false)
const learners = ref<LearnerRow[]>([])
const learnersError = ref<unknown>(null)

const tabs = computed(() => [
  { value: 'inscriptions', label: t('gsms.sessions.inscriptions'), count: detail.value?.inscriptions.length },
  { value: 'parcours', label: t('gsms.sessions.parcours') },
  { value: 'emargement', label: t('gsms.emargement.titre') },
  { value: 'activite', label: t('gsms.sessions.activite') },
])
const learnerOptions = computed(() => learners.value.map((l) => ({ value: l.id, label: `${l.last_name} ${l.first_name}` })))

async function load() {
  const sid = id.value
  if (!sid) return
  loading.value = true
  error.value = null
  try {
    const res = await getSession(sid)
    if (sid === id.value) detail.value = res
  } catch (e) {
    if (sid === id.value) { error.value = e; detail.value = null }
  } finally {
    loading.value = false
  }
}

// Une réponse arrivée après un changement de session est ignorée (elle concerne l'ancienne session).
async function loadTab(v: string) {
  const sid = id.value
  if (v === 'parcours') {
    journeyError.value = null
    try {
      const res = await getSessionJourney(sid)
      if (sid === id.value) journey.value = res
    } catch (e) { if (sid === id.value) journeyError.value = e }
  } else if (v === 'activite') {
    activityError.value = null
    try {
      const res = await getSessionActivity(sid)
      if (sid === id.value) activity.value = res
    } catch (e) { if (sid === id.value) activityError.value = e }
  }
}

watch(id, () => { actionError.value = null; journey.value = null; activity.value = null; load(); loadTab(tab.value) }, { immediate: true })
watch(tab, (v) => {
  router.replace({ query: { ...route.query, onglet: v } })
  loadTab(v)
})

async function transition(action: string) {
  if (action === 'cancel') {
    cancelVisible.value = true
    return
  }
  if (action === 'close') {
    // Clôture : la session est ensuite verrouillée (états verrouillés de l'API) ; confirmation critique.
    const done = await confirmCritical({
      title: t('gsms.sessions.transitions.close'), consequence: t('gsms.sessions.clotureConsequence'),
      confirmLabel: t('gsms.sessions.transitions.close'), run: () => sessionTransition(id.value, 'close').then(() => true),
    })
    if (done) { actionError.value = null; MessagePlugin.success(t('gsms.commun.misAJour')); await load() }
    return
  }
  busy.value = action
  actionError.value = null
  try {
    await sessionTransition(id.value, action)
    MessagePlugin.success(t('gsms.commun.misAJour'))
    await load()
  } catch (e) {
    actionError.value = e
  } finally {
    busy.value = ''
  }
}

async function remove() {
  const done = await confirmCritical({
    title: t('gsms.sessions.supprimer'), consequence: t('gsms.commun.suppressionDefinitive'), confirmLabel: t('gsms.commun.supprimer'),
    confirmText: detail.value?.session.reference || undefined, run: () => deleteSession(id.value).then(() => true),
  })
  if (done) router.push('/platform/sessions')
}

async function openEnroll() {
  enrollVisible.value = true
  learnersError.value = null
  try {
    learners.value = await listLearners()
  } catch (e) {
    learners.value = []
    learnersError.value = e
  }
}
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.side-person { display: inline-flex; align-items: center; gap: 8px; }
.side-section { .gsms-side-section(); }
.panel { .gsms-panel(); }
.title { .gsms-panel-title(); margin: 0; }
.panel-bar { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.muted { .gsms-muted(); }
.legend { margin-top: 8px; }
.lifecycle { display: flex; flex-direction: column; gap: 12px; }
.rows { .gsms-rows(); }
.row { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 12px; padding: 10px 14px; color: inherit; text-decoration: none;
  &:hover { background: var(--td-bg-color-container-hover); }
  &:focus-visible { outline: 2px solid var(--td-brand-color); outline-offset: -2px; } }
.row-main { flex: 1 1 160px; min-width: 0; color: var(--td-text-color-primary); font-size: var(--app-text-md); font-weight: 500; overflow-wrap: anywhere; }
.row-chevron { color: var(--td-text-color-placeholder); }
.steps { display: inline-flex; flex-wrap: wrap; gap: 4px; }
.timeline { .gsms-timeline(); }
</style>
