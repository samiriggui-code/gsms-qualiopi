<template>
  <section class="panel analysis">
    <p class="muted intro">{{ t('gsms.qualite.analyse.intro') }}</p>

    <form class="ask" @submit.prevent="run">
      <label class="ask-label" :for="questionId">{{ t('gsms.qualite.analyse.question') }}</label>
      <t-textarea :id="questionId" v-model="question" :maxlength="MAX_QUESTION" :autosize="{ minRows: 2, maxRows: 6 }"
        :placeholder="t('gsms.qualite.analyse.questionAide')" :disabled="running" />
      <div class="ask-actions">
        <t-button type="submit" theme="primary" :loading="running">
          <template #icon><t-icon name="search" /></template>
          {{ t('gsms.qualite.analyse.lancer') }}
        </t-button>
      </div>
    </form>

    <GsmsRefusal v-if="error" :error="error" inline />

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
          <article v-for="r in g.references" :key="r.passage_id" class="passage">
            <header>
              <strong class="passage-title">{{ r.titre }}</strong>
              <span v-if="r.version_document" class="chip">{{ t('gsms.qualite.analyse.version', { v: r.version_document }) }}</span>
            </header>
            <p class="passage-caveat"><t-icon name="info-circle" size="12px" /> {{ t('gsms.qualite.analyse.pasUnePreuve') }}</p>
            <blockquote class="excerpt">{{ r.extrait }}<template v-if="r.extrait_tronque"> …</template></blockquote>
            <p v-if="r.extrait_tronque" class="muted">{{ t('gsms.qualite.analyse.extraitTronque') }}</p>
          </article>
        </div>
      </div>

      <!-- 3. Analyse par l'IA : rien n'est généré dans cette version du contrat, on le dit. -->
      <div class="block block--ia">
        <h3><t-icon name="lightbulb" /> {{ t('gsms.qualite.analyse.iaTitre') }}</h3>
        <p v-if="!result.observations_ia.length && !result.propositions.length" class="muted">{{ t('gsms.qualite.analyse.iaAucune') }}</p>
        <p v-else class="muted">{{ t('gsms.qualite.analyse.iaNonAffichees', { n: result.observations_ia.length + result.propositions.length }) }}</p>
        <ul v-if="result.controles_non_executes.length" class="plain not-run">
          <li v-for="c in result.controles_non_executes" :key="c.controle">
            <t-tag size="small" variant="light" theme="default">{{ t('gsms.qualite.analyse.nonFait') }}</t-tag>
            <span><strong>{{ c.controle }}</strong> : {{ c.motif }}</span>
          </li>
        </ul>
        <p class="line">
          <span>{{ t('gsms.qualite.analyse.validation') }}</span>
          <GsmsStatusTag :code="result.validation_humaine.statut" :label="validationLabel" />
        </p>
      </div>

      <p class="trace muted">{{ t('gsms.qualite.analyse.trace', { id: result.correlation_id, le: fmtDateTime(result.cree_le), ms: result.duree_ms }) }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * Onglet « Analyse documentaire » de la fiche indicateur (droit `ia.use`, vérifié par la fiche) : appelle
 * POST /ia/analyses et affiche sa réponse telle quelle, en séparant l'état du moteur Qualiopi (qui fait foi), les
 * passages retrouvés (des textes, pas des preuves) et l'analyse par l'IA (non faite dans cette version du contrat).
 */
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import { analyseIndicator, type IndicatorAnalysis } from '@/api/gsms/qualite'
import { fmtDateTime, stateLabel } from '@/components/gsms/format'
import { cleanQuestion, groupReferencesByBase } from './indicatorAnalysis'

const MAX_QUESTION = 500

const props = defineProps<{ number: number }>()
const { t, te } = useI18n()
const questionId = useId()
const question = ref('')
const running = ref(false)
const error = ref<unknown>(null)
const result = ref<IndicatorAnalysis | null>(null)

const groups = computed(() => groupReferencesByBase(result.value?.recherche.references ?? []))

function knownLabel(prefix: string, code: string | null | undefined): string {
  const key = `gsms.qualite.analyse.${prefix}.${code}`
  return code && te(key) ? t(key) : stateLabel(code)
}
const searchLabel = computed(() => knownLabel('statuts', result.value?.recherche.statut))
const validationLabel = computed(() => knownLabel('validations', result.value?.validation_humaine.statut))
const baseLabel = (base: string) => knownLabel('bases', base)

// Changement de fiche : l'analyse affichée ne concerne plus l'indicateur ouvert.
watch(() => props.number, () => {
  result.value = null
  error.value = null
})

async function run() {
  if (running.value) return
  const asked = props.number
  running.value = true
  error.value = null
  try {
    const res = await analyseIndicator({ indicateur: asked, question: cleanQuestion(question.value, MAX_QUESTION) })
    if (asked !== props.number) return
    result.value = res
  } catch (e) {
    if (asked !== props.number) return
    error.value = e
    result.value = null
  } finally {
    running.value = false
  }
}
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.panel { .gsms-panel(); }
.muted { .gsms-muted(); margin: 2px 0 4px; }
.notice { .gsms-notice(); }
.plain { .gsms-plain(); }
.intro { margin: 0 0 10px; }
.ask { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.ask-label { font-size: var(--app-text-sm); font-weight: 500; }
.ask-actions { display: flex; justify-content: flex-end; }
.result { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.block {
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--td-component-stroke);
  border-left-width: 4px;
  border-radius: var(--app-radius-sm);
  h3 { display: flex; align-items: center; gap: 6px; margin: 0 0 8px; font-size: var(--app-text-md); font-weight: 600; }
  &--moteur { border-left-color: var(--td-brand-color); }
  &--textes { border-left-color: var(--td-gray-color-6); }
  &--ia { border-left-color: var(--td-warning-color); background: var(--td-warning-color-light); }
  &--erreur { border-left-color: var(--td-error-color); h3 { color: var(--td-error-color); } }
}
.line { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0 0 6px; font-size: var(--app-text-sm); }
.group { margin-top: 10px; h4 { margin: 0 0 6px; font-size: var(--app-text-sm); font-weight: 600; } }
.count { color: var(--td-text-color-secondary); font-weight: 400; }
.passage {
  margin-bottom: 10px;
  padding: 8px 10px;
  border-radius: var(--app-radius-sm);
  background: var(--td-bg-color-secondarycontainer);
  header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; }
}
.passage-title { font-size: var(--app-text-sm); overflow-wrap: anywhere; }
.chip { .gsms-chip(); }
.passage-caveat { display: flex; align-items: center; gap: 4px; margin: 4px 0; font-size: var(--app-text-xs); color: var(--td-text-color-secondary); font-style: italic; }
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
