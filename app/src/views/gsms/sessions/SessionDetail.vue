<template>
  <GsmsPage :title="detail?.session.reference || 'Session'" icon="calendar-1" back="/platform/sessions" back-label="Sessions"
    :subtitle="detail?.session.program_title || ''">
    <template v-if="detail" #title-extra><GsmsTag :code="detail.session.status" /></template>
    <template v-if="detail" #toolbar>
      <div class="tabs" role="tablist" aria-label="Rubriques de la session">
        <button v-for="t in tabs" :key="t.value" type="button" role="tab" :aria-selected="tab === t.value" @click="tab = t.value">
          {{ t.label }}<span v-if="t.count !== undefined" class="tab-count">{{ t.count }}</span>
        </button>
      </div>
    </template>

    <div v-if="loading && !detail" class="panel"><t-skeleton animation="gradient" :row-col="[{ width: '50%' }, { width: '100%' }, { width: '80%' }]" /></div>
    <GsmsRefusal v-else-if="error" :error="error"><t-button size="small" variant="outline" @click="load">Réessayer</t-button></GsmsRefusal>
    <template v-else-if="detail">
      <dl class="kv panel">
        <div><dt>Dates</dt><dd>{{ fmtDate(detail.session.start_date) }} → {{ fmtDate(detail.session.end_date) }}</dd></div>
        <div><dt>Lieu</dt><dd>{{ [detail.session.location, detail.session.room].filter(Boolean).join(' · ') || '—' }}</dd></div>
        <div><dt>Formateur</dt><dd>{{ detail.session.trainer_name || '—' }}</dd></div>
        <div><dt>Inscrits</dt><dd>{{ detail.session.learners_count }}<template v-if="detail.session.capacity"> / {{ detail.session.capacity }} places</template></dd></div>
        <div v-if="detail.session.cancel_reason"><dt>Motif d'annulation</dt><dd>{{ detail.session.cancel_reason }}</dd></div>
      </dl>

      <GsmsRefusal v-if="actionError" :error="actionError" inline />

      <!-- Inscriptions -->
      <section v-if="tab === 'inscriptions'">
        <div class="section-bar">
          <h3 class="section-title">Inscriptions</h3>
          <CapabilityAction v-if="detail.capabilities.enroll" :capability="detail.capabilities.enroll" label="Inscrire un stagiaire"
            @run="openEnroll" />
        </div>
        <EmptyState v-if="!detail.inscriptions.length" icon="user-add" title="Aucune inscription" compact />
        <ul v-else class="rows">
          <li v-for="e in detail.inscriptions" :key="e.id">
            <router-link :to="`/platform/parcours/${e.id}`" class="row">
              <span class="row-main">{{ e.stagiaire }}</span>
              <span class="muted">{{ e.financement || 'Financement non renseigné' }}</span>
              <GsmsTag :code="e.statut" />
              <t-icon name="chevron-right" class="row-chevron" />
            </router-link>
          </li>
        </ul>
      </section>

      <!-- Cycle de vie -->
      <section v-else-if="tab === 'cycle'">
        <h3 class="section-title">Cycle de vie</h3>
        <p class="muted intro">Chaque bouton suit la décision de l'API ; un refus affiche son motif.</p>
        <ul class="lifecycle">
          <li v-for="t in TRANSITIONS" :key="t.action" v-show="detail.capabilities[t.action]">
            <CapabilityAction v-if="detail.capabilities[t.action]" :capability="detail.capabilities[t.action]" :label="t.label"
              :theme="t.action === 'cancel' ? 'danger' : 'primary'" :variant="t.action === 'cancel' ? 'outline' : 'base'"
              :loading="busy === t.action" @run="transition(t.action)" />
          </li>
          <li v-if="detail.capabilities.delete">
            <CapabilityAction :capability="detail.capabilities.delete" label="Supprimer la session" theme="danger" variant="outline"
              :loading="busy === 'delete'" @run="remove" />
          </li>
        </ul>
      </section>

      <section v-else-if="tab === 'parcours'">
        <h3 class="section-title">Parcours des stagiaires</h3>
        <SessionJourneyMatrix :session-id="id" />
      </section>

      <section v-else-if="tab === 'emargement'">
        <h3 class="section-title">Émargement</h3>
        <AttendanceSheetView :session-id="id" />
      </section>

      <section v-else-if="tab === 'activite'">
        <h3 class="section-title">Activité</h3>
        <GsmsRefusal v-if="activityError" :error="activityError" />
        <EmptyState v-else-if="activity && !activity.length" icon="history" title="Aucune activité enregistrée" compact />
        <ul v-else-if="activity" class="rows">
          <li v-for="a in activity" :key="String(a.id)" class="row row--static">
            <span class="row-main">{{ a.action }}<template v-if="a.stagiaire"> · {{ a.stagiaire }}</template></span>
            <span class="muted">{{ a.qui }} · {{ fmtDateTime(String(a.le || '')) }}</span>
          </li>
        </ul>
      </section>
    </template>

    <ActionDialog v-model:visible="cancelVisible" title="Annuler la session" confirm-label="Annuler la session" danger
      :fields="[{ name: 'motif', label: 'Motif de l\'annulation' }]" :run="(v) => sessionTransition(id, 'cancel', v.motif)" @done="load" />
    <ActionDialog v-model:visible="enrollVisible" title="Inscrire un stagiaire" confirm-label="Inscrire"
      :fields="[{ name: 'learner_id', label: 'Stagiaire', type: 'select', options: learnerOptions }]"
      :intro="learnersError ? '' : 'Les conditions (inscriptions ouvertes, places) sont vérifiées par l\'API.'"
      :run="(v) => enrollLearner(id, v.learner_id)" @done="load">
      <GsmsRefusal v-if="learnersError" :error="learnersError" inline />
    </ActionDialog>
  </GsmsPage>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next'
import EmptyState from '@/components/EmptyState.vue'
import GsmsPage from './components/GsmsPage.vue'
import GsmsRefusal from './components/GsmsRefusal.vue'
import GsmsTag from './components/GsmsTag.vue'
import CapabilityAction from './components/CapabilityAction.vue'
import ActionDialog from './components/ActionDialog.vue'
import SessionJourneyMatrix from './components/SessionJourneyMatrix.vue'
import AttendanceSheetView from './components/AttendanceSheetView.vue'
import {
  deleteSession, enrollLearner, getSession, getSessionActivity, listLearners, sessionTransition,
  type ActivityRow, type LearnerRow, type SessionDetail,
} from '@/api/gsms/sessions'
import { fmtDate, fmtDateTime } from './format'

const route = useRoute()
const router = useRouter()
const id = computed(() => String(route.params.sessionId || ''))

const TRANSITIONS = [
  { action: 'confirm', label: 'Confirmer la session' },
  { action: 'start', label: 'Démarrer la session' },
  { action: 'finish', label: 'Terminer la session' },
  { action: 'close', label: 'Clôturer la session' },
  { action: 'cancel', label: 'Annuler la session' },
]

const detail = ref<SessionDetail | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const actionError = ref<unknown>(null)
const busy = ref('')
const tab = ref(typeof route.query.onglet === 'string' ? route.query.onglet : 'inscriptions')
const activity = ref<ActivityRow[] | null>(null)
const activityError = ref<unknown>(null)
const cancelVisible = ref(false)
const enrollVisible = ref(false)
const learners = ref<LearnerRow[]>([])
const learnersError = ref<unknown>(null)

const tabs = computed(() => [
  { value: 'inscriptions', label: 'Inscriptions', count: detail.value?.inscriptions.length },
  { value: 'cycle', label: 'Cycle de vie' },
  { value: 'parcours', label: 'Parcours' },
  { value: 'emargement', label: 'Émargement' },
  { value: 'activite', label: 'Activité' },
])

const learnerOptions = computed(() => learners.value.map((l) => ({ value: l.id, label: `${l.last_name} ${l.first_name}` })))

async function load() {
  if (!id.value) return
  loading.value = true
  error.value = null
  try {
    detail.value = await getSession(id.value)
  } catch (e) {
    error.value = e
    detail.value = null
  } finally {
    loading.value = false
  }
}

async function loadActivity() {
  activityError.value = null
  try {
    activity.value = await getSessionActivity(id.value)
  } catch (e) {
    activityError.value = e
  }
}

watch(id, () => { actionError.value = null; activity.value = null; load() }, { immediate: true })
watch(tab, (t) => {
  router.replace({ query: { ...route.query, onglet: t } })
  if (t === 'activite' && !activity.value) loadActivity()
}, { immediate: true })

async function transition(action: string) {
  if (action === 'cancel') {
    cancelVisible.value = true
    return
  }
  busy.value = action
  actionError.value = null
  try {
    await sessionTransition(id.value, action)
    MessagePlugin.success('Session mise à jour')
    await load()
  } catch (e) {
    actionError.value = e
  } finally {
    busy.value = ''
  }
}

function remove() {
  const dlg = DialogPlugin.confirm({
    header: 'Supprimer la session',
    body: `La session ${detail.value?.session.reference ?? ''} sera supprimée définitivement.`,
    theme: 'danger',
    confirmBtn: { content: 'Supprimer', theme: 'danger' },
    cancelBtn: 'Annuler',
    onConfirm: async () => {
      dlg.destroy()
      busy.value = 'delete'
      try {
        await deleteSession(id.value)
        MessagePlugin.success('Session supprimée')
        router.push('/platform/sessions')
      } catch (e) {
        actionError.value = e
      } finally {
        busy.value = ''
      }
    },
    onClose: () => dlg.destroy(),
  })
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
@import (reference) './gsms-list.less';
.tabs { .gsms-tabs(); }
.panel { .gsms-panel(); margin-bottom: 16px; }
.kv { .gsms-kv(); }
.muted { .gsms-muted(); }
.intro { margin: -4px 0 12px; }
.section-bar { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; .section-title { margin: 0; } }
.section-title { .gsms-panel-title(); }
.rows { list-style: none; margin: 0; padding: 0; border: 1px solid var(--td-component-stroke); border-radius: var(--app-radius-md); background: var(--td-bg-color-container); overflow: hidden; }
.rows > li + li { border-top: 1px solid var(--td-component-stroke); }
.row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 12px;
  padding: 10px 14px;
  color: inherit;
  text-decoration: none;
  &:hover { background: var(--td-bg-color-container-hover); }
  &:focus-visible { outline: 2px solid var(--td-brand-color); outline-offset: -2px; }
  &--static:hover { background: transparent; }
}
.row--static { flex-direction: column; align-items: flex-start; }
.row-main { flex: 1 1 200px; min-width: 0; color: var(--td-text-color-primary); font-size: var(--app-text-md); font-weight: 500; overflow-wrap: anywhere; }
.row-chevron { color: var(--td-text-color-placeholder); }
.lifecycle { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr)); }
.lifecycle > li { .gsms-panel(); }
</style>
