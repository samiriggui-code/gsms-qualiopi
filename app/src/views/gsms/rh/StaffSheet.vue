<template>
  <GsmsRecordSheet :title="member?.nom || t('gsms.rh.personnel.fiche')" icon="user" back="/platform/personnel"
    :back-label="t('gsms.rh.personnel.titre')" :avatar-name="member?.nom" :avatar-photo="member?.photo_url"
    :subtitle="member?.fonction || ''" :meta="meta" :ready="!!member" :loading="loading" :error="error"
    :tabs="tabs" :tab="current" @update:tab="(v) => (tab = v)" @retry="load">
    <template v-if="member && !member.actif" #status>
      <t-tag variant="light" size="small">{{ t('gsms.rh.personnel.inactif') }}</t-tag>
    </template>
    <template v-if="member && canWrite" #actions>
      <t-button size="small" variant="outline" @click="openEdit"><template #icon><t-icon name="edit-1" /></template>{{ t('gsms.commun.modifier') }}</t-button>
    </template>

    <template v-if="member" #side>
      <section class="side-section">
        <div class="identity">
          <GsmsPersonAvatar :name="member.nom" :photo="member.photo_url" :size="48" />
          <span class="identity-text"><span class="identity-name">{{ member.nom }}</span><span class="muted">{{ member.fonction || codeLabel(member.statut) }}</span></span>
        </div>
        <dl>
          <div><dt>{{ t('gsms.rh.personnel.service') }}</dt><dd>{{ member.service_libelle || '—' }}</dd></div>
          <div><dt>{{ t('gsms.rh.personnel.contratEnCours') }}</dt><dd>{{ contractText(member) }}</dd></div>
          <div><dt>{{ t('gsms.rh.formateurs.email') }}</dt><dd>{{ member.email || '—' }}</dd></div>
          <div><dt>{{ t('gsms.rh.personnel.telephone') }}</dt><dd>{{ member.telephone || '—' }}</dd></div>
        </dl>
      </section>
    </template>

    <!-- Vue d'ensemble : chiffres, chronologie des contrats, absences et titres, sessions de la fiche formateur liée -->
    <template v-if="member && current === 'synthese'">
      <GsmsKpiRow :items="kpis" />
      <GsmsTimeline :title="t('gsms.ficheEnrichie.chronologie')" :subtitle="t('gsms.ficheEnrichie.chronologieAide')" :items="timeline"
        :empty="t('gsms.ficheEnrichie.chronologieVide')" />
      <section v-if="member.formateur_id && canReadSessions" class="panel-block">
        <div class="panel-bar"><h3 class="title">{{ t('gsms.ficheEnrichie.sessionsFormateur') }}</h3>
          <router-link :to="`/platform/formateurs/${member.formateur_id}`" class="link">{{ t('gsms.rh.personnel.ouvrirFormateur') }}<t-icon name="chevron-right" size="14px" /></router-link></div>
        <GsmsRefusal v-if="sessionsError" :error="sessionsError" inline />
        <t-skeleton v-else-if="!sessions" animation="gradient" :row-col="[{ width: '100%' }, { width: '100%' }]" />
        <GsmsEmptyState v-else-if="!sessions.length" :title="t('gsms.rh.fiche.aucuneSession')" compact />
        <ul v-else class="rows">
          <li v-for="s in sessions.slice(0, 8)" :key="s.id">
            <router-link :to="`/platform/sessions/${s.id}`" class="row row--link">
              <span class="row-main">{{ s.program_title || s.program_code }}<span class="muted"> · {{ s.reference }}</span></span>
              <span class="muted">{{ fmtDate(s.start_date) }} → {{ fmtDate(s.end_date) }}</span>
              <GsmsStatusTag :code="s.status" />
            </router-link>
          </li>
        </ul>
      </section>
    </template>

    <GsmsHistory v-else-if="member && current === 'historique'" table="rh.staff_member" :entity-id="member.id" />

    <div v-else-if="member" class="info-grid">
      <GsmsInfoPanel :title="t('gsms.rh.personnel.coordonnees')" icon="call" :rows="[
        { label: t('gsms.rh.formateurs.email'), value: member.email },
        { label: t('gsms.rh.personnel.telephone'), value: member.telephone },
        { label: t('gsms.rh.personnel.statut'), value: codeLabel(member.statut) },
        { label: t('gsms.rh.personnel.service'), value: member.service_libelle },
        { label: t('gsms.rh.personnel.compte'), value: member.compte_id ? t('gsms.rh.personnel.compteRelie') : t('gsms.rh.personnel.aucunCompte') },
      ]" />

      <GsmsInfoPanel :title="t('gsms.rh.fiche.presenceSite')" icon="browse" :rows="[
        { label: t('gsms.rh.formateurs.fonctionSite'), value: member.site.fonction },
        { label: t('gsms.rh.formateurs.bioSite'), value: member.site.bio, wide: true },
      ]">
        <template #actions>
          <t-tag :theme="member.site.visible ? 'success' : 'default'" variant="light" size="small">
            {{ member.site.visible ? t('gsms.rh.fiche.visible') : t('gsms.rh.fiche.nonVisible') }}
          </t-tag>
        </template>
      </GsmsInfoPanel>

      <GsmsInfoPanel :title="t('gsms.rh.personnel.contrats')" icon="file-paste">
        <template v-if="canWrite" #actions>
          <t-button size="small" variant="outline" @click="contractVisible = true">{{ t('gsms.rh.personnel.ajouterContrat') }}</t-button>
        </template>
        <p class="muted">{{ t('gsms.rh.personnel.contratEnCours') }} : {{ contractText(member) }}</p>
        <p v-if="!member.contrats.length" class="muted">{{ t('gsms.rh.personnel.aucunContrat') }}</p>
        <ul v-else class="rows">
          <li v-for="c in member.contrats" :key="c.id" class="row">
            <span class="row-main">{{ codeLabel(c.type) }}<template v-if="c.temps"> · {{ codeLabel(c.temps) }}</template></span>
            <span class="muted">{{ periodText(c.debut, c.fin) }}</span>
          </li>
        </ul>
      </GsmsInfoPanel>

      <GsmsInfoPanel :title="t('gsms.rh.personnel.absences')" icon="calendar">
        <template v-if="canWrite" #actions>
          <t-button size="small" variant="outline" @click="absenceVisible = true">{{ t('gsms.rh.personnel.ajouterAbsence') }}</t-button>
        </template>
        <p v-if="!member.absences.length" class="muted">{{ t('gsms.rh.personnel.aucuneAbsence') }}</p>
        <ul v-else class="rows">
          <li v-for="a in member.absences" :key="a.id" class="row">
            <span class="row-main">{{ codeLabel(a.nature) }}</span>
            <span class="muted">{{ periodText(a.debut, a.fin) }}</span>
          </li>
        </ul>
      </GsmsInfoPanel>

      <GsmsInfoPanel :title="t('gsms.rh.personnel.formateurLie')" icon="user-talk" class="wide">
        <template v-if="member.formateur_id" #actions>
          <router-link :to="`/platform/formateurs/${member.formateur_id}`" class="link">
            {{ t('gsms.rh.personnel.ouvrirFormateur') }}<t-icon name="chevron-right" size="14px" />
          </router-link>
        </template>
        <p v-if="!member.formateur_id" class="muted">{{ t('gsms.rh.personnel.aucunFormateur') }}</p>
        <template v-else>
          <p v-if="!member.titres?.length" class="muted">{{ t('gsms.rh.personnel.aucunTitre') }}</p>
          <ul v-else class="rows">
            <li v-for="(q, i) in member.titres" :key="i" class="row">
              <span class="row-main">{{ q.libelle }}<template v-if="q.numero"> · {{ t('gsms.rh.fiche.numero', { n: q.numero }) }}</template></span>
              <span class="muted">{{ q.fin ? t('gsms.rh.fiche.valableJusquau', { date: fmtDate(q.fin) }) : t('gsms.rh.fiche.sansEcheance') }}</span>
            </li>
          </ul>
        </template>
      </GsmsInfoPanel>
    </div>
  </GsmsRecordSheet>

  <ActionDialog v-model:visible="editVisible" :title="t('gsms.rh.personnel.modifier')" icon="edit-1" :fields="editFields"
    width="min(760px, calc(100vw - 32px))" :run="save" @done="saved">
    <GsmsRefusal v-if="sideError" :error="sideError" inline />
  </ActionDialog>
  <ActionDialog v-model:visible="contractVisible" :title="t('gsms.rh.personnel.ajouterContrat')" :fields="contractFields"
    :run="(v) => addContract(id, v as ContractIn)" @done="saved" />
  <ActionDialog v-model:visible="absenceVisible" :title="t('gsms.rh.personnel.ajouterAbsence')" :fields="absenceFields"
    :run="(v) => addAbsence(id, v as AbsenceIn)" @done="saved" />
</template>

<script setup lang="ts">
/** Fiche d'une personne du personnel (GET /rh/personnel/{id}) : coordonnées, présence sur le site, contrats, absences. */
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { MessagePlugin } from 'tdesign-vue-next'
import GsmsRecordSheet, { type SheetMeta } from '@/components/gsms/GsmsRecordSheet.vue'
import GsmsInfoPanel from '@/components/gsms/GsmsInfoPanel.vue'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import ActionDialog, { type ActionField } from '@/components/gsms/ActionDialog.vue'
import GsmsKpiRow from '@/components/gsms/GsmsKpiRow.vue'
import GsmsPersonAvatar from '@/components/gsms/GsmsPersonAvatar.vue'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import GsmsEmptyState from '@/components/gsms/GsmsEmptyState.vue'
import GsmsTimeline, { type TimelineItem } from '@/components/gsms/GsmsTimeline.vue'
import GsmsHistory from '@/components/gsms/GsmsHistory.vue'
import { listSessions, type SessionRow } from '@/api/gsms/sessions'
import type { KpiItem } from '@/components/gsms/types'
import {
  addAbsence, addContract, getStaff, listStaffServices, listTrainers, updateStaff,
  type AbsenceIn, type ContractIn, type StaffIn, type StaffMember, type StaffService, type Trainer,
} from '@/api/gsms/rh'
import { useGsmsAccessStore } from '@/stores/gsmsAccess'
import { fmtDate } from '@/components/gsms/format'
import { ABSENCE_KINDS, CONTRACT_KINDS, WORK_TIMES, changedOnly, codeLabel, codeOptions, staffFields, staffInitial } from './forms'

const { t } = useI18n()
const route = useRoute()
const access = useGsmsAccessStore()
const canWrite = computed(() => access.can('staff.write'))
access.load()

const id = computed(() => String(route.params.staffId || ''))
const member = ref<StaffMember | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)

async function load() {
  const sid = id.value
  if (!sid) return
  loading.value = true
  error.value = null
  try {
    const res = await getStaff(sid)
    if (sid === id.value) member.value = res
  } catch (e) {
    if (sid === id.value) { error.value = e; member.value = null }
  } finally {
    loading.value = false
  }
}
watch(id, () => { sessions.value = null; load() }, { immediate: true })

// ── Onglets : vue d'ensemble, fiche, historique (journal des modifications, droit `journal.read`) ──
const router = useRouter()
const canReadSessions = computed(() => access.can('sessions.read'))
const TABS = computed(() => ['synthese', 'fiche', ...(access.can('journal.read') ? ['historique'] : [])])
const tab = ref(['synthese', 'fiche', 'historique'].includes(String(route.query.onglet)) ? String(route.query.onglet) : 'synthese')
const current = computed(() => (TABS.value.includes(tab.value) ? tab.value : 'synthese'))
const tabs = computed(() => [
  { value: 'synthese', label: t('gsms.ficheEnrichie.synthese') },
  { value: 'fiche', label: t('gsms.stagiaires.ongletFiche') },
  ...(TABS.value.includes('historique') ? [{ value: 'historique', label: t('gsms.ficheEnrichie.historique') }] : []),
])
watch(tab, (v) => router.replace({ query: { ...route.query, onglet: v } }))

// Sessions de la fiche formateur liée (GET /sessions?formateur=, `sessions.read`).
const sessions = ref<SessionRow[] | null>(null)
const sessionsError = ref<unknown>(null)
watch(() => [member.value?.formateur_id, canReadSessions.value] as const, async ([fid, can]) => {
  if (!fid || !can) return
  sessionsError.value = null
  try {
    const res = await listSessions({ formateur: fid })
    if (fid === member.value?.formateur_id) sessions.value = res
  } catch (e) { sessionsError.value = e }
}, { immediate: true })

const kpis = computed<KpiItem[]>(() => {
  const m = member.value
  if (!m) return []
  return [
    { key: 'contrats', label: t('gsms.ficheEnrichie.kpiContrats'), value: m.contrats.length, subtitle: contractText(m), icon: 'file-paste' },
    { key: 'absences', label: t('gsms.ficheEnrichie.kpiAbsences'), value: m.absences.length, icon: 'calendar' },
    ...(m.formateur_id ? [{ key: 'titres', label: t('gsms.ficheEnrichie.kpiTitres'), value: m.titres?.length ?? 0, icon: 'certificate' }] : []),
    { key: 'compte', label: t('gsms.ficheEnrichie.kpiCompte'), value: m.compte_id ? t('gsms.rh.personnel.compteRelie') : t('gsms.rh.personnel.aucunCompte'), icon: 'user-circle' },
  ]
})
const time = (d: string | null | undefined) => (d ? new Date(d.length === 10 ? `${d}T00:00:00` : d).getTime() : 0)
const timeline = computed<TimelineItem[]>(() => {
  const m = member.value
  if (!m) return []
  const out: TimelineItem[] = []
  for (const c of m.contrats) {
    const type = codeLabel(c.type)
    out.push({ key: `c-${c.id}-d`, date: c.debut, dateLabel: fmtDate(c.debut), title: t('gsms.ficheEnrichie.evtContratDebut', { type }), detail: c.temps ? codeLabel(c.temps) : null, icon: 'file-paste' })
    if (c.fin) out.push({ key: `c-${c.id}-f`, date: c.fin, dateLabel: fmtDate(c.fin), title: t('gsms.ficheEnrichie.evtContratFin', { type }), icon: 'file-paste' })
  }
  for (const a of m.absences) {
    out.push({ key: `a-${a.id}`, date: a.debut, dateLabel: periodText(a.debut, a.fin), title: t('gsms.ficheEnrichie.evtAbsence', { nature: codeLabel(a.nature) }), icon: 'calendar' })
  }
  for (const [i, q] of (m.titres ?? []).entries()) {
    if (q.fin) out.push({ key: `q-${i}`, date: q.fin, dateLabel: fmtDate(q.fin), title: t('gsms.ficheEnrichie.evtTitreFin', { titre: q.libelle }), icon: 'certificate' })
  }
  return out.sort((a, b) => time(b.date) - time(a.date))
})

const meta = computed<SheetMeta[]>(() => {
  const m = member.value
  if (!m) return []
  return [
    ...(m.service_libelle ? [{ label: m.service_libelle, icon: 'usergroup' }] : []),
    { label: codeLabel(m.statut), icon: 'user-circle' },
  ]
})

const periodText = (from: string, to: string | null) =>
  to ? t('gsms.rh.personnel.duAu', { du: fmtDate(from), au: fmtDate(to) }) : t('gsms.rh.personnel.depuis', { du: fmtDate(from) })
function contractText(m: StaffMember) {
  const c = m.contrat_en_cours
  if (!c) return t('gsms.rh.personnel.aucunContratEnCours')
  return c.fin ? `${codeLabel(c.type)} · ${t('gsms.rh.personnel.jusquau', { date: fmtDate(c.fin) })}` : codeLabel(c.type)
}

// ── Modifier (PATCH /rh/personnel/{id}) : seuls les champs changés partent ; refus 409/422 affichés ──
const editVisible = ref(false)
const services = ref<StaffService[]>([])
const trainers = ref<Trainer[]>([])
const sideError = ref<unknown>(null)
const editFields = computed(() => staffFields(member.value, services.value, trainers.value))
async function openEdit() {
  sideError.value = null
  const [s, f] = await Promise.allSettled([listStaffServices(false), listTrainers()])
  services.value = s.status === 'fulfilled' ? s.value : []
  trainers.value = f.status === 'fulfilled' ? f.value : []
  sideError.value = s.status === 'rejected' ? s.reason : f.status === 'rejected' ? f.reason : null
  editVisible.value = true
}
const save = (v: Record<string, unknown>) => {
  const m = member.value!
  const body = changedOnly<StaffIn>(v, staffInitial(m))
  return Object.keys(body).length ? updateStaff(m.id, body) : Promise.resolve(m)
}
// Les réponses d'écriture ne portent pas les titres du formateur lié : la fiche est relue.
async function saved() {
  MessagePlugin.success(t('gsms.commun.enregistre'))
  await load()
}

const contractVisible = ref(false)
const absenceVisible = ref(false)
const contractFields = computed<ActionField[]>(() => [
  { name: 'kind', label: `${t('gsms.rh.personnel.typeContrat')} *`, type: 'select', options: codeOptions(CONTRACT_KINDS) },
  { name: 'start_date', label: `${t('gsms.rh.personnel.debut')} *`, type: 'date' },
  { name: 'end_date', label: t('gsms.rh.personnel.fin'), type: 'date' },
  { name: 'work_time', label: t('gsms.rh.personnel.tempsTravail'), type: 'radio', options: codeOptions(WORK_TIMES) },
  { name: 'note', label: t('gsms.rh.personnel.note'), type: 'textarea' },
])
const absenceFields = computed<ActionField[]>(() => [
  { name: 'kind', label: `${t('gsms.rh.personnel.nature')} *`, type: 'select', options: codeOptions(ABSENCE_KINDS) },
  { name: 'start_date', label: `${t('gsms.rh.personnel.debut')} *`, type: 'date' },
  { name: 'end_date', label: `${t('gsms.rh.personnel.fin')} *`, type: 'date' },
  { name: 'note', label: t('gsms.rh.personnel.note'), type: 'textarea' },
])
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.info-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; }
@media (min-width: 768px) {
  .info-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .wide { grid-column: 1 / -1; }
}
.muted { .gsms-muted(); margin: 0; }
.side-section { .gsms-side-section(); }
.identity { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.identity-text { display: flex; flex-direction: column; min-width: 0; }
.identity-name { font-size: var(--app-text-lg); font-weight: 600; color: var(--td-text-color-primary); overflow-wrap: anywhere; }
.panel-block { .gsms-panel(); display: flex; flex-direction: column; gap: 10px; }
.panel-bar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
.title { .gsms-panel-title(); margin: 0; }
.row--link { align-items: center; color: inherit; text-decoration: none;
  &:hover { background: var(--td-bg-color-container-hover); }
  &:focus-visible { outline: 2px solid var(--td-brand-color); outline-offset: -2px; } }
.rows { .gsms-rows(); }
.row { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 12px; padding: 8px 12px; }
.row-main { font-weight: 500; color: var(--td-text-color-primary); overflow-wrap: anywhere; }
.link { display: inline-flex; align-items: center; gap: 4px; color: var(--td-brand-color); font-size: var(--app-text-sm); text-decoration: none;
  &:hover { text-decoration: underline; } }
</style>
