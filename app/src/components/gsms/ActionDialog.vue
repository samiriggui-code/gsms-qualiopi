<template>
  <t-dialog :visible="visible" :close-on-overlay-click="!submitting && !danger" :close-on-esc-keydown="!submitting"
    :width="fullScreen ? undefined : dialogWidth" :mode="fullScreen ? 'full-screen' : 'modal'" placement="center" attach="body" destroy-on-close
    :dialog-class-name="`gsms-action-dialog${danger ? ' gsms-action-dialog--danger' : ''}`" @close="close">
    <template #header>
      <div class="ad-head">
        <span class="ad-head__icon" :class="{ 'is-danger': danger }" aria-hidden="true"><t-icon :name="headIcon" /></span>
        <span class="ad-head__title">{{ title }}</span>
      </div>
    </template>
    <div class="action-dialog">
      <p v-if="intro" class="action-dialog__intro">{{ intro }}</p>
      <div v-if="danger" class="ad-warning" role="note">
        <t-icon name="error-triangle" class="ad-warning__icon" aria-hidden="true" />
        <div>
          <strong class="ad-warning__title">{{ t('gsms.critique.attention') }}</strong>
          <p class="ad-warning__text">{{ consequence || t('gsms.critique.consequenceDefaut') }}</p>
        </div>
      </div>
      <div ref="refusalBox"><GsmsRefusal v-if="error" :error="error" inline /></div>
      <t-form v-if="normalizedFields.length" label-align="top" :data="values" class="ad-fields" :class="{ 'ad-fields--grouped': grouped }" @submit.prevent>
        <component :is="g.section ? 'fieldset' : 'div'" v-for="(g, gi) in groups" :key="gi" class="ad-group">
          <legend v-if="g.section" class="ad-group__title">{{ g.section }}</legend>
          <div class="ad-grid">
            <template v-for="f in g.fields" :key="f.name">
              <t-form-item v-if="shown(f)" :label="f.label" :name="f.name" :required-mark="isRequired(f)" :help="f.help"
                :class="{ 'ad-half': f.half, 'ad-quarter': f.quarter, 'ad-full': !f.half && !f.quarter }">
                <t-date-picker v-if="f.type === 'date'" v-model="values[f.name]" value-type="YYYY-MM-DD" format="DD/MM/YYYY"
                  :placeholder="f.placeholder || t('gsms.commun.formatDate')" clearable style="width: 100%" />
                <t-textarea v-else-if="f.type === 'textarea'" v-model="values[f.name]" :maxlength="f.maxlength" :placeholder="f.placeholder ?? ''" :autosize="{ minRows: 2, maxRows: 10 }" />
                <t-input-number v-else-if="f.type === 'number'" v-model="values[f.name]" theme="normal" style="width: 100%" />
                <t-select v-else-if="f.type === 'select'" v-model="values[f.name]" :options="f.options" clearable
                  :placeholder="f.placeholder || t('gsms.commun.choisir')" />
                <t-radio-group v-else-if="f.type === 'radio'" v-model="values[f.name]" class="action-dialog__radios">
                  <t-radio v-for="o in f.options" :key="String(o.value)" :value="o.value">{{ o.label }}</t-radio>
                </t-radio-group>
                <t-switch v-else-if="f.type === 'switch'" v-model="values[f.name]" />
                <t-checkbox-group v-else-if="f.type === 'checkboxes'" v-model="values[f.name]" class="action-dialog__radios"
                  :options="f.options as any" />
                <GsmsPhotoField v-else-if="f.type === 'photo'" v-model="values[f.name]" :name="photoName(f)" :library="f.library" :square="f.square"
                  @busy="(b: boolean) => (photoBusy[f.name] = b)" />
                <t-input v-else v-model="values[f.name]" :maxlength="f.maxlength" :placeholder="f.placeholder ?? ''"
                  :type="f.inputType" :autocomplete="f.autocomplete" />
              </t-form-item>
            </template>
          </div>
        </component>
      </t-form>
      <slot />
      <div v-if="confirmText" class="ad-retype">
        <label :for="retypeId" class="ad-retype__label">
          {{ t('gsms.critique.ressaisir') }} <strong class="ad-retype__expected">{{ confirmText }}</strong>
        </label>
        <t-input :id="retypeId" v-model="typed" :status="typed && !typedOk ? 'error' : 'default'" autocomplete="off" spellcheck="false"
          :aria-describedby="`${retypeId}-hint`" />
        <span :id="`${retypeId}-hint`" class="ad-retype__hint">{{ t('gsms.critique.ressaisirAide') }}</span>
      </div>
    </div>
    <template #footer>
      <div class="ad-foot">
        <t-button variant="outline" :disabled="submitting" @click="close">{{ danger ? t('gsms.critique.renoncer') : t('gsms.commun.annuler') }}</t-button>
        <t-button :theme="danger ? 'danger' : 'primary'" :loading="submitting" :disabled="!typedOk || uploading" @click="submit">
          {{ confirmLabel || t('gsms.commun.enregistrer') }}
        </t-button>
      </div>
    </template>
  </t-dialog>
</template>

<script setup lang="ts">
/**
 * Formulaire d'action générique : les champs sont ceux que l'API demande (`a_saisir`) ou que la route attend ;
 * aucune règle n'est vérifiée ici, l'API répond (refus motivé ou saisie incomplète) et le message s'affiche.
 *
 * `danger` en fait une confirmation critique : bandeau d'avertissement (conséquence fournie par l'API ou texte fixe
 * sobre), bouton rouge, ressaisie facultative d'une référence (`confirmText`) et sons discrets désactivables
 * (avertissement à l'ouverture, succès ou erreur après l'opération ; jamais seuls porteurs de l'information).
 * Plein écran sous 480 px, pied de dialogue toujours visible.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import GsmsRefusal from './GsmsRefusal.vue'
import GsmsPhotoField from './GsmsPhotoField.vue'
import { ApiError } from '@/api/gsms/http'
import { useI18n } from 'vue-i18n'
import { inputLabel } from './format'
import { playSound } from './feedbackSound'

export interface ActionField {
  name: string
  label?: string
  /** `photo` : GsmsPhotoField (chemin de la médiathèque) ; `switch` : booléen. */
  type?: 'text' | 'textarea' | 'date' | 'number' | 'select' | 'radio' | 'switch' | 'photo' | 'checkboxes'
  options?: { label: string; value: string | number | boolean }[]
  initial?: unknown
  /**
   * Saisie indispensable à la route : un champ vide n'est pas envoyé, le formulaire le signale. Une fonction suit les
   * autres saisies (ex. fonction affichée si la personne est présentée sur le site) ; c'est un confort, l'API tranche.
   */
  required?: boolean | ((values: Record<string, any>) => boolean)
  /** Groupe du formulaire (titre de section) ; les champs consécutifs du même groupe sont réunis. */
  section?: string
  /** Demi-largeur à partir de 600 px (deux champs par ligne). */
  half?: boolean
  /** Quart de largeur dans un formulaire large (quatre petits champs par ligne : durée, tarif, date…). */
  quarter?: boolean
  help?: string
  placeholder?: string
  maxlength?: number
  inputType?: 'text' | 'email' | 'tel' | 'url'
  autocomplete?: string
  /** Champ affiché selon les autres saisies ; masqué, il est envoyé vide s'il avait une valeur à l'ouverture. */
  show?: (values: Record<string, any>) => boolean
  /** Champ photo : noms des champs qui donnent les initiales de l'aperçu (ex. prénom et nom). */
  avatarFrom?: string[]
  /** Champ photo : choix de la médiathèque et aperçu carré (vignette, logo). */
  library?: readonly string[]
  square?: boolean
}

const props = withDefaults(defineProps<{
  visible: boolean
  title: string
  fields?: (ActionField | string)[]
  confirmLabel?: string
  intro?: string
  danger?: boolean
  /** Conséquence rappelée dans le bandeau (texte de l'API s'il existe, sinon texte fixe exact). */
  consequence?: string
  /** Référence à ressaisir avant de confirmer (opérations les plus graves). */
  confirmText?: string
  icon?: string
  width?: string
  run: (values: Record<string, any>) => Promise<unknown>
}>(), { fields: () => [], confirmLabel: '', intro: '', danger: false, consequence: '', confirmText: '', icon: '',
  width: '' })
const emit = defineEmits<{ 'update:visible': [boolean]; done: [unknown] }>()
const { t } = useI18n()

const TEXTAREAS = new Set(['motif', 'synthese', 'conclusion', 'commentaire', 'plan', 'cause', 'message'])

const normalizedFields = computed<ActionField[]>(() => props.fields.map((f) => {
  const field = typeof f === 'string' ? { name: f } : f
  const type = field.type ?? (field.name === 'date' ? 'date' : TEXTAREAS.has(field.name) ? 'textarea' : 'text')
  return { ...field, type, label: field.label ?? inputLabel(field.name) }
}))

// Groupes consécutifs (titre de section) ; un formulaire sans section garde son rendu d'une seule colonne.
const grouped = computed(() => normalizedFields.value.some((f) => f.section))
const groups = computed(() => {
  const out: { section: string; fields: ActionField[] }[] = []
  for (const f of normalizedFields.value) {
    const last = out[out.length - 1]
    if (last && last.section === (f.section ?? '')) last.fields.push(f)
    else out.push({ section: f.section ?? '', fields: [f] })
  }
  return out
})
// Formulaire à sections : large (sections en ligne, titre à gauche) ; sinon étroit. Une largeur donnée l'emporte.
const dialogWidth = computed(() => props.width
  || (grouped.value ? 'min(1080px, calc(100vw - 32px))' : 'min(560px, calc(100vw - 32px))'))
const shown = (f: ActionField) => !f.show || f.show(values)
const isRequired = (f: ActionField) => shown(f) && (typeof f.required === 'function' ? f.required(values) : !!f.required)
const photoName = (f: ActionField) => (f.avatarFrom ?? []).map((n) => values[n]).filter(Boolean).join(' ') || null
// Téléversement en cours, par champ photo : l'enregistrement attend que toutes les photos aient leur chemin.
const photoBusy = reactive<Record<string, boolean>>({})
const uploading = computed(() => Object.values(photoBusy).some(Boolean))

/** Refus de validation (422) : les noms de champs de l'API deviennent les libellés du formulaire. */
function readable(e: unknown): unknown {
  if (!(e instanceof ApiError) || e.status !== 422) return e
  const labels = new Map(normalizedFields.value.map((f) => [f.name, (f.label ?? f.name).replace(/\s*\*$/, '')]))
  const message = e.message.split(' ; ').map((part) => {
    const m = /^([a-z_]+)(?:\.[^ ]+)? : (.*)$/.exec(part)
    const label = m && labels.get(m[1]!)
    if (!label) return part
    // « code postal : 5 chiffres attendus » : le libellé n'est pas répété s'il ouvre déjà le message de l'API.
    let text = m![2]!.replace(/^Value error, /, '')
    if (text.toLowerCase().startsWith(`${label.toLowerCase()} : `)) text = text.slice(label.length + 3)
    return `${label} : ${text}`
  }).join(' ; ')
  return new ApiError(e.status, message, e.code, e.details)
}

const headIcon = computed(() => props.icon || (props.danger ? 'error-circle' : 'edit-1'))
const values = reactive<Record<string, any>>({})
const error = ref<unknown>(null)
const refusalBox = ref<HTMLElement | null>(null)
const submitting = ref(false)
const typed = ref('')
const retypeId = `ad-retype-${Math.random().toString(36).slice(2, 9)}`
const norm = (s: string) => s.normalize('NFC').trim().toLowerCase()
const typedOk = computed(() => !props.confirmText || norm(typed.value) === norm(props.confirmText))

// Plein écran sur téléphone (< 480 px).
const narrow = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(max-width: 479.98px)') : null
const fullScreen = ref(!!narrow?.matches)
const onNarrow = (e: MediaQueryListEvent) => { fullScreen.value = e.matches }
onMounted(() => narrow?.addEventListener?.('change', onNarrow))
onBeforeUnmount(() => narrow?.removeEventListener?.('change', onNarrow))

watch(() => props.visible, (v) => {
  if (!v) return
  error.value = null
  typed.value = ''
  for (const k of Object.keys(values)) delete values[k]
  for (const k of Object.keys(photoBusy)) delete photoBusy[k]
  for (const f of normalizedFields.value) {
    values[f.name] = f.initial ?? (f.type === 'number' ? undefined : f.type === 'switch' ? false : f.type === 'photo' ? null
      : f.type === 'checkboxes' ? [] : '')
  }
  if (props.danger) playSound('warning')
}, { immediate: true })

function close() {
  if (!submitting.value) emit('update:visible', false)
}

async function submit() {
  if (!typedOk.value || submitting.value || uploading.value) return
  submitting.value = true
  error.value = null
  try {
    const missing = normalizedFields.value.filter((f) => isRequired(f) && [undefined, null, ''].includes(values[f.name]))
    if (missing.length) throw new Error(t('gsms.commun.champsRequis', { champs: missing.map((f) => f.label).join(', ') }))
    const payload: Record<string, any> = {}
    for (const f of normalizedFields.value) {
      const v = shown(f) ? values[f.name] : undefined
      if (v !== '' && v !== undefined && v !== null) payload[f.name] = v
      // Valeur présente à l'ouverture puis effacée : on l'envoie vide (modification d'une fiche existante).
      else if (f.initial !== undefined && f.initial !== null && f.initial !== '') payload[f.name] = null
    }
    const result = await props.run(payload)
    if (props.danger) playSound('success')
    emit('done', result)
    emit('update:visible', false)
  } catch (e) {
    error.value = readable(e)
    if (props.danger) playSound('error')
    // Sur téléphone le formulaire défile : le motif du refus doit être vu, pas resté en haut hors de l'écran.
    void nextTick(() => refusalBox.value?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped lang="less">
.ad-head { display: flex; align-items: center; gap: 10px; min-width: 0; }
.ad-head__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--td-bg-color-secondarycontainer);
  color: var(--td-text-color-secondary);
  font-size: var(--app-text-xl);
  &.is-danger { background: var(--td-error-color-light); color: var(--td-error-color); }
}
.ad-head__title { min-width: 0; font-size: var(--app-text-lg); font-weight: 600; line-height: 22px; overflow-wrap: anywhere; }
.action-dialog__intro {
  margin: 0 0 12px;
  color: var(--td-text-color-secondary);
  font-size: var(--app-text-md);
  line-height: 20px;
}
.ad-warning {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin: 0 0 14px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--td-error-color) 35%, transparent);
  border-left-width: 4px;
  border-radius: var(--app-radius-sm);
  background: var(--td-error-color-light);
  color: var(--td-text-color-primary);
}
.ad-warning__icon { flex-shrink: 0; margin-top: 2px; color: var(--td-error-color); font-size: var(--app-text-xl); }
.ad-warning__title { display: block; font-size: var(--app-text-md); line-height: 20px; }
.ad-warning__text { margin: 2px 0 0; font-size: var(--app-text-md); line-height: 20px; overflow-wrap: anywhere; }
.ad-fields {
  padding: 12px 14px 2px;
  border: 1px solid var(--td-component-stroke);
  border-radius: var(--app-radius-md);
  background: var(--td-bg-color-secondarycontainer);
  :deep(.t-form__item) { margin-bottom: 12px; }
}
.ad-retype {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 14px;
}
.ad-retype__label { color: var(--td-text-color-primary); font-size: var(--app-text-md); line-height: 20px; }
.ad-retype__expected { font-family: var(--app-font-family-mono); font-variant-numeric: tabular-nums; user-select: all; }
.ad-retype__hint { color: var(--td-text-color-secondary); font-size: var(--app-text-xs); line-height: 16px; }
.ad-group { min-width: 0; margin: 0; padding: 0; border: 0; }
.ad-group + .ad-group { margin-top: 4px; padding-top: 14px; border-top: 1px solid var(--td-component-stroke); }
// Titre flottant : la légende ne coupe plus la bordure du groupe (rendu natif d'un fieldset).
.ad-group__title {
  float: left;
  width: 100%;
  margin: 0 0 10px;
  padding: 0;
  color: var(--td-text-color-primary);
  font-size: var(--app-text-md);
  font-weight: 600;
  line-height: 20px;
}
.ad-grid { clear: both; display: grid; grid-template-columns: minmax(0, 1fr); column-gap: 14px; }
@media (min-width: 600px) {
  .ad-fields--grouped .ad-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ad-fields--grouped .ad-full { grid-column: 1 / -1; }
}
// Formulaire à sections, en largeur : chaque section sur une ligne, titre dans une colonne à gauche, champs à droite.
.ad-fields--grouped {
  container-type: inline-size;
  padding: 0;
  border: 0;
  background: none;
  .ad-group + .ad-group { margin-top: 0; padding-top: 20px; }
  .ad-group { padding-bottom: 8px; }
}
@container (min-width: 760px) {
  .ad-fields--grouped .ad-group { display: grid; grid-template-columns: 168px minmax(0, 1fr); column-gap: 28px; }
  // Titre collé en haut pendant le défilement : on sait toujours dans quelle section on saisit.
  .ad-fields--grouped .ad-group__title {
    grid-column: 1; align-self: start; position: sticky; top: 0; width: auto; margin: 0; padding-top: 2px;
    color: var(--td-text-color-primary);
  }
  .ad-fields--grouped .ad-grid { grid-column: 2; clear: none; grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .ad-fields--grouped .ad-quarter { grid-column: span 1; }
  .ad-fields--grouped .ad-half { grid-column: span 2; }
  .ad-fields--grouped .ad-full { grid-column: 1 / -1; }
}
.action-dialog__radios { display: flex; flex-wrap: wrap; gap: 8px 16px; }
.ad-foot { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
</style>

<style lang="less">
// Dialogue (téléporté sous <body>) : corps qui défile, pied toujours visible ; plein écran sur téléphone.
.gsms-action-dialog {
  max-height: calc(100dvh - 48px);
  display: flex;
  flex-direction: column;
  .t-dialog__header { flex-shrink: 0; }
  .t-dialog__body { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
  .t-dialog__footer { flex-shrink: 0; border-top: 1px solid var(--td-component-stroke); padding-top: 12px; }
  &.t-dialog--fullscreen, &.t-dialog__fullscreen {
    max-height: none;
    .t-dialog__footer { padding-bottom: calc(12px + env(safe-area-inset-bottom)); }
    .ad-foot .t-button { flex: 1 1 0; }
  }
}
</style>
