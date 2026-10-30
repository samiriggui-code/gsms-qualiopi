<template>
  <GsmsRecordSheet :title="learner?.full_name || t('gsms.stagiaires.fiche')" icon="user" back="/platform/stagiaires"
    :avatar-name="learner?.full_name" :avatar-photo="learner?.photo_url"
    :back-label="t('gsms.stagiaires.titre')" :subtitle="learner ? t('gsms.stagiaires.nInscriptions', { n: learner.enrollments }, learner.enrollments) : ''"
    :ready="!!learner" :loading="loading" :error="error" :tabs="tabs" :tab="current" @update:tab="(v) => (tab = v)" @retry="load">
    <template v-if="learner && canWrite" #actions>
      <t-button size="small" variant="outline" @click="openEdit"><template #icon><t-icon name="edit-1" /></template>{{ t('gsms.commun.modifier') }}</t-button>
    </template>
    <template v-if="learner" #side>
      <section class="side-section">
        <h3 class="side-head"><GsmsPersonAvatar :name="learner.full_name" :photo="learner.photo_url" :size="40" />{{ t('gsms.parcours.contact') }}</h3>
        <dl>
          <div><dt>{{ t('gsms.parcours.email') }}</dt><dd>{{ learner.email || '—' }}</dd></div>
          <div><dt>{{ t('gsms.parcours.telephone') }}</dt><dd>{{ learner.phone || '—' }}</dd></div>
          <div><dt>{{ t('gsms.parcours.entreprise') }}</dt><dd>{{ learner.company_name || '—' }}</dd></div>
          <div><dt>{{ t('gsms.stagiaires.creeLe') }}</dt><dd>{{ fmtDate(learner.created_at) }}</dd></div>
        </dl>
      </section>
      <section v-if="trainers.length" class="side-section">
        <h3>{{ t('gsms.ficheEnrichie.formateurs') }}</h3>
        <ul class="people">
          <li v-for="f in trainers" :key="f.id">
            <router-link :to="`/platform/formateurs/${f.id}`" class="person"><GsmsPersonAvatar :name="f.nom" :photo="f.photo" :size="28" />{{ f.nom }}</router-link>
          </li>
        </ul>
      </section>
    </template>

    <!-- Vue d'ensemble : chiffres, points à traiter, formations, chronologie et questionnaires, tirés des parcours rendus par l'API -->
    <template v-if="learner && current === 'synthese'">
      <GsmsKpiRow :items="kpis" :loading="journeysLoading" />
      <GsmsRefusal v-if="journeysError" :error="journeysError" inline />
      <div class="duo">
        <GsmsAlertList :title="t('gsms.ficheEnrichie.aTraiter')" :subtitle="t('gsms.ficheEnrichie.aTraiterAide')" icon="time" :items="todo"
          :loading="journeysLoading" :error="journeysError" :empty="t('gsms.ficheEnrichie.rienATraiter')" />
        <section class="panel">
          <div class="panel-bar"><h3 class="title">{{ t('gsms.ficheEnrichie.formationsSuivies') }}</h3><span v-if="journeys" class="chip">{{ journeys.length }}</span></div>
          <t-skeleton v-if="journeysLoading" animation="gradient" :row-col="[{ width: '100%' }, { width: '100%' }]" />
          <GsmsEmptyState v-else-if="journeys && !journeys.length" :title="t('gsms.stagiaires.aucuneInscription')" compact />
          <ul v-else-if="journeys" class="enrol-list">
            <li v-for="j in journeys" :key="j.inscription.id" class="enrol">
              <FormationThumb :image="j.inscription.session.formation_image_url" :size="40" />
              <div class="enrol-body">
                <div class="enrol-top">
                  <router-link :to="`/platform/sessions/${j.inscription.session.id}/inscriptions/${j.inscription.id}`" class="enrol-title">{{ j.inscription.session.formation_titre || j.inscription.session.reference }}</router-link>
                  <GsmsStatusTag :code="j.inscription.statut" />
                </div>
                <span class="muted">{{ j.inscription.session.reference }} · {{ fmtDate(j.inscription.session.debut) }} → {{ fmtDate(j.inscription.session.fin) }}</span>
                <template v-if="j.journey">
                  <span class="meter" aria-hidden="true"><span :style="{ width: pct(progress(j).done, progress(j).total) }" /></span>
                  <span class="muted">{{ t('gsms.ficheEnrichie.avancement', { faits: progress(j).done, total: progress(j).total }) }}</span>
                </template>
                <span v-if="j.inscription.abandon_le" class="muted alert-text">{{ t('gsms.ficheEnrichie.abandonMotif', { date: fmtDate(j.inscription.abandon_le), motif: abandonReason(j) || '—' }) }}</span>
              </div>
            </li>
          </ul>
        </section>
      </div>
      <GsmsTimeline :title="t('gsms.ficheEnrichie.chronologie')" :subtitle="t('gsms.ficheEnrichie.chronologieAide')" :items="timeline"
        :loading="journeysLoading" :error="journeysError" :empty="t('gsms.ficheEnrichie.chronologieVide')" />
      <section class="panel">
        <div class="panel-bar"><h3 class="title">{{ t('gsms.ficheEnrichie.questionnaires') }}</h3><span v-if="!journeysLoading" class="chip">{{ questionnaires.length }}</span></div>
        <p class="muted">{{ t('gsms.ficheEnrichie.questionnairesAide') }}</p>
        <t-skeleton v-if="journeysLoading" animation="gradient" :row-col="[{ width: '100%' }]" />
        <GsmsEmptyState v-else-if="!questionnaires.length" :title="t('gsms.ficheEnrichie.questionnairesVide')" compact />
        <ul v-else class="rows">
          <li v-for="(q, i) in questionnaires" :key="i" class="row row--col">
            <div class="enrol-top">
              <span class="row-main">{{ q.titre }}<span class="muted"> · {{ q.session }}</span></span>
              <t-tag :theme="q.repondu ? 'success' : 'default'" variant="light" size="small">
                {{ q.repondu ? t('gsms.ficheEnrichie.reponduLe', { date: fmtDate(q.repondu) }) : t('gsms.ficheEnrichie.sansReponse') }}
              </t-tag>
            </div>
            <span class="muted">{{ t('gsms.ficheEnrichie.envoyeLe', { date: fmtDate(q.envoye) }) }}<template v-if="q.ouvert"> · {{ t('gsms.ficheEnrichie.ouvertLe', { date: fmtDate(q.ouvert) }) }}</template></span>
            <details v-if="q.reponses.length" class="answers">
              <summary>{{ t('gsms.ficheEnrichie.nReponses', { n: q.reponses.length }) }}</summary>
              <dl><template v-for="(r, k) in q.reponses" :key="k"><dt>{{ r.question }}</dt><dd>{{ r.reponse }}</dd></template></dl>
            </details>
          </li>
        </ul>
      </section>
    </template>

    <GsmsHistory v-else-if="learner && current === 'historique'" table="formation.learner" :entity-id="learner.id" />

    <!-- Fiche : identité et coordonnées rendues par GET /learners/{id} -->
    <div v-else-if="learner && current === 'fiche'" class="info-grid">
      <GsmsInfoPanel :title="t('gsms.stagiaires.groupes.identite')" icon="user" :rows="[
        { label: t('gsms.stagiaires.champs.civilite'), value: learner.civility_label || learner.civility },
        { label: t('gsms.stagiaires.champs.nom'), value: learner.last_name },
        { label: t('gsms.stagiaires.champs.nomUsage'), value: learner.usage_name },
        { label: t('gsms.stagiaires.champs.prenom'), value: learner.first_name },
      ]" />
      <GsmsInfoPanel :title="`${t('gsms.stagiaires.groupes.naissance')} · ${t('gsms.stagiaires.groupes.nationalite')}`" icon="calendar" :rows="[
        { label: t('gsms.stagiaires.champs.dateNaissance'), value: learner.birth_date ? fmtDate(learner.birth_date) : null },
        { label: t('gsms.stagiaires.champs.villeNaissance'), value: learner.birth_city },
        bornInFrance(learner)
          ? { label: t('gsms.stagiaires.champs.departementNaissance'), value: learner.birth_department }
          : { label: t('gsms.stagiaires.champs.paysNaissance'), value: learner.birth_country },
        { label: t('gsms.stagiaires.champs.nationalite'), value: learner.nationality, flag: nationalityFlag(learner.nationality) },
      ]" />
      <GsmsInfoPanel :title="t('gsms.stagiaires.groupes.coordonnees')" icon="location" :rows="[
        { label: t('gsms.stagiaires.champs.email'), value: learner.email },
        { label: t('gsms.stagiaires.champs.telephone'), value: learner.phone },
        { label: t('gsms.stagiaires.champs.adresse'), value: learner.address, wide: true },
        { label: t('gsms.stagiaires.champs.codePostal'), value: learner.postal_code },
        { label: t('gsms.stagiaires.champs.ville'), value: learner.city },
      ]" />
      <GsmsInfoPanel :title="`${t('gsms.stagiaires.groupes.situation')} · ${t('gsms.stagiaires.groupes.entreprise')}`" icon="city" :rows="[
        { label: t('gsms.stagiaires.champs.situation'), value: learner.current_situation, wide: true },
        { label: t('gsms.stagiaires.champs.entreprise'), value: learner.company_name },
      ]">
        <router-link v-if="learner.company_id" :to="`/platform/entreprises/${learner.company_id}`" class="link">
          {{ t('gsms.stagiaires.ouvrirEntreprise') }}<t-icon name="chevron-right" size="14px" />
        </router-link>
      </GsmsInfoPanel>
    </div>

    <template v-else-if="learner">
      <GsmsRefusal v-if="journeysError" :error="journeysError" inline />
      <div v-else-if="!journeys" class="panel"><t-skeleton animation="gradient" :row-col="[{ width: '60%' }, { width: '100%' }, { width: '100%' }]" /></div>
      <section v-else-if="!journeys.length" class="panel"><p class="muted">{{ t('gsms.stagiaires.aucuneInscription') }}</p></section>

      <!-- Parcours : une inscription par session, états des étapes décidés par l'API -->
      <template v-else-if="current === 'parcours'">
        <section v-for="j in journeys" :key="j.inscription.id" class="panel">
          <div class="panel-bar">
            <FormationThumb :image="j.inscription.session.formation_image_url" :size="40" />
            <div class="enrollment-head">
              <router-link :to="`/platform/sessions/${j.inscription.session.id}`" class="title link">{{ j.inscription.session.reference }}</router-link>
              <span class="muted">{{ j.inscription.session.formation_titre }} · {{ fmtDate(j.inscription.session.debut) }} → {{ fmtDate(j.inscription.session.fin) }}</span>
            </div>
            <GsmsStatusTag :code="j.inscription.statut" />
          </div>
          <GsmsRefusal v-if="j.error" :error="j.error" inline />
          <template v-else-if="j.journey">
            <span class="meter" aria-hidden="true"><span :style="{ width: pct(progress(j).done, progress(j).total) }" /></span>
            <div class="steps">
              <span v-for="s in j.journey.etapes" :key="s.etape" class="step"><GsmsStepMark :state="s.etat" :label="stepLabel(s.etape)" />{{ stepLabel(s.etape) }}</span>
            </div>
            <p class="muted">
              {{ t('gsms.parcours.financement') }} : {{ j.journey.contact.financement || t('gsms.sessions.financementNonRenseigne') }} ·
              {{ t('gsms.parcours.assiduite') }} : {{ t('gsms.parcours.demiJournees', { n: j.journey.assiduite.suivies, total: j.journey.assiduite.prevues }) }}
              <template v-if="j.journey.assiduite.heures_prevues != null"> · {{ t('gsms.ficheEnrichie.heures', { n: j.journey.assiduite.heures_suivies ?? 0, total: j.journey.assiduite.heures_prevues }) }}</template>
            </p>
            <router-link v-if="j.inscription.session.formateur_id" :to="`/platform/formateurs/${j.inscription.session.formateur_id}`" class="person">
              <GsmsPersonAvatar :name="j.inscription.session.formateur || ''" :photo="j.inscription.session.formateur_photo_url" :size="24" />{{ j.inscription.session.formateur }}
            </router-link>
            <p v-if="j.journey.abandon" class="muted alert-text">{{ t('gsms.ficheEnrichie.abandonMotif', { date: fmtDate(abandonOf(j).le), motif: abandonOf(j).motif || '—' }) }}</p>
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

  <ActionDialog v-model:visible="editVisible" :title="t('gsms.stagiaires.modifier')" icon="edit-1" :fields="editFields"
    width="min(760px, calc(100vw - 32px))" :run="save" @done="saved">
    <p v-if="companiesError" class="muted companies-note">{{ t('gsms.stagiaires.entreprisesIndisponibles') }}</p>
  </ActionDialog>
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
import GsmsInfoPanel from '@/components/gsms/GsmsInfoPanel.vue'
import ActionDialog from '@/components/gsms/ActionDialog.vue'
import GsmsKpiRow from '@/components/gsms/GsmsKpiRow.vue'
import GsmsAlertList from '@/components/gsms/GsmsAlertList.vue'
import GsmsEmptyState from '@/components/gsms/GsmsEmptyState.vue'
import GsmsTimeline, { type TimelineItem } from '@/components/gsms/GsmsTimeline.vue'
import GsmsHistory from '@/components/gsms/GsmsHistory.vue'
import type { AlertItem, KpiItem } from '@/components/gsms/types'
import { MessagePlugin } from 'tdesign-vue-next'
import { nationalityFlag } from '@/components/gsms/media'
import { listCompanies, type Company } from '@/api/gsms/entreprises'
import { bornInFrance, learnerFields, learnerInitial, learnerPayload } from './learnerForm'
import FormationThumb from '@/views/gsms/formations/FormationThumb.vue'
import { getLearner, listLearnerInscriptions, updateLearner, type LearnerInscription, type LearnerRecord } from '@/api/gsms/sessions'
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
// Historique : seulement avec le droit de lire le journal des modifications.
const showHistory = computed(() => access.can('journal.read'))
const TABS = computed(() => ['synthese', 'fiche', 'parcours', 'documents', ...(showFunding.value ? ['financement'] : []), ...(showHistory.value ? ['historique'] : [])])
const ALL_TABS = ['synthese', 'fiche', 'parcours', 'documents', 'financement', 'historique']
const tab = ref(ALL_TABS.includes(String(route.query.onglet)) ? String(route.query.onglet) : 'synthese')
const current = computed(() => (TABS.value.includes(tab.value) ? tab.value : 'synthese'))
const documents = computed(() => (journeys.value ?? []).flatMap((j) =>
  (j.journey?.documents ?? []).map((doc: JourneyDocument) => ({ doc, enrollment: j.inscription.id, session: j.inscription.session.reference }))))
const tabs = computed(() => [
  { value: 'synthese', label: t('gsms.ficheEnrichie.synthese') },
  { value: 'fiche', label: t('gsms.stagiaires.ongletFiche') },
  { value: 'parcours', label: t('gsms.sessions.parcours'), count: journeys.value?.length },
  { value: 'documents', label: t('gsms.stagiaires.documents'), count: journeys.value ? documents.value.length : undefined },
  ...(showFunding.value ? [{ value: 'financement', label: t('gsms.parcours.financement') }] : []),
  ...(showHistory.value ? [{ value: 'historique', label: t('gsms.ficheEnrichie.historique') }] : []),
])

// ── Vue d'ensemble : regroupements d'affichage des états et dates rendus par l'API (aucun état recalculé) ──
const journeysLoading = computed(() => journeys.value === null && !journeysError.value)
const pct = (n: number, total: number) => `${total > 0 ? Math.min(100, (n / total) * 100) : 0}%`
function progress(j: EnrollmentView) {
  const steps = (j.journey?.etapes ?? []).filter((s) => s.etat !== 'SANS_OBJET')
  return { done: steps.filter((s) => s.etat === 'FAIT').length, total: steps.length }
}
const abandonOf = (j: EnrollmentView) => (j.journey?.abandon ?? {}) as { le?: string | null; motif?: string | null }
const abandonReason = (j: EnrollmentView) => abandonOf(j).motif ?? null
const allSteps = computed(() => (journeys.value ?? []).flatMap((j) => (j.journey?.etapes ?? []).map((s) => ({ s, j }))))
const kpis = computed<KpiItem[]>(() => {
  const steps = allSteps.value.filter((x) => x.s.etat !== 'SANS_OBJET')
  const done = steps.filter((x) => x.s.etat === 'FAIT').length
  const late = allSteps.value.filter((x) => x.s.etat === 'EN_RETARD').length
  const att = (journeys.value ?? []).reduce((a, j) => ({ p: a.p + (j.journey?.assiduite.prevues ?? 0), s: a.s + (j.journey?.assiduite.suivies ?? 0) }), { p: 0, s: 0 })
  return [
    { key: 'inscriptions', label: t('gsms.ficheEnrichie.kpiInscriptions'), value: learner.value?.enrollments ?? 0, icon: 'books' },
    { key: 'etapes', label: t('gsms.ficheEnrichie.kpiEtapes'), value: done, subtitle: t('gsms.ficheEnrichie.kpiEtapesSur', { n: steps.length }), icon: 'check-circle', meter: { value: done, max: steps.length } },
    { key: 'retards', label: t('gsms.ficheEnrichie.kpiRetards'), value: late, icon: 'error-circle', tone: late > 0 ? 'danger' : undefined },
    { key: 'assiduite', label: t('gsms.ficheEnrichie.kpiAssiduite'), value: att.s, subtitle: t('gsms.ficheEnrichie.kpiDemiJournees', { n: att.p }), icon: 'calendar', meter: { value: att.s, max: att.p } },
    { key: 'documents', label: t('gsms.ficheEnrichie.kpiDocuments'), value: documents.value.length, icon: 'file' },
  ]
})
const todo = computed<AlertItem[]>(() => allSteps.value
  .filter((x) => x.s.etat === 'EN_RETARD' || x.s.etat === 'A_ECHEANCE')
  .map(({ s, j }) => ({
    id: `${j.inscription.id}-${s.etape}`, title: stepLabel(s.etape), subtitle: j.inscription.session.formation_titre ?? undefined,
    kind: j.inscription.session.reference, when: s.echeance ? fmtDate(s.echeance) : undefined,
    tone: s.etat === 'EN_RETARD' ? 'danger' as const : 'warning' as const,
    to: `/platform/sessions/${j.inscription.session.id}/inscriptions/${j.inscription.id}`,
  })))
const time = (d: string | null | undefined) => (d ? new Date(d.length === 10 ? `${d}T00:00:00` : d).getTime() : 0)
const timeline = computed<TimelineItem[]>(() => {
  const out: TimelineItem[] = []
  for (const j of journeys.value ?? []) {
    const session = j.inscription.session.reference
    const link = `/platform/sessions/${j.inscription.session.id}/inscriptions/${j.inscription.id}`
    const jr = j.journey
    if (!jr) continue
    if (jr.contact.inscrit_le) out.push({ key: `${j.inscription.id}-in`, date: jr.contact.inscrit_le, dateLabel: fmtDate(jr.contact.inscrit_le), title: t('gsms.ficheEnrichie.evtInscription', { session }), icon: 'user-add', to: link })
    for (const s of jr.etapes) {
      if (s.etat === 'FAIT' && s.le) out.push({ key: `${j.inscription.id}-${s.etape}`, date: s.le, dateLabel: fmtDate(s.le), title: t('gsms.ficheEnrichie.evtEtape', { etape: stepLabel(s.etape), session }), detail: s.detail, tone: 'success', icon: 'check', to: link })
    }
    for (const d of jr.documents) {
      if (d.emis_le) out.push({ key: `${j.inscription.id}-doc-${d.id}`, date: d.emis_le, dateLabel: fmtDateTime(d.emis_le), title: t('gsms.ficheEnrichie.evtDocument', { titre: d.titre, session }), detail: d.par, icon: 'file' })
    }
    const ab = abandonOf(j)
    if (jr.abandon && ab.le) out.push({ key: `${j.inscription.id}-ab`, date: ab.le, dateLabel: fmtDate(ab.le), title: t('gsms.ficheEnrichie.evtAbandon', { session }), detail: ab.motif, tone: 'danger', icon: 'close' })
  }
  for (const [i, q] of questionnaires.value.entries()) {
    if (q.envoye) out.push({ key: `q-${i}-env`, date: q.envoye, dateLabel: fmtDateTime(q.envoye), title: t('gsms.ficheEnrichie.evtQuestionnaireEnvoye', { titre: q.titre }), detail: q.session, icon: 'mail' })
    if (q.repondu) out.push({ key: `q-${i}-rep`, date: q.repondu, dateLabel: fmtDateTime(q.repondu), title: t('gsms.ficheEnrichie.evtQuestionnaireRepondu', { titre: q.titre }), detail: q.session, tone: 'success', icon: 'chat' })
  }
  return out.sort((a, b) => time(b.date) - time(a.date))
})
interface QuestionnaireView { titre: string; session: string; envoye: string | null; ouvert: string | null; repondu: string | null; reponses: { question: string; reponse: string }[] }
const questionnaires = computed<QuestionnaireView[]>(() => (journeys.value ?? []).flatMap((j) => (j.journey?.questionnaires ?? []).map((q) => ({
  titre: String(q.questionnaire ?? q.type ?? ''), session: j.inscription.session.reference,
  envoye: (q.envoye_le as string | null) ?? null, ouvert: (q.ouvert_le as string | null) ?? null, repondu: (q.repondu_le as string | null) ?? null,
  reponses: ((q.reponses as { question: string; reponse: unknown }[] | undefined) ?? []).map((r) => ({ question: r.question, reponse: String(r.reponse) })),
}))))
// Formateurs des sessions suivies (une fois chacun), avec leur fiche.
const trainers = computed(() => {
  const seen = new Map<string, { id: string; nom: string; photo: string | null }>()
  for (const j of journeys.value ?? []) {
    const s = j.inscription.session
    if (s.formateur_id && !seen.has(s.formateur_id)) seen.set(s.formateur_id, { id: s.formateur_id, nom: s.formateur ?? '—', photo: s.formateur_photo_url ?? null })
  }
  return [...seen.values()]
})

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

// ── Modifier (PATCH /learners/{id}, `sessions.write`) : seuls les champs changés partent ──
const canWrite = computed(() => access.can('sessions.write'))
access.load()
const editVisible = ref(false)
const companies = ref<Company[]>([])
const companiesError = ref<unknown>(null)
const editFields = computed(() => learnerFields(learner.value, companies.value))
async function openEdit() {
  companiesError.value = null
  try {
    companies.value = await listCompanies()
  } catch (e) {
    companies.value = []
    companiesError.value = e
  }
  editVisible.value = true
}
const save = (v: Record<string, unknown>) => {
  const row = learner.value!
  const body = learnerPayload(v, learnerInitial(row))
  return Object.keys(body).length ? updateLearner(row.id, body) : Promise.resolve(row)
}
async function saved() {
  MessagePlugin.success(t('gsms.commun.misAJour'))
  // Le PATCH rend la ligne de liste (sans l'identité détaillée) : la fiche est relue.
  try { learner.value = await getLearner(id.value) } catch (e) { error.value = e }
}

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
.enrollment-head { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
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
.info-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; }
@media (min-width: 768px) { .info-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.companies-note { margin-top: 8px; }
.duo { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; }
@media (min-width: 1100px) { .duo { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.chip { .gsms-chip(); }
.enrol-list { list-style: none; margin: 0; padding: 0; li + li { border-top: 1px dashed var(--td-component-stroke); } }
.enrol { display: flex; gap: 12px; padding: 10px 0; min-width: 0; }
.enrol-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.enrol-top { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 4px 8px; }
.enrol-title { min-width: 0; color: var(--td-text-color-primary); font-size: var(--app-text-md); font-weight: 600; text-decoration: none; overflow-wrap: anywhere;
  &:hover { color: var(--td-brand-color); text-decoration: underline; } }
.meter { display: block; height: 6px; margin: 2px 0; border-radius: var(--app-radius-pill); background: var(--td-bg-color-component); overflow: hidden;
  span { display: block; height: 100%; border-radius: inherit; background: var(--td-text-color-secondary); } }
.alert-text { color: var(--td-error-color); }
.row--col { flex-direction: column; align-items: stretch; }
.answers { font-size: var(--app-text-sm);
  summary { cursor: pointer; color: var(--td-text-color-secondary); }
  dl { display: flex; flex-direction: column; gap: 6px; margin: 6px 0 0; }
  dt { color: var(--td-text-color-placeholder); font-size: var(--app-text-xs); }
  dd { margin: 0; color: var(--td-text-color-primary); overflow-wrap: anywhere; } }
.people { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.person { display: inline-flex; align-items: center; gap: 8px; color: var(--td-text-color-primary); font-size: var(--app-text-sm); text-decoration: none;
  &:hover { color: var(--td-brand-color); } }
</style>
