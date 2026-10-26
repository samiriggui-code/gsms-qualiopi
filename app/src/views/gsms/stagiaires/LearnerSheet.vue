<template>
  <GsmsRecordSheet :title="learner?.full_name || t('gsms.stagiaires.fiche')" icon="user" back="/platform/stagiaires"
    :back-label="t('gsms.stagiaires.titre')" :subtitle="learner ? t('gsms.stagiaires.nInscriptions', { n: learner.enrollments }, learner.enrollments) : ''"
    :ready="!!learner" :loading="loading" :error="error" :tabs="tabs" :tab="current" @update:tab="(v) => (tab = v)" @retry="load">
    <template v-if="learner" #side>
      <section class="side-section">
        <h3 class="side-head"><GsmsPersonAvatar :name="learner.full_name" :size="40" />{{ t('gsms.parcours.contact') }}</h3>
        <dl>
          <div><dt>{{ t('gsms.parcours.email') }}</dt><dd>{{ learner.email || '—' }}</dd></div>
          <div><dt>{{ t('gsms.parcours.telephone') }}</dt><dd>{{ learner.phone || '—' }}</dd></div>
          <div><dt>{{ t('gsms.parcours.entreprise') }}</dt><dd>{{ learner.company_name || '—' }}</dd></div>
          <div><dt>{{ t('gsms.stagiaires.creeLe') }}</dt><dd>{{ fmtDate(learner.created_at) }}</dd></div>
        </dl>
      </section>
    </template>

    <template v-if="learner">
      <GsmsRefusal v-if="journeysError" :error="journeysError" inline />
      <div v-else-if="!journeys" class="panel"><t-skeleton animation="gradient" :row-col="[{ width: '60%' }, { width: '100%' }, { width: '100%' }]" /></div>
      <section v-else-if="!journeys.length" class="panel"><p class="muted">{{ t('gsms.stagiaires.aucuneInscription') }}</p></section>

      <!-- Parcours : une inscription par session, états des étapes décidés par l'API -->
      <template v-else-if="current === 'parcours'">
        <section v-for="j in journeys" :key="j.inscription.id" class="panel">
          <div class="panel-bar">
            <div class="enrollment-head">
              <router-link :to="`/platform/sessions/${j.inscription.session.id}`" class="title link">{{ j.inscription.session.reference }}</router-link>
              <span class="muted">{{ j.inscription.session.formation_titre }} · {{ fmtDate(j.inscription.session.debut) }} → {{ fmtDate(j.inscription.session.fin) }}</span>
            </div>
            <GsmsStatusTag :code="j.inscription.statut" />
          </div>
          <GsmsRefusal v-if="j.error" :error="j.error" inline />
          <template v-else-if="j.journey">
            <div class="steps">
              <span v-for="s in j.journey.etapes" :key="s.etape" class="step"><GsmsStepMark :state="s.etat" :label="stepLabel(s.etape)" />{{ stepLabel(s.etape) }}</span>
            </div>
            <p class="muted">
              {{ t('gsms.parcours.financement') }} : {{ j.journey.contact.financement || t('gsms.sessions.financementNonRenseigne') }} ·
              {{ t('gsms.parcours.assiduite') }} : {{ t('gsms.parcours.demiJournees', { n: j.journey.assiduite.suivies, total: j.journey.assiduite.prevues }) }}
            </p>
            <router-link :to="`/platform/sessions/${j.inscription.session.id}/inscriptions/${j.inscription.id}`" class="link">
              {{ t('gsms.stagiaires.ouvrirParcours') }}<t-icon name="chevron-right" size="14px" />
            </router-link>
          </template>
          <t-skeleton v-else animation="gradient" :row-col="[{ width: '100%' }]" />
        </section>
      </template>

      <!-- Documents émis par le moteur (convocation, attestation…) -->
      <section v-else-if="current === 'documents'" class="panel">
        <GsmsRefusal v-if="actionError" :error="actionError" inline />
        <p v-if="!documents.length" class="muted">{{ t('gsms.stagiaires.aucunDocument') }}</p>
        <ul v-else class="rows">
          <li v-for="d in documents" :key="d.doc.id" class="row">
            <span class="row-main">{{ d.doc.titre }}</span>
            <span class="muted">{{ d.session }} · v{{ d.doc.version }} · {{ fmtDateTime(d.doc.emis_le) }}</span>
            <GsmsStatusTag :code="d.doc.statut" />
            <t-button size="small" variant="text" theme="primary" :loading="busy === d.doc.id" @click="download(d.enrollment, d.doc.id, d.doc.titre)">
              <t-icon name="download" />{{ t('gsms.commun.telecharger') }}
            </t-button>
          </li>
        </ul>
      </section>

      <!-- Financement (module actif) : dossier de chaque inscription -->
      <template v-else>
        <section v-for="j in journeys" :key="j.inscription.id" class="panel">
          <h3 class="title">{{ j.inscription.session.reference }}</h3>
          <t-skeleton v-if="j.funding === undefined" animation="gradient" :row-col="[{ width: '100%' }]" />
          <p v-else-if="j.funding === null" class="muted">{{ t('gsms.stagiaires.aucunFinancement') }}</p>
          <GsmsRefusal v-else-if="'error' in j.funding" :error="j.funding.error" inline />
          <template v-else>
            <dl class="kv">
              <div><dt>{{ t('gsms.stagiaires.statutFinancement') }}</dt><dd><GsmsStatusTag :code="j.funding.case.statut" /></dd></div>
              <div><dt>{{ t('gsms.stagiaires.cout') }}</dt><dd>{{ euros(j.funding.case.cout) }}</dd></div>
              <div><dt>{{ t('gsms.stagiaires.accorde') }}</dt><dd>{{ euros(j.funding.case.accorde) }}</dd></div>
              <div><dt>{{ t('gsms.stagiaires.resteAFinancer') }}</dt><dd>{{ euros(j.funding.case.reste_a_financer) }}</dd></div>
            </dl>
            <ul v-if="j.funding.case.sources.length" class="rows sources">
              <li v-for="s in j.funding.case.sources" :key="s.id" class="row">
                <span class="row-main">{{ s.libelle }}<template v-if="s.financeur"> · {{ s.financeur }}</template></span>
                <span class="muted">{{ t('gsms.stagiaires.montants', { demande: euros(s.montants.demande), accorde: euros(s.montants.accorde) }) }}</span>
                <GsmsStatusTag :code="s.etat" />
              </li>
            </ul>
          </template>
        </section>
      </template>
    </template>
  </GsmsRecordSheet>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import GsmsRecordSheet from '@/components/gsms/GsmsRecordSheet.vue'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import GsmsStepMark from '@/components/gsms/GsmsStepMark.vue'
import GsmsPersonAvatar from '@/components/gsms/GsmsPersonAvatar.vue'
import { getLearner, listLearnerInscriptions, type LearnerInscription, type LearnerRecord } from '@/api/gsms/sessions'
import { getLearnerJourney, journeyDocumentPath, type JourneyDocument, type LearnerJourney } from '@/api/gsms/journey'
import { listFundingCases, type FundingCase } from '@/api/gsms/funding'
import { downloadFile } from '@/api/gsms/files'
import { useGsmsAccessStore } from '@/stores/gsmsAccess'
import { fmtDate, fmtDateTime, stepLabel } from '@/components/gsms/format'
import { euros } from '@/views/gsms/formations/display'

interface EnrollmentView {
  inscription: LearnerInscription
  journey: LearnerJourney | null
  error: unknown
  /** undefined : en cours ; null : aucun dossier ; sinon le dossier ou le refus. */
  funding?: { case: FundingCase } | { error: unknown } | null
}

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const access = useGsmsAccessStore()
const id = computed(() => String(route.params.learnerId || ''))
const learner = ref<LearnerRecord | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const journeys = ref<EnrollmentView[] | null>(null)
const journeysError = ref<unknown>(null)
const actionError = ref<unknown>(null)
const busy = ref('')

// Onglet Financement : seulement si le module est actif et lisible pour ce compte (GET /bootstrap).
const showFunding = computed(() => access.hasFeature('funding') && access.can('funding.read'))
const TABS = computed(() => ['parcours', 'documents', ...(showFunding.value ? ['financement'] : [])])
const tab = ref(['parcours', 'documents', 'financement'].includes(String(route.query.onglet)) ? String(route.query.onglet) : 'parcours')
const current = computed(() => (TABS.value.includes(tab.value) ? tab.value : 'parcours'))
const documents = computed(() => (journeys.value ?? []).flatMap((j) =>
  (j.journey?.documents ?? []).map((doc: JourneyDocument) => ({ doc, enrollment: j.inscription.id, session: j.inscription.session.reference }))))
const tabs = computed(() => [
  { value: 'parcours', label: t('gsms.sessions.parcours'), count: journeys.value?.length },
  { value: 'documents', label: t('gsms.stagiaires.documents'), count: journeys.value ? documents.value.length : undefined },
  ...(showFunding.value ? [{ value: 'financement', label: t('gsms.parcours.financement') }] : []),
])

async function load() {
  const lid = id.value
  if (!lid) return
  loading.value = true
  error.value = null
  journeys.value = null
  journeysError.value = null
  try {
    const res = await getLearner(lid)
    if (lid !== id.value) return
    learner.value = res
  } catch (e) {
    if (lid === id.value) { error.value = e; learner.value = null }
    return
  } finally {
    loading.value = false
  }
  try {
    // Inscriptions du stagiaire, session la plus récente d'abord (GET /learners/{id}/inscriptions).
    const list = await listLearnerInscriptions(lid)
    if (lid !== id.value) return
    journeys.value = list.map((inscription) => ({ inscription, journey: null, error: null }))
  } catch (e) {
    if (lid === id.value) journeysError.value = e
    return
  }
  await Promise.all((journeys.value ?? []).map(async (j) => {
    try { j.journey = await getLearnerJourney(j.inscription.id) } catch (e) { j.error = e }
  }))
  if (showFunding.value) loadFunding()
}

async function loadFunding() {
  const list = journeys.value ?? []
  try {
    const cases = await listFundingCases()
    for (const j of list) {
      const found = cases.find((c) => c.inscription_id === j.inscription.id)
      j.funding = found ? { case: found } : null
    }
  } catch (e) {
    for (const j of list) j.funding = { error: e }
  }
}

watch(id, () => { actionError.value = null; load() }, { immediate: true })
watch(tab, (v) => router.replace({ query: { ...route.query, onglet: v } }))
watch(showFunding, (v) => { if (v && journeys.value && journeys.value.some((j) => j.funding === undefined)) loadFunding() })

async function download(enrollmentId: string, documentId: string, name: string) {
  busy.value = documentId
  actionError.value = null
  try {
    await downloadFile(journeyDocumentPath(enrollmentId, documentId), `${name}.html`)
  } catch (e) {
    actionError.value = e
  } finally {
    busy.value = ''
  }
}
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.side-section { .gsms-side-section(); }
.side-head { display: flex; align-items: center; gap: 10px; }
.panel { .gsms-panel(); display: flex; flex-direction: column; gap: 10px; }
.panel-bar { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
.enrollment-head { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.title { .gsms-panel-title(); margin: 0; }
.muted { .gsms-muted(); margin: 0; }
.kv { .gsms-kv(); }
.link { display: inline-flex; align-items: center; gap: 4px; color: var(--td-brand-color); font-size: var(--app-text-sm); text-decoration: none; &:hover { text-decoration: underline; } }
.title.link { font-size: var(--app-text-md); }
.steps { display: flex; flex-wrap: wrap; gap: 6px 14px; }
.step { display: inline-flex; align-items: center; gap: 4px; font-size: var(--app-text-sm); color: var(--td-text-color-secondary); }
.rows { .gsms-rows(); }
.row { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 12px; padding: 10px 14px; }
.row-main { flex: 1 1 160px; min-width: 0; color: var(--td-text-color-primary); font-size: var(--app-text-md); font-weight: 500; overflow-wrap: anywhere; }
.sources { margin-top: 4px; }
</style>
