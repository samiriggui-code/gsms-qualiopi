<template>
  <GsmsRecordSheet :title="member?.nom || t('gsms.rh.personnel.fiche')" icon="user" back="/platform/personnel"
    :back-label="t('gsms.rh.personnel.titre')" :avatar-name="member?.nom" :avatar-photo="member?.photo_url"
    :subtitle="member?.fonction || ''" :meta="meta" :ready="!!member" :loading="loading" :error="error" @retry="load">
    <template v-if="member && !member.actif" #status>
      <t-tag variant="light" size="small">{{ t('gsms.rh.personnel.inactif') }}</t-tag>
    </template>
    <template v-if="member && canWrite" #actions>
      <t-button size="small" variant="outline" @click="openEdit"><template #icon><t-icon name="edit-1" /></template>{{ t('gsms.commun.modifier') }}</t-button>
    </template>

    <div v-if="member" class="info-grid">
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
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { MessagePlugin } from 'tdesign-vue-next'
import GsmsRecordSheet, { type SheetMeta } from '@/components/gsms/GsmsRecordSheet.vue'
import GsmsInfoPanel from '@/components/gsms/GsmsInfoPanel.vue'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import ActionDialog, { type ActionField } from '@/components/gsms/ActionDialog.vue'
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
watch(id, load, { immediate: true })

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
.rows { .gsms-rows(); }
.row { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 12px; padding: 8px 12px; }
.row-main { font-weight: 500; color: var(--td-text-color-primary); overflow-wrap: anywhere; }
.link { display: inline-flex; align-items: center; gap: 4px; color: var(--td-brand-color); font-size: var(--app-text-sm); text-decoration: none;
  &:hover { text-decoration: underline; } }
</style>
