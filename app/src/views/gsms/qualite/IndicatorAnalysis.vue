<template>
  <section class="panel analysis">
    <p class="muted intro">{{ t('gsms.qualite.analyse.intro') }}</p>

    <form class="ask" @submit.prevent="run">
      <label class="ask-label" :for="questionId">{{ t('gsms.qualite.analyse.question') }}</label>
      <t-textarea :id="questionId" v-model="question" :maxlength="MAX_QUESTION" :autosize="{ minRows: 2, maxRows: 6 }"
        :placeholder="t('gsms.qualite.analyse.questionAide')" :disabled="running" />
      <t-checkbox v-model="analyseIa" :disabled="running">{{ t('gsms.qualite.analyse.demanderIa') }}</t-checkbox>
      <p class="muted ask-help">{{ t('gsms.qualite.analyse.demanderIaAide') }}</p>
      <div class="ask-actions">
        <span v-if="running && sentWithIa" class="muted" role="status">{{ t('gsms.qualite.analyse.enCoursIa') }}</span>
        <t-button type="submit" theme="primary" :loading="running">
          <template #icon><t-icon name="search" /></template>
          {{ t('gsms.qualite.analyse.lancer') }}
        </t-button>
      </div>
    </form>

    <GsmsRefusal v-if="error" :error="error" inline />

    <!-- Propositions de l'IA encore sans décision, toutes analyses confondues, pour cet indicateur. -->
    <div class="block block--attente">
      <h3><t-icon name="time" /> {{ t('gsms.qualite.analyse.enAttenteTitre') }}</h3>
      <GsmsRefusal v-if="pendingError" :error="pendingError" inline />
      <p v-else-if="pendingLoading && !pending.length" class="muted">{{ t('gsms.qualite.analyse.chargement') }}</p>
      <p v-else-if="!pending.length" class="muted">{{ t('gsms.qualite.analyse.aucuneEnAttente') }}</p>
      <IaProposalCard v-for="p in pending" :key="p.id" :proposal="p" :can-decide="canDecide" :labels="labels" @decide="(d) => openDecision(p.id, d)" />
    </div>

    <div v-if="result" class="result" aria-live="polite">
      <p class="notice"><t-icon name="info-circle" size="14px" /> {{ result.avertissement }}</p>

      <!-- 1. Moteur Qualiopi : rappel seulement, le détail est dans les autres onglets. -->
      <div class="block block--moteur">
        <h3><t-icon name="chart-bar" /> {{ t('gsms.qualite.analyse.moteurTitre') }}</h3>
        <p class="line"><GsmsStatusTag :code="result.moteur.etat" /> <span>{{ t('gsms.qualite.analyse.moteurFaitFoi') }}</span></p>
      </div>

      <div v-if="result.erreurs.length" class="block block--erreur" role="alert">
        <h3><t-icon name="error-circle" /> {{ t('gsms.qualite.analyse.erreursTitre') }}</h3>
        <ul class="plain">
          <li v-for="(e, i) in result.erreurs" :key="i"><strong>{{ e.etape }}</strong> : {{ e.message }}</li>
        </ul>
        <p v-if="result.recherche.statut === 'ERREUR_TECHNIQUE'" class="muted">{{ t('gsms.qualite.analyse.moteurResteValable') }}</p>
      </div>

      <!-- 2. Textes retrouvés par la recherche documentaire. -->
      <div class="block block--textes">
        <h3><t-icon name="file" /> {{ t('gsms.qualite.analyse.textesTitre') }}</h3>
        <p class="line"><GsmsStatusTag :code="result.recherche.statut" :label="searchLabel" /></p>
        <p v-if="result.recherche.motif" class="muted">{{ result.recherche.motif }}</p>
        <p v-if="result.recherche.passages_rejetes" class="muted">{{ t('gsms.qualite.analyse.rejetes', { n: result.recherche.passages_rejetes }) }}</p>
        <p v-if="result.recherche.resumes_generes_ecartes" class="muted">{{ t('gsms.qualite.analyse.resumesEcartes', { n: result.recherche.resumes_generes_ecartes }) }}</p>
        <div v-for="g in groups" :key="g.base" class="group">
          <h4>{{ baseLabel(g.base) }} <span class="count">{{ g.references.length }}</span></h4>
          <article v-for="r in g.references" :id="passageAnchor(r.passage_id)" :key="r.passage_id" class="passage" tabindex="-1">
            <header>
              <span class="passage-ref">{{ labels.get(r.passage_id) }}</span>
              <strong class="passage-title">{{ r.titre }}</strong>
              <span v-if="r.version_document" class="chip">{{ t('gsms.qualite.analyse.version', { v: r.version_document }) }}</span>
            </header>
            <p class="passage-caveat"><t-icon name="info-circle" size="12px" /> {{ t('gsms.qualite.analyse.pasUnePreuve') }}</p>
            <blockquote class="excerpt">{{ r.extrait }}<template v-if="r.extrait_tronque"> …</template></blockquote>
            <p v-if="r.extrait_tronque" class="muted">{{ t('gsms.qualite.analyse.extraitTronque') }}</p>
          </article>
        </div>
      </div>

      <!-- 3. Analyse par l'IA : propositions, jamais des décisions. -->
      <div class="block block--ia">
        <h3><t-icon name="lightbulb" /> {{ t('gsms.qualite.analyse.iaTitre') }}</h3>
        <ul v-if="result.controles_non_executes.length" class="plain not-run">
          <li v-for="c in result.controles_non_executes" :key="c.controle">
            <t-tag size="small" variant="light" theme="default">{{ t('gsms.qualite.analyse.nonFait') }}</t-tag>
            <span><strong>{{ c.controle }}</strong> : {{ c.motif }}</span>
          </li>
        </ul>
        <p v-else-if="!result.observations_ia.length && !result.propositions.length" class="muted">{{ t('gsms.qualite.analyse.iaRien') }}</p>

        <template v-if="result.observations_ia.length">
          <h4>{{ t('gsms.qualite.analyse.observationsTitre') }} <span class="count">{{ result.observations_ia.length }}</span></h4>
          <article v-for="(o, i) in result.observations_ia" :key="i" class="observation">
            <header>
              <t-tag size="small" variant="light" :theme="o.nature === 'contradiction' ? 'danger' : o.nature === 'constat' ? 'default' : 'warning'">{{ natureLabel(o.nature) }}</t-tag>
              <span class="caveat"><t-icon name="lightbulb" size="12px" /> {{ observationStatus(o.statut) }}</span>
            </header>
            <p class="obs-text">{{ o.texte }}</p>
            <IaCitedPassages :passages="o.passages" :labels="labels" />
          </article>
        </template>

        <template v-if="result.propositions.length">
          <h4>{{ t('gsms.qualite.analyse.propositionsTitre') }} <span class="count">{{ result.propositions.length }}</span></h4>
          <p class="muted">{{ t('gsms.qualite.analyse.accepteeNapplique') }}</p>
          <IaProposalCard v-for="p in result.propositions" :key="p.id" :proposal="p" :can-decide="canDecide" :labels="labels" @decide="(d) => openDecision(p.id, d)" />
        </template>

        <p class="line validation">
          <span>{{ t('gsms.qualite.analyse.validation') }}</span>
          <GsmsStatusTag :code="result.validation_humaine.statut" :label="validationLabel" />
        </p>
      </div>

      <p class="trace muted">{{ t('gsms.qualite.analyse.trace', { id: result.correlation_id, le: fmtDateTime(result.cree_le), ms: result.duree_ms }) }}</p>
    </div>

    <ActionDialog v-model:visible="decision.visible" :title="decision.kind === 'REJETEE' ? t('gsms.qualite.analyse.rejeterTitre') : t('gsms.qualite.analyse.accepterTitre')"
      :confirm-label="decision.kind === 'REJETEE' ? t('gsms.qualite.analyse.rejeter') : t('gsms.qualite.analyse.accepter')"
      :intro="decision.kind === 'REJETEE' ? t('gsms.qualite.analyse.rejeterAide') : t('gsms.qualite.analyse.accepterAide')"
      :fields="decisionFields" :run="sendDecision" @done="decided" />
  </section>
</template>

<script setup lang="ts">
/**
 * Onglet « Analyse documentaire » de la fiche indicateur (droit `ia.use`, vérifié par la fiche) : appelle
 * POST /ia/analyses et affiche sa réponse telle quelle, en séparant l'état du moteur Qualiopi (qui fait foi), les
 * passages retrouvés (des textes, pas des preuves) et l'analyse par l'IA (des propositions, jamais des décisions).
 * Les décisions sur les propositions sont prises par une personne (`quality.write`) et rendues par l'API.
 */
import { computed, onMounted, reactive, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ActionDialog, { type ActionField } from '@/components/gsms/ActionDialog.vue'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import { analyseIndicator, decideAIProposal, listAIProposals, type AIProposalRow, type IndicatorAnalysis } from '@/api/gsms/qualite'
import { fmtDateTime, stateLabel } from '@/components/gsms/format'
import { useGsmsAccessStore } from '@/stores/gsmsAccess'
import IaCitedPassages from './IaCitedPassages.vue'
import IaProposalCard from './IaProposalCard.vue'
import { cleanQuestion, groupReferencesByBase, passageAnchor, referenceLabels, withDecision } from './indicatorAnalysis'

const MAX_QUESTION = 500

const props = defineProps<{ number: number }>()
const { t, te } = useI18n()
const access = useGsmsAccessStore()
const canDecide = computed(() => access.can('quality.write'))
const questionId = useId()
const question = ref('')
const analyseIa = ref(false)
const sentWithIa = ref(false)
const running = ref(false)
const error = ref<unknown>(null)
const result = ref<IndicatorAnalysis | null>(null)

const references = computed(() => result.value?.recherche.references ?? [])
const groups = computed(() => groupReferencesByBase(references.value))
const labels = computed(() => referenceLabels(references.value))

function knownLabel(prefix: string, code: string | null | undefined): string {
  const key = `gsms.qualite.analyse.${prefix}.${code}`
  return code && te(key) ? t(key) : stateLabel(code)
}
const searchLabel = computed(() => knownLabel('statuts', result.value?.recherche.statut))
const validationLabel = computed(() => knownLabel('validations', result.value?.validation_humaine.statut))
const baseLabel = (base: string) => knownLabel('bases', base)
const natureLabel = (nature: string) => knownLabel('natures', nature)
const observationStatus = (statut: string) => knownLabel('observationStatuts', statut)

// ── Propositions en attente pour cet indicateur ──
const pending = ref<AIProposalRow[]>([])
const pendingError = ref<unknown>(null)
const pendingLoading = ref(false)

async function loadPending() {
  const asked = props.number
  pendingLoading.value = true
  try {
    const rows = await listAIProposals({ statut: 'PROPOSEE', indicateur: asked })
    if (asked !== props.number) return
    pending.value = rows
    pendingError.value = null
  } catch (e) {
    if (asked !== props.number) return
    pendingError.value = e
    pending.value = []
  } finally {
    pendingLoading.value = false
  }
}
onMounted(loadPending)

// Changement de fiche : l'analyse affichée ne concerne plus l'indicateur ouvert.
watch(() => props.number, () => {
  result.value = null
  error.value = null
  pending.value = []
  loadPending()
})

async function run() {
  if (running.value) return
  const asked = props.number
  running.value = true
  sentWithIa.value = analyseIa.value
  error.value = null
  try {
    const res = await analyseIndicator({ indicateur: asked, question: cleanQuestion(question.value, MAX_QUESTION), analyse_ia: analyseIa.value })
    if (asked !== props.number) return
    result.value = res
    if (res.propositions.length) loadPending()
  } catch (e) {
    if (asked !== props.number) return
    error.value = e
    result.value = null
  } finally {
    running.value = false
  }
}

// ── Décision humaine sur une proposition ──
const decision = reactive<{ visible: boolean; id: string; kind: 'ACCEPTEE' | 'REJETEE' }>({ visible: false, id: '', kind: 'ACCEPTEE' })
const decisionFields = computed<ActionField[]>(() => [{
  name: 'motif',
  type: 'textarea',
  label: decision.kind === 'REJETEE' ? t('gsms.qualite.analyse.motifRejet') : t('gsms.qualite.analyse.commentaireFacultatif'),
  required: decision.kind === 'REJETEE',
  maxlength: 1000,
}])

function openDecision(id: string, kind: 'ACCEPTEE' | 'REJETEE') {
  Object.assign(decision, { visible: true, id, kind })
}

function sendDecision(values: Record<string, any>) {
  const motif = typeof values.motif === 'string' ? values.motif.trim() : ''
  return decideAIProposal(decision.id, { decision: decision.kind, motif: motif || null })
}

function decided(row: unknown) {
  const r = row as AIProposalRow
  if (result.value) result.value = { ...result.value, propositions: withDecision(result.value.propositions, r) }
  loadPending()
}
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.panel { .gsms-panel(); }
.muted { .gsms-muted(); margin: 2px 0 4px; }
.notice { .gsms-notice(); }
.plain { .gsms-plain(); }
.intro { margin: 0 0 10px; }
.ask { display: flex; flex-direction: column; align-items: stretch; gap: 6px; margin-bottom: 14px; }
.ask-label { font-size: var(--app-text-sm); font-weight: 500; }
.ask-help { margin: 0 0 0 24px; }
.ask-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; }
.result { display: flex; flex-direction: column; gap: 12px; min-width: 0; margin-top: 12px; }
.block {
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--td-component-stroke);
  border-left-width: 4px;
  border-radius: var(--app-radius-sm);
  h3 { display: flex; align-items: center; gap: 6px; margin: 0 0 8px; font-size: var(--app-text-md); font-weight: 600; }
  h4 { margin: 10px 0 6px; font-size: var(--app-text-sm); font-weight: 600; }
  &--attente { border-left-color: var(--td-warning-color); }
  &--moteur { border-left-color: var(--td-brand-color); }
  &--textes { border-left-color: var(--td-gray-color-6); }
  &--ia { border-left-color: var(--td-warning-color); background: var(--td-warning-color-light); }
  &--erreur { border-left-color: var(--td-error-color); h3 { color: var(--td-error-color); } }
}
.line { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0 0 6px; font-size: var(--app-text-sm); }
.validation { margin-top: 10px; }
.group { margin-top: 10px; }
.count { color: var(--td-text-color-secondary); font-weight: 400; }
.passage, .observation {
  margin-bottom: 10px;
  padding: 8px 10px;
  border-radius: var(--app-radius-sm);
  header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; }
}
.passage { background: var(--td-bg-color-secondarycontainer); &:focus-visible, &:focus { outline: 2px solid var(--td-brand-color); outline-offset: 1px; } }
.observation { background: var(--td-bg-color-container); border: 1px solid var(--td-component-stroke); }
.passage-ref { font-size: var(--app-text-xs); font-weight: 600; color: var(--td-text-color-secondary); font-variant-numeric: tabular-nums; }
.passage-title { font-size: var(--app-text-sm); overflow-wrap: anywhere; }
.chip { .gsms-chip(); }
.passage-caveat { display: flex; align-items: center; gap: 4px; margin: 4px 0; font-size: var(--app-text-xs); color: var(--td-text-color-secondary); font-style: italic; }
.caveat { display: inline-flex; align-items: center; gap: 4px; font-size: var(--app-text-xs); color: var(--td-text-color-primary); font-style: italic; .t-icon { color: var(--td-warning-color); } }
.obs-text { margin: 4px 0 0; font-size: var(--app-text-sm); line-height: 20px; white-space: pre-line; overflow-wrap: anywhere; }
.excerpt {
  margin: 4px 0 0;
  padding-left: 8px;
  border-left: 2px solid var(--td-component-stroke);
  white-space: pre-line;
  overflow-wrap: anywhere;
  font-size: var(--app-text-sm);
  line-height: 20px;
  color: var(--td-text-color-secondary);
}
.not-run li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; line-height: 20px; margin-bottom: 4px; }
.trace { margin: 0; overflow-wrap: anywhere; }
</style>
