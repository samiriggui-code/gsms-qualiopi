<template>
  <t-dialog :visible="visible" :header="title" :confirm-btn="{ content: confirmLabel || t('gsms.commun.enregistrer'), loading: submitting, theme: danger ? 'danger' : 'primary' }"
    :cancel-btn="{ content: t('gsms.commun.annuler') }" :close-on-overlay-click="!submitting" width="min(520px, calc(100vw - 32px))"
    attach="body" destroy-on-close @confirm="submit" @close="close" @cancel="close">
    <div class="action-dialog">
      <p v-if="intro" class="action-dialog__intro">{{ intro }}</p>
      <GsmsRefusal v-if="error" :error="error" inline />
      <t-form label-align="top" :data="values" @submit.prevent>
        <t-form-item v-for="f in normalizedFields" :key="f.name" :label="f.label" :name="f.name">
          <t-date-picker v-if="f.type === 'date'" v-model="values[f.name]" value-type="YYYY-MM-DD" format="DD/MM/YYYY"
            clearable style="width: 100%" />
          <t-textarea v-else-if="f.type === 'textarea'" v-model="values[f.name]" :autosize="{ minRows: 3, maxRows: 8 }" />
          <t-input-number v-else-if="f.type === 'number'" v-model="values[f.name]" theme="normal" style="width: 100%" />
          <t-select v-else-if="f.type === 'select'" v-model="values[f.name]" :options="f.options" clearable />
          <t-radio-group v-else-if="f.type === 'radio'" v-model="values[f.name]" class="action-dialog__radios">
            <t-radio v-for="o in f.options" :key="String(o.value)" :value="o.value">{{ o.label }}</t-radio>
          </t-radio-group>
          <t-input v-else v-model="values[f.name]" />
        </t-form-item>
      </t-form>
      <slot />
    </div>
  </t-dialog>
</template>

<script setup lang="ts">
/**
 * Formulaire d'action générique : les champs sont ceux que l'API demande (`a_saisir`) ou que la route attend ;
 * aucune règle n'est vérifiée ici, l'API répond (refus motivé ou saisie incomplète) et le message s'affiche.
 */
import { computed, reactive, ref, watch } from 'vue'
import GsmsRefusal from './GsmsRefusal.vue'
import { useI18n } from 'vue-i18n'
import { inputLabel } from './format'

export interface ActionField {
  name: string
  label?: string
  type?: 'text' | 'textarea' | 'date' | 'number' | 'select' | 'radio'
  options?: { label: string; value: string | number }[]
  initial?: unknown
}

const props = withDefaults(defineProps<{
  visible: boolean
  title: string
  fields?: (ActionField | string)[]
  confirmLabel?: string
  intro?: string
  danger?: boolean
  run: (values: Record<string, any>) => Promise<unknown>
}>(), { fields: () => [], confirmLabel: '', intro: '', danger: false })
const emit = defineEmits<{ 'update:visible': [boolean]; done: [unknown] }>()
const { t } = useI18n()

const TEXTAREAS = new Set(['motif', 'synthese', 'conclusion', 'commentaire', 'plan', 'cause', 'message'])

const normalizedFields = computed<ActionField[]>(() => props.fields.map((f) => {
  const field = typeof f === 'string' ? { name: f } : f
  const type = field.type ?? (field.name === 'date' ? 'date' : TEXTAREAS.has(field.name) ? 'textarea' : 'text')
  return { ...field, type, label: field.label ?? inputLabel(field.name) }
}))

const values = reactive<Record<string, any>>({})
const error = ref<unknown>(null)
const submitting = ref(false)

watch(() => props.visible, (v) => {
  if (!v) return
  error.value = null
  for (const k of Object.keys(values)) delete values[k]
  for (const f of normalizedFields.value) values[f.name] = f.initial ?? (f.type === 'number' ? undefined : '')
}, { immediate: true })

function close() {
  if (!submitting.value) emit('update:visible', false)
}

async function submit() {
  submitting.value = true
  error.value = null
  try {
    const payload: Record<string, any> = {}
    for (const f of normalizedFields.value) {
      const v = values[f.name]
      if (v !== '' && v !== undefined && v !== null) payload[f.name] = v
      // Valeur présente à l'ouverture puis effacée : on l'envoie vide (modification d'une fiche existante).
      else if (f.initial !== undefined && f.initial !== null && f.initial !== '') payload[f.name] = null
    }
    const result = await props.run(payload)
    emit('done', result)
    emit('update:visible', false)
  } catch (e) {
    error.value = e
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped lang="less">
.action-dialog__intro {
  margin: 0 0 12px;
  color: var(--td-text-color-secondary);
  font-size: var(--app-text-md);
  line-height: 20px;
}
.action-dialog__radios { display: flex; flex-wrap: wrap; gap: 8px 16px; }
</style>
