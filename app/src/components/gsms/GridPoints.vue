<template>
  <div class="grid-points">
    <p v-if="title" class="grid-title">{{ title }}</p>
    <div v-for="p in points" :key="p.code" class="point">
      <p class="question">
        {{ p.question }}
        <span v-if="p.exigence" class="chip">{{ exigenceLabel(p.exigence) }}</span>
      </p>
      <t-radio-group :value="modelValue[p.code]" variant="default-filled" size="small" :disabled="disabled"
        @change="(v: unknown) => emit('update:modelValue', { ...modelValue, [p.code]: String(v) })">
        <t-radio-button value="OUI">{{ t('gsms.grille.oui') }}</t-radio-button>
        <t-radio-button value="NON">{{ t('gsms.grille.non') }}</t-radio-button>
        <t-radio-button v-if="p.sans_objet_possible !== false" value="SANS_OBJET">{{ t('gsms.grille.sansObjet') }}</t-radio-button>
      </t-radio-group>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Grille de relecture (OUI | NON | SANS_OBJET) d'une pièce ou d'une preuve.
 * Les points et la possibilité « sans objet » viennent de l'API ; c'est elle qui juge ensuite la grille.
 */
import { useI18n } from 'vue-i18n'

export interface GridPoint {
  code: string
  question: string
  exigence?: string | null
  /** false : l'API n'accepte pas « sans objet » pour ce point. */
  sans_objet_possible?: boolean
}

withDefaults(defineProps<{ points: GridPoint[]; modelValue: Record<string, string>; title?: string; disabled?: boolean }>(),
  { title: '', disabled: false })
const emit = defineEmits<{ 'update:modelValue': [Record<string, string>] }>()
const { t, te } = useI18n()
const exigenceLabel = (code: string) => (te(`gsms.grille.exigences.${code}`) ? t(`gsms.grille.exigences.${code}`) : code)
</script>

<style scoped lang="less">
@import (reference) './gsms-list.less';
.grid-title { margin: 8px 0 4px; font-size: var(--app-text-md); font-weight: 500; }
.point { padding: 8px 0; border-top: 1px solid color-mix(in srgb, var(--td-component-stroke) 70%, transparent); &:first-of-type { border-top: 0; } }
.question { margin: 0 0 6px; font-size: var(--app-text-md); line-height: 20px; color: var(--td-text-color-primary); }
.chip { .gsms-chip(); }
</style>
