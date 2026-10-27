<template>
  <t-tag :theme="tag.theme" :variant="tag.variant" size="small" class="status-tag">{{ label || stateLabel(code) }}</t-tag>
</template>

<script setup lang="ts">
/**
 * Statut : libellé renvoyé par l'API (`label`) ou, à défaut, libellé du code (gsms.etats.*). Vert pour un état
 * satisfaisant, rouge pour une alerte, gris sinon (contour gris pour un état intermédiaire).
 */
import { computed } from 'vue'
import { stateLabel, stateTag } from './format'

const props = withDefaults(defineProps<{ code?: string | null; label?: string | null }>(), { code: null, label: null })
const tag = computed(() => stateTag(props.code))
</script>

<style scoped>
.status-tag { flex-shrink: 0; white-space: nowrap; }
/* État intermédiaire : contour gris foncé, lisible sans couleur. */
.status-tag.t-tag--light-outline { border-color: var(--td-text-color-placeholder); }
</style>
