<template>
  <span class="step-mark" :class="`is-${tone}`" role="img" :aria-label="text" :title="text">
    <t-icon :name="icon" size="16px" />
  </span>
</template>

<script setup lang="ts">
/** Pastille d'état d'une étape du parcours (état calculé par l'API : FAIT, A_ECHEANCE, EN_RETARD, A_VENIR, SANS_OBJET). */
import { computed } from 'vue'
import { stateLabel } from './format'

const props = withDefaults(defineProps<{ state: string | null | undefined; label?: string }>(), { label: '' })

const ICONS: Record<string, [string, string]> = {
  FAIT: ['check-circle-filled', 'success'],
  A_ECHEANCE: ['time-filled', 'warning'],
  EN_RETARD: ['close-circle-filled', 'danger'],
  SANS_OBJET: ['minus-circle', 'muted'],
  A_VENIR: ['circle', 'muted'],
}
const icon = computed(() => (ICONS[props.state ?? ''] ?? ICONS.A_VENIR)[0])
const tone = computed(() => (ICONS[props.state ?? ''] ?? ICONS.A_VENIR)[1])
const text = computed(() => `${props.label ? `${props.label} : ` : ''}${stateLabel(props.state)}`)
</script>

<style scoped lang="less">
.step-mark { display: inline-flex; flex-shrink: 0; color: var(--td-text-color-placeholder); }
.is-success { color: var(--td-success-color); }
.is-warning { color: var(--td-text-color-secondary); }
.is-danger { color: var(--td-error-color); }
.is-muted { color: var(--td-text-color-disabled); }
</style>
