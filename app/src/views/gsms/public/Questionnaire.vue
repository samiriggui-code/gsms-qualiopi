<template>
  <PublicLinkPage :page-title="t('gsms.public.questionnaire.titrePage')" :organisme="data?.organisme"
                  :loading="loading" :error="loadError" :closed-title="t('gsms.public.questionnaire.ferme')" :retry="load">
    <template v-if="data">
      <p class="public-small q-context">{{ data.formation }} · {{ period(data.session.debut, data.session.fin) }}</p>

      <section v-if="state === 'merci' || state === 'ferme'" class="public-card">
        <h1 ref="doneTitle" class="public-title" tabindex="-1">
          <t-icon v-if="state === 'merci'" name="check-circle-filled" class="public-ok" aria-hidden="true" />
          {{ state === 'merci' ? t('gsms.public.questionnaire.merci') : t('gsms.public.questionnaire.ferme') }}
        </h1>
        <p class="public-text">{{ state === 'merci' ? t('gsms.public.questionnaire.merciTexte') : closedText }}</p>
      </section>

      <form v-else class="q-form" novalidate @submit.prevent="submit">
        <section class="q-intro">
          <h1 class="public-title">{{ data.questionnaire.titre }}</h1>
          <p v-if="data.pour" class="q-hello">{{ t('gsms.public.questionnaire.bonjour', { prenom: data.pour }) }}</p>
          <p v-if="data.questionnaire.introduction" class="public-text">{{ data.questionnaire.introduction }}</p>
          <p class="public-small">
            {{ t('gsms.public.questionnaire.obligatoires') }}
            {{ t('gsms.public.questionnaire.expire', { date: longDate(data.expire_le) }) }}
          </p>
        </section>

        <div v-if="message" ref="summary" class="public-alert" role="alert" tabindex="-1">
          <p class="q-alert-title">{{ message }}</p>
          <ul v-if="errorList.length" class="q-alert-list">
            <li v-for="e in errorList" :key="e.id">
              <a :href="`#q-${e.id}`" @click.prevent="focusQuestion(e.id)">{{ t('gsms.public.questionnaire.questionN', { n: e.n }) }}</a>
              : {{ e.message }}
            </li>
          </ul>
        </div>

        <section class="public-card q-questions">
          <div v-for="(q, i) in shown" :key="q.id" class="q-item" :data-question="q.id">
            <!-- Texte libre -->
            <template v-if="q.type === 'texte'">
              <label :for="`q-${q.id}`" class="q-label">
                <span class="q-num">{{ i + 1 }}.</span> {{ q.libelle }}
                <span v-if="q.requis" class="q-req" aria-hidden="true"> *</span>
                <span v-else class="q-opt"> {{ t('gsms.public.questionnaire.facultatif') }}</span>
              </label>
              <p v-if="q.aide" :id="`q-${q.id}-aide`" class="public-small q-help">{{ q.aide }}</p>
              <textarea :id="`q-${q.id}`" class="q-textarea" rows="3" maxlength="4000"
                        :value="typeof answers[q.id] === 'string' ? (answers[q.id] as string) : ''"
                        :aria-describedby="describedBy(q.id, q.aide)" :aria-invalid="errors[q.id] ? 'true' : undefined"
                        :aria-required="q.requis ? 'true' : undefined"
                        @input="change(q.id, ($event.target as HTMLTextAreaElement).value)" />
              <p v-if="errors[q.id]" :id="`q-${q.id}-erreur`" class="q-error">{{ errors[q.id] }}</p>
            </template>

            <!-- Choix, note de 1 à 5, oui / non -->
            <fieldset v-else :id="`q-${q.id}`" class="q-fieldset" tabindex="-1"
                      :aria-describedby="describedBy(q.id, q.aide)" :aria-invalid="errors[q.id] ? 'true' : undefined">
              <legend class="q-label">
                <span class="q-num">{{ i + 1 }}.</span> {{ q.libelle }}
                <span v-if="q.requis" class="q-req" aria-hidden="true"> *</span>
                <span v-if="q.requis" class="sr-only"> ({{ t('gsms.public.questionnaire.obligatoire') }})</span>
                <span v-else class="q-opt"> {{ t('gsms.public.questionnaire.facultatif') }}</span>
              </legend>
              <p v-if="q.aide" :id="`q-${q.id}-aide`" class="public-small q-help">{{ q.aide }}</p>
              <div class="q-choices" :class="`q-choices--${q.type}`">
                <label v-for="opt in choicesOf(q)" :key="String(opt.value)" class="q-choice"
                       :class="{ 'is-checked': answers[q.id] === opt.value }">
                  <input type="radio" :name="`q-${q.id}`" :checked="answers[q.id] === opt.value"
                         :required="q.requis || undefined" @change="change(q.id, opt.value)" />
                  <span>{{ opt.label }}</span>
                </label>
              </div>
              <p v-if="errors[q.id]" :id="`q-${q.id}-erreur`" class="q-error">{{ errors[q.id] }}</p>
            </fieldset>
          </div>
        </section>

        <div class="q-actions">
          <p class="public-small">{{ t('gsms.public.questionnaire.uneSeuleReponse') }}</p>
          <button type="submit" class="public-btn" :disabled="state === 'envoi'">
            {{ state === 'envoi' ? t('gsms.public.questionnaire.envoi') : t('gsms.public.questionnaire.envoyer') }}
          </button>
        </div>
      </form>
    </template>
  </PublicLinkPage>
</template>

<script setup lang="ts">
/**
 * Questionnaire envoyé au stagiaire ou à l'entreprise (`/q/{jeton}`) : lien personnel, sans compte.
 * GET/POST /api/v1/public/questionnaires/{jeton} ; l'API contrôle les réponses et ferme le lien (410).
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import PublicLinkPage from '@/components/gsms/PublicLinkPage.vue'
import { answerPublicQuestionnaire, getPublicQuestionnaire, type AnswerValue, type PublicQuestion, type PublicQuestionnaire } from '@/api/gsms/public'
import {
  answersToSend, isShown, longDate, missingRequired, period, publicError, questionErrors,
  type Answers, type PublicError,
} from './publicLinks'

const { t } = useI18n()
const route = useRoute()
const jeton = computed(() => String(route.params.jeton || ''))

const data = ref<PublicQuestionnaire | null>(null)
const loading = ref(true)
const loadError = ref<PublicError | null>(null)
const answers = ref<Answers>({})
const errors = ref<Record<string, string>>({})
const message = ref<string | null>(null)
const closedText = ref('')
const state = ref<'saisie' | 'envoi' | 'merci' | 'ferme'>('saisie')
const summary = ref<HTMLElement | null>(null)
const doneTitle = ref<HTMLElement | null>(null)

const shown = computed(() => (data.value?.questionnaire.questions ?? []).filter((q) => isShown(q, answers.value)))
const errorList = computed(() => shown.value
  .map((q, i) => ({ id: q.id, n: i + 1, message: errors.value[q.id] }))
  .filter((e) => e.message))

async function load() {
  loading.value = true
  loadError.value = null
  try {
    data.value = await getPublicQuestionnaire(jeton.value)
  } catch (err) {
    loadError.value = publicError(err)
  } finally {
    loading.value = false
  }
}
onMounted(load)

function choicesOf(q: PublicQuestion): { value: AnswerValue; label: string }[] {
  if (q.type === 'note') return [1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))
  if (q.type === 'oui_non') {
    return [{ value: true, label: t('gsms.public.questionnaire.oui') }, { value: false, label: t('gsms.public.questionnaire.non') }]
  }
  return (q.options ?? []).map((o) => ({ value: o, label: o }))
}

function describedBy(id: string, aide?: string | null): string | undefined {
  return [aide ? `q-${id}-aide` : '', errors.value[id] ? `q-${id}-erreur` : ''].filter(Boolean).join(' ') || undefined
}

function change(id: string, v: AnswerValue) {
  answers.value = { ...answers.value, [id]: v }
  if (errors.value[id]) {
    const rest = { ...errors.value }
    delete rest[id]
    errors.value = rest
  }
}

function showErrors(found: Record<string, string>, text: string) {
  errors.value = found
  message.value = text
  nextTick(() => summary.value?.focus())
}

function focusQuestion(id: string) {
  const el = document.getElementById(`q-${id}`)
  el?.scrollIntoView({ block: 'center' })
  const input = el?.matches('textarea') ? el : el?.querySelector<HTMLElement>('input')
  ;(input ?? el)?.focus()
}

async function submit() {
  const missing = missingRequired(shown.value, answers.value)
  if (missing.length) {
    showErrors(Object.fromEntries(missing.map((id) => [id, t('gsms.public.questionnaire.reponseObligatoire')])),
      t('gsms.public.questionnaire.aCompleter'))
    return
  }
  state.value = 'envoi'
  try {
    await answerPublicQuestionnaire(jeton.value, answersToSend(shown.value, answers.value))
    state.value = 'merci'
  } catch (err) {
    const e = publicError(err)
    if (e.kind === 'ferme') {
      closedText.value = e.detail || t('gsms.public.commun.erreurs.ferme.texte')
      state.value = 'ferme'
      return
    }
    state.value = 'saisie'
    const status = (err as { status?: number }).status
    if (status === 422) {
      showErrors(questionErrors((err as { details?: unknown }).details), e.detail || t('gsms.public.questionnaire.aCompleter'))
    } else if (e.kind === 'limite') {
      showErrors({}, e.detail || t('gsms.public.commun.erreurs.limite.texte'))
    } else {
      showErrors({}, t('gsms.public.questionnaire.echecEnvoi'))
    }
  }
}

watch(state, async (s) => {
  if (s !== 'merci' && s !== 'ferme') return
  await nextTick()
  doneTitle.value?.focus()
})
</script>

<style scoped>
.q-context {
  margin: -8px 0 0;
}

.q-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.q-intro {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.q-intro .public-small {
  margin: 8px 0 0;
}

.q-hello {
  margin: 8px 0 0;
}

.q-alert-title {
  margin: 0;
  font-weight: 700;
}

.q-alert-list {
  margin: 6px 0 0;
  padding-left: 20px;
}

.q-alert-list a {
  font-weight: 700;
  text-decoration: underline;
}

.q-questions {
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.q-item {
  min-width: 0;
}

.q-fieldset {
  margin: 0;
  padding: 0;
  border: 0;
  min-width: 0;
  outline: none;
}

.q-label {
  display: block;
  padding: 0;
  margin-bottom: 8px;
  font-weight: 700;
  line-height: 1.4;
}

.q-num {
  color: var(--td-text-color-secondary);
  font-variant-numeric: tabular-nums;
}

.q-req {
  color: var(--td-error-color-7);
}

.q-opt {
  font-weight: 400;
  color: var(--td-text-color-secondary);
}

.q-help {
  margin: -4px 0 8px;
}

.q-textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 96px;
  padding: 10px 12px;
  border: 1px solid var(--td-component-border);
  border-radius: var(--app-radius-md);
  background: var(--td-bg-color-container);
  color: inherit;
  font: inherit;
  font-size: var(--app-text-xl); /* 16 px : pas de zoom automatique sur iPhone */
  resize: vertical;
}

.q-textarea:focus-visible {
  outline: 3px solid var(--td-brand-color);
  outline-offset: 1px;
  border-color: var(--td-brand-color);
}

.q-textarea[aria-invalid='true'] {
  border-color: var(--td-error-color-7);
}

.q-choices {
  display: grid;
  gap: 8px;
}

.q-choices--note {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.q-choices--oui_non {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  max-width: 320px;
}

@media (min-width: 600px) {
  .q-choices--choix {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.q-choice {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  padding: 8px 12px;
  border: 1px solid var(--td-component-border);
  border-radius: var(--app-radius-md);
  background: var(--td-bg-color-container);
  cursor: pointer;
  overflow-wrap: anywhere;
}

.q-choice:hover {
  background: var(--td-bg-color-container-hover);
}

.q-choice.is-checked {
  border-color: var(--td-brand-color);
  background: var(--td-brand-color-light);
  font-weight: 700;
}

.q-choice input {
  flex: none;
  width: 18px;
  height: 18px;
  margin: 0;
  accent-color: var(--td-brand-color);
}

.q-choice:has(input:focus-visible) {
  outline: 3px solid var(--td-brand-color);
  outline-offset: 2px;
}

/* Notes : le chiffre seul, centré ; le bouton radio reste accessible au clavier et aux lecteurs d'écran. */
.q-choices--note .q-choice {
  justify-content: center;
  padding: 8px 0;
  font-size: var(--app-text-2xl);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.q-choices--note .q-choice input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
}

.q-fieldset[aria-invalid='true'] .q-choice {
  border-color: var(--td-error-color-7);
}

.q-error {
  margin: 6px 0 0;
  font-size: var(--app-text-base);
  font-weight: 700;
  color: var(--td-error-color-8);
}

.q-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.q-actions .public-small {
  margin: 0;
}

.q-actions .public-btn {
  width: 100%;
}

@media (min-width: 600px) {
  .q-actions {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }

  .q-actions .public-btn {
    width: auto;
  }
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
