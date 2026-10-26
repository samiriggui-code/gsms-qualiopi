<template>
  <!-- Champ généré à partir du schéma JSON renvoyé par GET /settings (types Pydantic du backend). -->
  <div class="schema-field">
    <t-input :placeholder="t('gsms.parametres.commun.nonRenseigne')" v-if="kind === 'const'" :value="String(s.const)" disabled />

    <t-select :placeholder="t('gsms.parametres.commun.choisir')" v-else-if="kind === 'enum'" :value="modelValue as any" :options="enumOptions" :disabled="disabled"
      @change="(v: any) => emit('update:modelValue', v)" />

    <t-switch v-else-if="kind === 'boolean'" :value="Boolean(modelValue)" :disabled="disabled"
      @change="(v: any) => emit('update:modelValue', Boolean(v))" />

    <t-input-number placeholder=" " v-else-if="kind === 'number'" :value="modelValue as number" :min="s.minimum" :max="s.maximum"
      :decimal-places="isInteger ? 0 : undefined" :step="isInteger ? 1 : 0.1" :disabled="disabled" theme="normal"
      @change="(v: any) => emit('update:modelValue', v === '' || v === undefined ? null : Number(v))" />

    <t-color-picker v-else-if="kind === 'color'" :value="(modelValue as string) || '#000000'" format="HEX"
      :color-modes="['monochrome']" :show-primary-color-preview="false" :disabled="disabled"
      @change="(v: any) => emit('update:modelValue', String(v).slice(0, 7))" />

    <t-textarea :placeholder="t('gsms.parametres.commun.nonRenseigne')" v-else-if="kind === 'longtext'" :value="(modelValue as string) ?? ''" :maxlength="s.maxLength"
      :autosize="{ minRows: 3, maxRows: 8 }" :disabled="disabled"
      @change="(v: any) => emit('update:modelValue', String(v))" />

    <t-input v-else-if="kind === 'text' || kind === 'time'" :value="(modelValue as string) ?? ''"
      :maxlength="s.maxLength" :placeholder="kind === 'time' ? 'HH:MM:SS' : t('gsms.parametres.commun.nonRenseigne')" :disabled="disabled"
      @change="(v: any) => emit('update:modelValue', String(v))" />

    <t-checkbox-group v-else-if="kind === 'enum-list'" :value="(modelValue as any[]) ?? []" :disabled="disabled"
      :options="itemEnumOptions" @change="(v: any) => emit('update:modelValue', v)" />

    <t-tag-input v-else-if="kind === 'string-list'" :value="(modelValue as string[]) ?? []" clearable
      :placeholder="t('gsms.parametres.reglages.saisirEntree')" :disabled="disabled" @change="(v: any) => emit('update:modelValue', v)" />

    <div v-else-if="kind === 'object-list'" class="object-list">
      <div v-for="(row, i) in rows" :key="i" class="object-row">
        <div v-for="(prop, name) in itemProps" :key="name" class="object-cell">
          <span class="object-label">{{ prop.title || name }}</span>
          <SchemaField :schema="prop" :root="rootSchema" :model-value="row[name]" :disabled="disabled"
            @update:model-value="(v: unknown) => setCell(i, String(name), v)" />
        </div>
        <t-button v-if="!disabled" variant="text" theme="danger" size="small" @click="removeRow(i)">{{ t('gsms.parametres.reglages.retirer') }}</t-button>
      </div>
      <t-button v-if="!disabled" variant="outline" size="small" @click="addRow">{{ t('gsms.parametres.reglages.ajouterLigne') }}</t-button>
    </div>

    <t-textarea :placeholder="t('gsms.parametres.commun.nonRenseigne')" v-else :value="jsonText" :autosize="{ minRows: 3, maxRows: 10 }" :disabled="disabled"
      @change="onJson" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { JsonSchema } from '@/api/gsms/platform'

defineOptions({ name: 'SchemaField' })

const { t } = useI18n()

const props = defineProps<{
  schema: JsonSchema
  modelValue: unknown
  disabled?: boolean
  /** Schéma racine (pour résoudre les `$ref` vers `$defs`). */
  root?: JsonSchema
}>()
const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>()

const rootSchema = computed(() => props.root ?? props.schema)

function resolve(s: JsonSchema | undefined): JsonSchema {
  if (!s) return {}
  if (s.$ref?.startsWith('#/$defs/')) {
    const name = s.$ref.slice('#/$defs/'.length)
    return rootSchema.value.$defs?.[name] ?? {}
  }
  if (s.anyOf) {
    const notNull = s.anyOf.find((a) => a.type !== 'null')
    if (notNull) return resolve(notNull)
  }
  return s
}

const s = computed(() => resolve(props.schema))
const typeOf = (x: JsonSchema) => (Array.isArray(x.type) ? x.type.find((t) => t !== 'null') : x.type)
const isInteger = computed(() => typeOf(s.value) === 'integer')
const item = computed(() => resolve(s.value.items))
const itemProps = computed(() => item.value.properties ?? {})

const kind = computed(() => {
  const x = s.value
  if (x.const !== undefined) return 'const'
  if (x.enum) return 'enum'
  const type = typeOf(x)
  if (type === 'boolean') return 'boolean'
  if (type === 'integer' || type === 'number') return 'number'
  if (type === 'string') {
    if (x.format === 'time') return 'time'
    if (x.pattern === '^#[0-9a-fA-F]{6}$') return 'color'
    return (x.maxLength ?? 0) > 300 ? 'longtext' : 'text'
  }
  if (type === 'array') {
    if (item.value.enum) return 'enum-list'
    if (typeOf(item.value) === 'string') return 'string-list'
    if (typeOf(item.value) === 'object' && item.value.properties) return 'object-list'
  }
  return 'json'
})

const enumOptions = computed(() => (s.value.enum ?? []).map((v) => ({ label: String(v), value: v as any })))
const itemEnumOptions = computed(() => (item.value.enum ?? []).map((v) => ({ label: String(v), value: v as any })))

const rows = computed(() => (Array.isArray(props.modelValue) ? (props.modelValue as Record<string, unknown>[]) : []))
function setCell(i: number, name: string, v: unknown) {
  const next = rows.value.map((r, j) => (j === i ? { ...r, [name]: v } : r))
  emit('update:modelValue', next)
}
function addRow() {
  const blank = Object.fromEntries(Object.keys(itemProps.value).map((k) => [k, null]))
  emit('update:modelValue', [...rows.value, blank])
}
function removeRow(i: number) {
  emit('update:modelValue', rows.value.filter((_, j) => j !== i))
}

const jsonText = computed(() => JSON.stringify(props.modelValue, null, 2))
function onJson(v: unknown) {
  try {
    emit('update:modelValue', JSON.parse(String(v)))
  } catch {
    /* JSON incomplet : l'API refusera la valeur et dira pourquoi */
  }
}
</script>

<style lang="less" scoped>
.schema-field {
  width: 100%;
  min-width: 0;
}

.object-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.object-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--td-component-stroke);
  border-radius: var(--app-radius-md);
}

.object-cell {
  display: flex;
  flex: 1 1 140px;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.object-label {
  color: var(--td-text-color-secondary);
  font-size: var(--app-text-sm);
}
</style>
