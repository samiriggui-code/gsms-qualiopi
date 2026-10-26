<template>
  <GsmsListPage :title="t('gsms.rh.personnel.titre')" icon="user-list" :subtitle="t('gsms.rh.personnel.sousTitre')"
    :items="items" :loading="loading" :error="error" :columns="columns" :empty-title="t('gsms.rh.personnel.aucun')" @retry="load">
    <template #actions>
      <t-button v-if="canWrite && !error" size="small" @click="openCreate"><template #icon><t-icon name="add" /></template>{{ t('gsms.rh.personnel.nouveau') }}</t-button>
    </template>
    <template v-if="!error" #toolbar>
      <GsmsFilterTabs v-model="scope" :options="scopeTabs" :label="t('gsms.rh.personnel.afficher')" />
    </template>

    <template #cell-nom="{ row }">
      <button type="button" class="person" @click.stop="open(row)">
        <GsmsPersonAvatar :name="row.nom" />
        <span class="person-text"><span class="cell-title">{{ row.nom }}</span><span v-if="row.fonction" class="cell-sub">{{ row.fonction }}</span></span>
      </button>
    </template>
    <template #cell-statut="{ row }">
      {{ codeLabel(row.statut) }}
      <t-tag v-if="!row.actif" variant="light" size="small" class="tag-gap">{{ t('gsms.rh.personnel.inactif') }}</t-tag>
    </template>
    <template #cell-contrat="{ row }">{{ contractText(row) }}</template>
    <template #cell-absences="{ row }">{{ row.absences.length }}</template>
    <template #cell-formateur="{ row }">
      <router-link v-if="row.formateur_id" :to="`/platform/formateurs/${row.formateur_id}`" class="link" @click.stop>{{ t('gsms.rh.personnel.ficheFormateur') }}</router-link>
      <span v-else class="cell-sub">—</span>
    </template>

    <template #card="{ item }">
      <button type="button" class="card" @click="open(item)">
        <div class="card-header">
          <div class="card-header-left person-static">
            <GsmsPersonAvatar :name="item.nom" :size="32" />
            <span class="card-title" :title="item.nom">{{ item.nom }}</span>
          </div>
          <t-tag variant="light" size="small">{{ codeLabel(item.statut) }}</t-tag>
        </div>
        <div class="card-content"><p class="card-description" :class="{ 'is-empty': !item.fonction }">{{ item.fonction || '—' }}</p></div>
        <div class="card-meta">
          <span>{{ contractText(item) }}</span>
          <span>{{ t('gsms.rh.personnel.nAbsences', { n: item.absences.length }) }}</span>
          <span v-if="!item.actif">{{ t('gsms.rh.personnel.inactif') }}</span>
        </div>
      </button>
    </template>
  </GsmsListPage>

  <t-drawer v-model:visible="drawerVisible" :header="selected?.nom || ''" size="min(520px, 100vw)" attach="body" :footer="false" :close-btn="true" destroy-on-close>
    <div v-if="selected" class="drawer">
      <dl class="kv">
        <div><dt>{{ t('gsms.rh.personnel.statut') }}</dt><dd>{{ codeLabel(selected.statut) }}</dd></div>
        <div><dt>{{ t('gsms.rh.personnel.fonction') }}</dt><dd>{{ selected.fonction || '—' }}</dd></div>
        <div><dt>{{ t('gsms.rh.formateurs.email') }}</dt><dd>{{ selected.email || '—' }}</dd></div>
        <div><dt>{{ t('gsms.rh.personnel.contratEnCours') }}</dt><dd>{{ contractText(selected) }}</dd></div>
      </dl>

      <section class="block">
        <div class="block-bar">
          <h3>{{ t('gsms.rh.personnel.contrats') }}</h3>
          <t-button v-if="canWrite" size="small" variant="outline" @click="contractVisible = true">{{ t('gsms.rh.personnel.ajouterContrat') }}</t-button>
        </div>
        <p v-if="!selected.contrats.length" class="muted">{{ t('gsms.rh.personnel.aucunContrat') }}</p>
        <ul v-else class="rows">
          <li v-for="c in selected.contrats" :key="c.id" class="row">
            <span class="row-main">{{ codeLabel(c.type) }}<template v-if="c.temps"> · {{ codeLabel(c.temps) }}</template></span>
            <span class="muted">{{ periodText(c.debut, c.fin) }}</span>
          </li>
        </ul>
      </section>

      <section class="block">
        <div class="block-bar">
          <h3>{{ t('gsms.rh.personnel.absences') }}</h3>
          <t-button v-if="canWrite" size="small" variant="outline" @click="absenceVisible = true">{{ t('gsms.rh.personnel.ajouterAbsence') }}</t-button>
        </div>
        <p v-if="!selected.absences.length" class="muted">{{ t('gsms.rh.personnel.aucuneAbsence') }}</p>
        <ul v-else class="rows">
          <li v-for="a in selected.absences" :key="a.id" class="row">
            <span class="row-main">{{ codeLabel(a.nature) }}</span>
            <span class="muted">{{ periodText(a.debut, a.fin) }}</span>
          </li>
        </ul>
      </section>
    </div>
  </t-drawer>

  <ActionDialog v-model:visible="createVisible" :title="t('gsms.rh.personnel.nouveau')" :fields="createFields" :run="create" @done="created">
    <GsmsRefusal v-if="trainersError" :error="trainersError" inline />
  </ActionDialog>
  <ActionDialog v-model:visible="contractVisible" :title="t('gsms.rh.personnel.ajouterContrat')" :fields="contractFields"
    :run="(v) => addContract(selected!.id, v as ContractIn)" @done="updated" />
  <ActionDialog v-model:visible="absenceVisible" :title="t('gsms.rh.personnel.ajouterAbsence')" :fields="absenceFields"
    :run="(v) => addAbsence(selected!.id, v as AbsenceIn)" @done="updated" />
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { MessagePlugin } from 'tdesign-vue-next'
import GsmsListPage, { type ListColumn } from '@/components/gsms/GsmsListPage.vue'
import GsmsFilterTabs from '@/components/gsms/GsmsFilterTabs.vue'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import GsmsPersonAvatar from '@/components/gsms/GsmsPersonAvatar.vue'
import ActionDialog, { type ActionField } from '@/components/gsms/ActionDialog.vue'
import {
  addAbsence, addContract, createStaff, listStaff, listTrainers,
  type AbsenceIn, type ContractIn, type StaffIn, type StaffMember, type Trainer,
} from '@/api/gsms/rh'
import { useGsmsAccessStore } from '@/stores/gsmsAccess'
import { fmtDate } from '@/components/gsms/format'
import { ABSENCE_KINDS, CONTRACT_KINDS, STAFF_KINDS, WORK_TIMES, codeLabel, codeOptions } from './forms'

const { t } = useI18n()
const access = useGsmsAccessStore()
// Module `hr` désactivé ou droit absent : l'API refuse (403) et le refus s'affiche à la place de la liste.
const canWrite = computed(() => access.can('staff.write'))

const items = ref<StaffMember[] | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const scope = ref('actifs')

async function load() {
  loading.value = true
  error.value = null
  try {
    items.value = await listStaff(scope.value === 'actifs')
  } catch (e) {
    error.value = e
    items.value = null
  } finally {
    loading.value = false
  }
}
onMounted(() => { access.load(); load() })
watch(scope, load)

const scopeTabs = computed(() => [
  { value: 'actifs', label: t('gsms.rh.personnel.actifs') },
  { value: 'tous', label: t('gsms.rh.personnel.tous') },
])

const columns = computed<ListColumn[]>(() => [
  { colKey: 'nom', title: t('gsms.rh.personnel.personne') },
  { colKey: 'statut', title: t('gsms.rh.personnel.statut'), width: 160 },
  { colKey: 'contrat', title: t('gsms.rh.personnel.contratEnCours') },
  { colKey: 'absences', title: t('gsms.rh.personnel.absences'), width: 100 },
  { colKey: 'formateur', title: t('gsms.rh.formateurs.formateur'), width: 150 },
])

const periodText = (from: string, to: string | null) =>
  to ? t('gsms.rh.personnel.duAu', { du: fmtDate(from), au: fmtDate(to) }) : t('gsms.rh.personnel.depuis', { du: fmtDate(from) })
function contractText(m: StaffMember) {
  const c = m.contrat_en_cours
  if (!c) return t('gsms.rh.personnel.aucunContratEnCours')
  return c.fin ? `${codeLabel(c.type)} · ${t('gsms.rh.personnel.jusquau', { date: fmtDate(c.fin) })}` : codeLabel(c.type)
}

// ── Fiche (tiroir) : contrats et absences renvoyés par l'API avec la personne ──
const drawerVisible = ref(false)
const selected = ref<StaffMember | null>(null)
function open(m: StaffMember) {
  selected.value = m
  drawerVisible.value = true
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
async function updated(res: unknown) {
  MessagePlugin.success(t('gsms.commun.enregistre'))
  if (res && typeof res === 'object') selected.value = res as StaffMember
  await load()
}

// ── Nouvelle personne ──
const createVisible = ref(false)
const trainers = ref<Trainer[]>([])
const trainersError = ref<unknown>(null)
const createFields = computed<ActionField[]>(() => [
  { name: 'first_name', label: `${t('gsms.rh.formateurs.prenom')} *` },
  { name: 'last_name', label: `${t('gsms.rh.formateurs.nom')} *` },
  { name: 'email', label: t('gsms.rh.formateurs.email') },
  { name: 'kind', label: t('gsms.rh.personnel.statut'), type: 'select', options: codeOptions(STAFF_KINDS), initial: 'SALARIE' },
  { name: 'job_title', label: t('gsms.rh.personnel.fonction') },
  { name: 'trainer_id', label: t('gsms.rh.personnel.ficheFormateur'), type: 'select', options: trainers.value.map((f) => ({ value: f.id, label: f.full_name })) },
])
async function openCreate() {
  trainersError.value = null
  try {
    trainers.value = await listTrainers()
  } catch (e) {
    trainers.value = []
    trainersError.value = e
  }
  createVisible.value = true
}
const create = (v: Record<string, unknown>) => createStaff(v as unknown as StaffIn)
async function created() {
  MessagePlugin.success(t('gsms.commun.enregistre'))
  await load()
}
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.card { .gsms-card(); width: 100%; text-align: left; font: inherit; color: inherit; }
.person { display: inline-flex; align-items: center; gap: 10px; min-width: 0; padding: 0; border: 0; background: none; font: inherit; color: inherit; text-align: left; cursor: pointer;
  &:hover .cell-title { color: var(--td-brand-color); }
  &:focus-visible { outline: 2px solid var(--td-brand-color); outline-offset: 2px; border-radius: var(--app-radius-xs); } }
.person-static { display: inline-flex; align-items: center; gap: 10px; min-width: 0; }
.person-text { display: flex; flex-direction: column; min-width: 0; }
.cell-title { font-weight: 500; color: var(--td-text-color-primary); }
.cell-sub { color: var(--td-text-color-secondary); font-size: var(--app-text-sm); }
.tag-gap { margin-left: 4px; }
.link { color: var(--td-brand-color); text-decoration: none; &:hover { text-decoration: underline; } }
.drawer { display: flex; flex-direction: column; gap: 16px; }
.kv { .gsms-kv(); }
.block h3 { .gsms-panel-title(); margin: 0; }
.block-bar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.muted { .gsms-muted(); margin: 0; }
.rows { .gsms-rows(); }
.row { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 12px; padding: 8px 12px; }
.row-main { font-weight: 500; color: var(--td-text-color-primary); }
</style>
