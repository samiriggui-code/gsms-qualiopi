<template>
  <GsmsRecordSheet :title="title" icon="certificate" back="/platform/edof" :back-label="t('gsms.edof.titre')"
    :subtitle="dossier?.reminder || ''" :ready="!!dossier" :loading="loading" :error="error" :tabs="tabs" :tab="tab"
    @update:tab="(v) => (tab = v)" @retry="load">
    <template v-if="dossier" #status><GsmsStatusTag :code="dossier.display_status" :label="dossier.display_label" /></template>
    <template v-if="dossier" #before><GsmsRefusal v-if="actionError" :error="actionError" inline /></template>
    <template v-if="dossier" #side>
      <section class="side-section">
        <h3>{{ t('gsms.edof.suivi') }}</h3>
        <dl>
          <div v-if="dossier.program"><dt>{{ t('gsms.formations.colFormation') }}</dt>
            <dd><router-link :to="`/platform/formations/${dossier.program.id}`" class="link">{{ dossier.program.code }} · {{ dossier.program.title }}</router-link></dd></div>
          <div><dt>{{ t('gsms.edof.valideLe') }}</dt><dd>{{ dossier.validated_at ? t('gsms.formations.leParPar', { le: fmtDateTime(dossier.validated_at), par: dossier.validated_by || '—' }) : '—' }}</dd></div>
          <div><dt>{{ t('gsms.edof.deposeLe') }}</dt><dd>{{ dossier.submitted_on ? t('gsms.formations.leParPar', { le: fmtDate(dossier.submitted_on), par: dossier.submitted_by || '—' }) : '—' }}</dd></div>
          <div><dt>{{ t('gsms.edof.referenceCdc') }}</dt><dd>{{ dossier.cdc_reference || '—' }}</dd></div>
          <div><dt>{{ t('gsms.edof.decision') }}</dt><dd>{{ dossier.decision ? `${stateLabel(dossier.decision)} · ${fmtDate(dossier.decision_on)}` : '—' }}</dd></div>
          <div v-if="dossier.decision_note"><dt>{{ t('gsms.edof.noteDecision') }}</dt><dd>{{ dossier.decision_note }}</dd></div>
          <div><dt>{{ t('gsms.edof.referentiel') }}</dt><dd>{{ dossier.referentiel.version }}</dd></div>
        </dl>
      </section>
      <section class="side-section">
        <h3>{{ t('gsms.sessions.cycle') }}</h3>
        <div class="gates">
          <GsmsActionGate v-for="(label, action) in dossier.actions" :key="action" :decision="dossier.capabilities[action]" show-reason
            :variant="action === 'rouvrir' ? 'outline' : 'base'" :pending="busy === action" @run="run(String(action), label)">
            {{ label }}
          </GsmsActionGate>
        </div>
      </section>
    </template>

    <template v-if="dossier">
      <!-- Anomalies calculées par l'API, par niveau -->
      <section v-if="tab === 'anomalies'" class="panel">
        <p v-if="!dossier.anomalies.length" class="muted">{{ t('gsms.edof.aucuneAnomalie') }}</p>
        <template v-for="lvl in LEVELS" :key="lvl">
          <template v-if="byLevel(lvl).length">
            <h3 class="title">{{ t(`gsms.edof.niveaux.${lvl}`) }} <span class="chip">{{ byLevel(lvl).length }}</span></h3>
            <ul class="rows block">
              <li v-for="(a, i) in byLevel(lvl)" :key="`${a.code}-${i}`" class="row">
                <t-icon :name="lvl === 'BLOQUANT' ? 'error-circle' : lvl === 'A_VERIFIER' ? 'help-circle' : 'info-circle'" :class="`lvl lvl--${lvl}`" />
                <span class="row-main">{{ a.message }}<span v-if="a.detail" class="muted detail">{{ a.detail }}</span></span>
                <span class="muted">{{ a.controle === 'HUMAIN' ? t('gsms.edof.controleHumain') : t('gsms.edof.controleAuto') }}</span>
              </li>
            </ul>
          </template>
        </template>
      </section>

      <!-- Pièces exigées par le référentiel et leur état -->
      <section v-else-if="tab === 'pieces'" class="panel">
        <GsmsFilterTabs v-model="pieceFilter" :options="pieceTabs" :label="t('gsms.commun.filtrerEtat')" class="piece-tabs" />
        <ul class="rows">
          <li v-for="p in shownPieces" :key="p.code" class="piece">
            <div class="piece-head">
              <span class="row-main">{{ p.label }}</span>
              <GsmsStatusTag :code="p.state" />
            </div>
            <p class="muted">{{ p.stage_label }}<template v-if="p.conditions.length"> · {{ p.conditions.join(' ; ') }}</template><template v-if="p.sensitive"> · {{ t('gsms.edof.sensible') }}</template></p>
            <p v-if="p.provided_by" class="muted">{{ t('gsms.edof.fourniPar', { qui: p.provided_by }) }}</p>
            <div v-if="p.piece" class="deposit">
              <span v-if="p.piece.restricted" class="muted">{{ t('gsms.edof.pieceMasquee') }}</span>
              <template v-else-if="p.piece.document">
                <span class="muted">{{ p.piece.document.name }} · v{{ p.piece.document.version }} · {{ t('gsms.formations.leParPar', { le: fmtDateTime(p.piece.deposited_at), par: p.piece.deposited_by || '—' }) }}</span>
                <t-button v-if="p.piece.document.has_file" size="small" variant="text" theme="primary" :loading="busy === p.piece.id"
                  @click="download(p.piece.id, p.piece.document.name)"><t-icon name="download" />{{ t('gsms.commun.telecharger') }}</t-button>
              </template>
              <span v-if="p.piece.rejection_reason" class="muted">{{ t('gsms.edof.motifRejet', { motif: p.piece.rejection_reason }) }}</span>
            </div>
          </li>
        </ul>
      </section>

      <!-- Demandes de compléments et accompagnements -->
      <template v-else>
        <section class="panel">
          <h3 class="title">{{ t('gsms.edof.complements') }}</h3>
          <p v-if="!dossier.complements.length" class="muted">{{ t('gsms.edof.aucunComplement') }}</p>
          <ul v-else class="rows">
            <li v-for="c in dossier.complements" :key="c.id" class="row">
              <span class="row-main">{{ c.label }}</span>
              <span class="muted">{{ t('gsms.edof.demandeLe', { le: fmtDate(c.requested_on) }) }}<template v-if="c.due_on"> · {{ t('gsms.parcours.echeanceLe', { date: fmtDate(c.due_on) }) }}</template></span>
              <GsmsStatusTag :code="c.status" />
            </li>
          </ul>
        </section>
        <section class="panel">
          <h3 class="title">{{ t('gsms.edof.accompagnements') }}</h3>
          <p v-if="!dossier.accompaniments.length" class="muted">{{ t('gsms.edof.aucunAccompagnement') }}</p>
          <ul v-else class="rows">
            <li v-for="a in dossier.accompaniments" :key="a.id" class="row">
              <span class="row-main">{{ a.label }}</span>
              <span class="muted">{{ a.kind }}<template v-if="a.planned_on"> · {{ fmtDate(a.planned_on) }}</template><template v-if="a.participant"> · {{ a.participant }}</template></span>
              <GsmsStatusTag :code="a.done_on ? 'FAIT' : 'A_VENIR'" />
            </li>
          </ul>
        </section>
      </template>
    </template>
  </GsmsRecordSheet>

  <ActionDialog v-model:visible="dialog.visible" :title="dialog.title" :confirm-label="dialog.title" :fields="dialog.fields"
    :run="(v) => edofTransition(id, dialog.action, bodyOf(dialog.action, v))" @done="done" />
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { MessagePlugin } from 'tdesign-vue-next'
import GsmsRecordSheet from '@/components/gsms/GsmsRecordSheet.vue'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import GsmsActionGate from '@/components/gsms/GsmsActionGate.vue'
import GsmsFilterTabs from '@/components/gsms/GsmsFilterTabs.vue'
import ActionDialog, { type ActionField } from '@/components/gsms/ActionDialog.vue'
import { edofPieceContentPath, edofTransition, getEdofDossier, type EdofDossier } from '@/api/gsms/edof'
import { downloadFile } from '@/api/gsms/files'
import { fmtDate, fmtDateTime, stateLabel } from '@/components/gsms/format'

const LEVELS = ['BLOQUANT', 'A_VERIFIER', 'INFO'] as const
const TABS = ['anomalies', 'pieces', 'instruction']

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const id = computed(() => String(route.params.dossierId || ''))
const dossier = ref<EdofDossier | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const actionError = ref<unknown>(null)
const busy = ref('')
const tab = ref(TABS.includes(String(route.query.onglet)) ? String(route.query.onglet) : 'anomalies')
const pieceFilter = ref('all')
const dialog = reactive<{ visible: boolean; title: string; action: string; fields: ActionField[] }>({ visible: false, title: '', action: '', fields: [] })

const title = computed(() => {
  const d = dossier.value
  if (!d) return t('gsms.edof.dossier')
  return d.program ? t('gsms.edof.dossierDe', { nom: d.program.title }) : t('gsms.edof.dossierEtablissement')
})
const tabs = computed(() => [
  { value: 'anomalies', label: t('gsms.edof.ongletAnomalies'), count: dossier.value?.anomalies.length },
  { value: 'pieces', label: t('gsms.edof.ongletPieces'), count: dossier.value?.pieces.length },
  { value: 'instruction', label: t('gsms.edof.ongletInstruction'), count: dossier.value ? dossier.value.complements.length + dossier.value.accompaniments.length : undefined },
])
const byLevel = (lvl: string) => (dossier.value?.anomalies ?? []).filter((a) => a.niveau === lvl)
const pieceTabs = computed(() => {
  const list = dossier.value?.pieces ?? []
  const states = [...new Set(list.map((p) => p.state))]
  return [{ value: 'all', label: t('gsms.commun.toutes'), count: list.length },
    ...states.map((s) => ({ value: s, label: stateLabel(s), count: list.filter((p) => p.state === s).length }))]
})
const shownPieces = computed(() => (dossier.value?.pieces ?? []).filter((p) => pieceFilter.value === 'all' || p.state === pieceFilter.value))

/** Saisies attendues par la route de transition (corps TransitionIn) pour chaque action. */
const INPUTS: Record<string, () => ActionField[]> = {
  declarer_depot: () => [{ name: 'on', label: t('gsms.edof.dateDepot'), type: 'date' }, { name: 'reference', label: t('gsms.edof.referenceCdc') }],
  enregistrer_complements: () => [{ name: 'on', label: t('gsms.edof.dateDemande'), type: 'date' },
    { name: 'label', label: t('gsms.edof.complementDemande'), type: 'textarea' }, { name: 'due_on', label: t('gsms.edof.echeance'), type: 'date' }],
  enregistrer_decision: () => [{ name: 'decision', label: t('gsms.edof.decision'), type: 'radio',
    options: [{ value: 'ACCEPTEE', label: stateLabel('ACCEPTEE') }, { value: 'REFUSEE', label: stateLabel('REFUSEE') }] },
    { name: 'on', label: t('gsms.edof.dateDecision'), type: 'date' }, { name: 'note', label: t('gsms.edof.noteDecision'), type: 'textarea' }],
}

function bodyOf(action: string, v: Record<string, any>): Record<string, unknown> {
  if (action !== 'enregistrer_complements') return v
  const { label, due_on, ...rest } = v
  return { ...rest, items: label ? [{ label, due_on: due_on || null }] : [] }
}

async function load() {
  const did = id.value
  if (!did) return
  loading.value = true
  error.value = null
  try {
    const res = await getEdofDossier(did)
    if (did === id.value) dossier.value = res
  } catch (e) {
    if (did === id.value) { error.value = e; dossier.value = null }
  } finally {
    loading.value = false
  }
}
watch(id, () => { actionError.value = null; load() }, { immediate: true })
watch(tab, (v) => router.replace({ query: { ...route.query, onglet: v } }))

async function run(action: string, label: string) {
  const inputs = INPUTS[action]
  if (inputs) {
    Object.assign(dialog, { action, title: label, fields: inputs(), visible: true })
    return
  }
  busy.value = action
  actionError.value = null
  try {
    dossier.value = await edofTransition(id.value, action)
    MessagePlugin.success(t('gsms.commun.misAJour'))
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

async function download(pieceId: string, name: string) {
  busy.value = pieceId
  actionError.value = null
  try {
    await downloadFile(edofPieceContentPath(pieceId), name)
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
.panel { .gsms-panel(); display: flex; flex-direction: column; gap: 10px; }
.title { .gsms-panel-title(); margin: 0; display: flex; align-items: center; gap: 6px; }
.chip { .gsms-chip(); }
.muted { .gsms-muted(); margin: 0; }
.detail { display: block; }
.gates { display: flex; flex-direction: column; gap: 12px; }
.link { color: var(--td-brand-color); text-decoration: none; &:hover { text-decoration: underline; } }
.rows { .gsms-rows(); }
.row { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 12px; padding: 10px 14px; }
.row-main { flex: 1 1 160px; min-width: 0; color: var(--td-text-color-primary); font-size: var(--app-text-md); font-weight: 500; overflow-wrap: anywhere; }
.lvl { flex-shrink: 0; }
.lvl--BLOQUANT { color: var(--td-error-color); }
.lvl--A_VERIFIER { color: var(--td-warning-color); }
.lvl--INFO { color: var(--td-text-color-placeholder); }
.piece { display: flex; flex-direction: column; gap: 4px; padding: 10px 14px; }
.piece-head { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 12px; }
.deposit { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 12px; }
.piece-tabs { flex-wrap: wrap; }
</style>
