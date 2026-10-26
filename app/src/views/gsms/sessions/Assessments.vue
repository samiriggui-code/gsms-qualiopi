<template>
  <GsmsListPage :title="t('gsms.evaluations.titre')" icon="task" :subtitle="t('gsms.evaluations.sousTitre')"
    :items="rows" :loading="loading" :error="error" :columns="columns" row-key="inscription" :row-to="rowTo"
    :empty-title="filtered ? t('gsms.commun.aucunResultat') : t('gsms.evaluations.vide')"
    :empty-description="filtered ? t('gsms.commun.aucunResultatFiltres') : t('gsms.evaluations.videAide')" @retry="load">
    <template #toolbar>
      <t-select v-model="sessionId" clearable filterable :options="sessionOptions" class="filter"
        :placeholder="t('gsms.evaluations.filtres.session')" :aria-label="t('gsms.evaluations.filtres.session')" />
      <t-select v-model="programId" clearable filterable :options="programOptions" class="filter"
        :placeholder="t('gsms.evaluations.filtres.formation')" :aria-label="t('gsms.evaluations.filtres.formation')" />
      <t-select v-model="state" clearable :options="stateOptions" class="filter filter--short"
        :placeholder="t('gsms.evaluations.filtres.etat')" :aria-label="t('gsms.evaluations.filtres.etat')" />
      <t-select v-model="result" clearable :options="resultOptions" class="filter filter--short"
        :placeholder="t('gsms.evaluations.filtres.resultat')" :aria-label="t('gsms.evaluations.filtres.resultat')" />
      <t-input v-model="query" class="search" :placeholder="t('gsms.commun.rechercher')" :aria-label="t('gsms.commun.rechercher')" clearable>
        <template #prefix-icon><t-icon name="search" size="16px" /></template>
      </t-input>
    </template>
    <template #before>
      <GsmsRefusal v-if="sessionsError" :error="sessionsError" inline />
      <GsmsRefusal v-if="actionError" :error="actionError" inline />
      <div v-if="data" class="counters">
        <div v-for="group in COUNTER_GROUPS" :key="group" class="counter">
          <span class="counter-title">{{ t(`gsms.evaluations.compteurs.${group}`) }}</span>
          <span v-if="!Object.keys(data.compteurs[group]).length" class="muted">—</span>
          <span v-for="(n, code) in data.compteurs[group]" :key="code" class="chip">{{ resultLabel(String(code)) }} : {{ n }}</span>
        </div>
      </div>
    </template>

    <template #cell-stagiaire="{ row }">
      <router-link v-if="row.stagiaire_id" :to="`/platform/stagiaires/${row.stagiaire_id}`" class="person person-link" :title="row.stagiaire" @click.stop><GsmsPersonAvatar :name="row.stagiaire" :email="row.stagiaire_email" /><span class="person-name">{{ row.stagiaire }}</span></router-link>
      <span v-else class="person" :title="row.stagiaire"><GsmsPersonAvatar :name="row.stagiaire" /><span class="person-name">{{ row.stagiaire }}</span></span>
    </template>
    <template #cell-session="{ row }">
      <router-link :to="`/platform/sessions/${row.session.id}`" class="cell-link" @click.stop>{{ row.session.reference }}</router-link>
      <span class="muted block">{{ fmtDate(row.session.debut) }} → {{ fmtDate(row.session.fin) }}</span>
    </template>
    <template #cell-evaluations="{ row }">
      <GsmsStatusTag :code="row.evaluations.etat" />
      <span class="muted block">{{ stepText(row.evaluations) }}</span>
      <span v-for="a in row.evaluations.liste" :key="a.id" class="muted block">{{ assessmentText(a) }}</span>
    </template>
    <template #cell-attestation="{ row }">
      <GsmsStatusTag :code="row.attestation.etat" />
      <span class="muted block">{{ stepText(row.attestation) }}</span>
    </template>
    <template #cell-certification="{ row }">
      <GsmsStatusTag :code="row.certification.resultat" :label="resultLabel(row.certification.resultat)" />
      <span v-for="(x, i) in row.certification.epreuves" :key="i" class="muted block">{{ assessmentText(x) }}</span>
    </template>
    <template #cell-actions="{ row }">
      <div class="gates" @click.stop>
        <GsmsActionGate v-if="row.evaluations.action" :decision="row.evaluations.action" size="small"
          :pending="busy === `${row.inscription}:${row.evaluations.action.cle}`" @run="run(row, row.evaluations.action)">
          {{ row.evaluations.action.libelle }}
        </GsmsActionGate>
        <GsmsActionGate v-if="row.attestation.action" :decision="row.attestation.action" size="small"
          :pending="busy === `${row.inscription}:${row.attestation.action.cle}`" @run="run(row, row.attestation.action)">
          {{ row.attestation.action.libelle }}
        </GsmsActionGate>
      </div>
    </template>

    <template #card="{ item }">
      <div class="card">
        <div class="card-header">
          <router-link :to="rowTo(item)" class="card-header-left person"><GsmsPersonAvatar :name="item.stagiaire" :email="item.stagiaire_email" :size="40" /><span class="card-title">{{ item.stagiaire }}</span></router-link>
        </div>
        <dl class="steps">
          <div><dt>{{ t('gsms.evaluations.col.evaluations') }}</dt><dd><GsmsStatusTag :code="item.evaluations.etat" /> <span class="muted">{{ stepText(item.evaluations) }}</span></dd></div>
          <div v-for="a in item.evaluations.liste" :key="a.id"><dd class="muted">{{ assessmentText(a) }}</dd></div>
          <div><dt>{{ t('gsms.evaluations.col.attestation') }}</dt><dd><GsmsStatusTag :code="item.attestation.etat" /> <span class="muted">{{ stepText(item.attestation) }}</span></dd></div>
          <div><dt>{{ t('gsms.evaluations.col.certification') }}</dt><dd><GsmsStatusTag :code="item.certification.resultat" :label="resultLabel(item.certification.resultat)" /></dd></div>
        </dl>
        <div class="card-bottom">
          <div class="card-meta">
            <span><t-icon name="calendar-1" size="14px" />{{ item.session.reference }} · {{ fmtDate(item.session.debut) }}</span>
          </div>
          <div class="gates">
            <GsmsActionGate v-if="item.evaluations.action" :decision="item.evaluations.action" size="small"
              :pending="busy === `${item.inscription}:${item.evaluations.action.cle}`" @run="run(item, item.evaluations.action)">{{ item.evaluations.action.libelle }}</GsmsActionGate>
            <GsmsActionGate v-if="item.attestation.action" :decision="item.attestation.action" size="small"
              :pending="busy === `${item.inscription}:${item.attestation.action.cle}`" @run="run(item, item.attestation.action)">{{ item.attestation.action.libelle }}</GsmsActionGate>
          </div>
        </div>
      </div>
    </template>
  </GsmsListPage>

  <ActionDialog v-model:visible="dialog.visible" :title="dialog.title" :fields="dialog.fields"
    :run="(v) => journeyAction(dialog.enrollment, dialog.action, v)" @done="done" />
</template>

<script setup lang="ts">
/**
 * Évaluations des acquis et résultats (page 14) : GET /evaluations-acquis, filtres appliqués par l'API, compteurs de
 * l'API. Les actions (enregistrer une évaluation, émettre l'attestation) sont des décisions de l'API sur chaque ligne.
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { MessagePlugin } from 'tdesign-vue-next'
import GsmsListPage, { type ListColumn } from '@/components/gsms/GsmsListPage.vue'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import GsmsActionGate from '@/components/gsms/GsmsActionGate.vue'
import GsmsPersonAvatar from '@/components/gsms/GsmsPersonAvatar.vue'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import ActionDialog, { type ActionField } from '@/components/gsms/ActionDialog.vue'
import {
  ASSESSMENT_RESULTS, ASSESSMENT_STATES, getAssessments, journeyAction, type AssessmentRow, type Assessments,
} from '@/api/gsms/journey'
import { listSessions, type SessionRow } from '@/api/gsms/sessions'
import type { Capability } from '@/api/gsms/common'
import { fmtDate, stateLabel } from '@/components/gsms/format'

const COUNTER_GROUPS = ['evaluations', 'attestation', 'certification'] as const
const NUMBER_FIELDS = new Set(['note'])

const { t, te } = useI18n()
const data = ref<Assessments | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const actionError = ref<unknown>(null)
const busy = ref('')
const sessionId = ref('')
const programId = ref('')
const state = ref('')
const result = ref('')
const query = ref('')
const dialog = reactive<{ visible: boolean; title: string; action: string; enrollment: string; fields: ActionField[] }>(
  { visible: false, title: '', action: '', enrollment: '', fields: [] })

let seq = 0
async function load() {
  const n = ++seq
  loading.value = true
  error.value = null
  try {
    const res = await getAssessments({ session_id: sessionId.value || undefined, programme: programId.value || undefined,
      etat: state.value || undefined, resultat: result.value || undefined })
    if (n === seq) data.value = res
  } catch (e) {
    if (n === seq) { error.value = e; data.value = null }
  } finally {
    if (n === seq) loading.value = false
  }
}
watch([sessionId, programId, state, result], load, { immediate: true })

// Sessions et formations proposées aux filtres : la liste des sessions visibles (GET /sessions).
const sessions = ref<SessionRow[]>([])
const sessionsError = ref<unknown>(null)
onMounted(async () => {
  try { sessions.value = await listSessions() } catch (e) { sessionsError.value = e }
})
// Une session d'une autre formation ne reste pas sélectionnée quand la formation change.
watch(programId, (p) => {
  const current = sessions.value.find((s) => s.id === sessionId.value)
  if (p && current && current.program_id !== p) sessionId.value = ''
})
const sessionOptions = computed(() => sessions.value
  .filter((s) => !programId.value || s.program_id === programId.value)
  .map((s) => ({ value: s.id, label: `${s.reference} · ${fmtDate(s.start_date)}` })))
const programOptions = computed(() => {
  const map = new Map<string, string>()
  for (const s of sessions.value) map.set(s.program_id, s.program_title || s.program_code || s.program_id)
  return [...map.entries()].sort(([, a], [, b]) => a.localeCompare(b)).map(([value, label]) => ({ value, label }))
})
const stateOptions = computed(() => ASSESSMENT_STATES.map((s) => ({ value: s, label: stateLabel(s) })))
const resultOptions = computed(() => ASSESSMENT_RESULTS.map((r) => ({ value: r, label: resultLabel(r) })))
const resultLabel = (code: string) => (te(`gsms.evaluations.resultats.${code}`) ? t(`gsms.evaluations.resultats.${code}`) : stateLabel(code))

const filtered = computed(() => !!(sessionId.value || programId.value || state.value || result.value || query.value.trim()))
const rows = computed(() => {
  const q = query.value.trim().toLowerCase()
  return data.value?.lignes.filter((r) => !q || [r.stagiaire, r.session.reference, r.session.intitule, r.entreprise]
    .some((v) => v?.toLowerCase().includes(q))) ?? null
})

function stepText(step: { le: string | null; echeance: string | null; detail: string | null }): string {
  if (step.le) return [fmtDate(step.le), step.detail].filter(Boolean).join(' · ')
  return step.detail || (step.echeance ? t('gsms.parcours.echeanceLe', { date: fmtDate(step.echeance) }) : '')
}
function assessmentText(a: { intitule: string; le: string; note: number | null; reussi: boolean | null }): string {
  return [a.intitule, fmtDate(a.le), a.note ?? null,
    a.reussi === null ? null : t(a.reussi ? 'gsms.registres.reussie' : 'gsms.registres.nonReussie')].filter((v) => v !== null).join(' · ')
}

const columns = computed<ListColumn[]>(() => [
  { colKey: 'stagiaire', title: t('gsms.sessions.stagiaire'), width: 220 },
  { colKey: 'session', title: t('gsms.sessions.session'), width: 170 },
  { colKey: 'evaluations', title: t('gsms.evaluations.col.evaluations') },
  { colKey: 'attestation', title: t('gsms.evaluations.col.attestation'), width: 150 },
  { colKey: 'certification', title: t('gsms.evaluations.col.certification'), width: 170 },
  { colKey: 'actions', title: '', width: 220 },
])
const rowTo = (r: AssessmentRow) => `/platform/sessions/${r.session.id}/inscriptions/${r.inscription}`

async function run(row: AssessmentRow, cap: Capability & { cle: string }) {
  const inputs = cap.a_saisir ?? []
  if (inputs.length) {
    Object.assign(dialog, {
      action: cap.cle, enrollment: row.inscription, title: cap.libelle ?? cap.cle, visible: true,
      fields: inputs.map((f) => ({ name: f, type: f === 'date' ? 'date' : NUMBER_FIELDS.has(f) ? 'number' : undefined })),
    })
    return
  }
  busy.value = `${row.inscription}:${cap.cle}`
  actionError.value = null
  try {
    await journeyAction(row.inscription, cap.cle, {})
    await done()
  } catch (e) {
    actionError.value = e
  } finally {
    busy.value = ''
  }
}

async function done() {
  MessagePlugin.success(t('gsms.commun.misAJour'))
  await load()
}
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.search { .gsms-search(); }
.filter { width: 220px; max-width: 100%; &--short { width: 180px; } @media (max-width: 720px) { width: 100%; &--short { width: calc(50% - 6px); } } }
.card { .gsms-card(); .card-bottom { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; } }
.muted { .gsms-muted(); }
.block { display: block; }
.counters { display: flex; flex-wrap: wrap; gap: 8px 20px; margin: 0 0 12px; }
.counter { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-width: 0; }
.counter-title { color: var(--td-text-color-secondary); font-size: var(--app-text-xs); font-weight: 600; letter-spacing: 0.02em; text-transform: uppercase; }
.chip { .gsms-chip(); }
.gates { display: flex; flex-wrap: wrap; gap: 6px; }
.steps {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 8px 0;
  dt { color: var(--td-text-color-placeholder); font-size: var(--app-text-xs); line-height: 16px; }
  dd { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin: 2px 0 0; font-size: var(--app-text-sm); overflow-wrap: anywhere; }
}
.person { display: flex; align-items: center; gap: 10px; min-width: 0; color: inherit; text-decoration: none; }
.person-name { color: var(--td-text-color-primary); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cell-link { color: var(--td-text-color-primary); font-weight: 500; text-decoration: none; &:hover { color: var(--td-brand-color); } }
</style>
