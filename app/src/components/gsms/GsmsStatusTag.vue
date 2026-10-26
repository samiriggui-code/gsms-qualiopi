<template>
  <t-tag :theme="stateTheme(code)" variant="light" size="small" class="status-tag">{{ label || stateLabel(code) }}</t-tag>
</template>

<script setup lang="ts">
/** Statut coloré : libellé renvoyé par l'API (`label`) ou, à défaut, libellé du code (gsms.etats.*). */
import { stateLabel, stateTheme } from './format'

withDefaults(defineProps<{ code?: string | null; label?: string | null }>(), { code: null, label: null })
</script>

<style scoped>
.status-tag { flex-shrink: 0; white-space: nowrap; }
</style>
