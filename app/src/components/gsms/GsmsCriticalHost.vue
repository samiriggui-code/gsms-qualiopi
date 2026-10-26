<template>
  <ActionDialog v-if="state.options" :visible="state.visible" danger :title="state.options.title" :intro="state.options.intro"
    :consequence="state.options.consequence" :confirm-label="state.options.confirmLabel" :confirm-text="state.options.confirmText"
    :fields="state.options.fields" :run="state.options.run" @done="(r) => settleCritical(r, true)"
    @update:visible="(v) => { if (!v) settleCritical(undefined, false) }" />
</template>

<script setup lang="ts">
/** Hôte unique des confirmations critiques (`confirmCritical`), monté dans App.vue. */
import ActionDialog from './ActionDialog.vue'
import { criticalState as state, settleCritical } from './critical'
</script>
