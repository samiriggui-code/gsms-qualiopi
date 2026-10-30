<template>
  <div class="tabs" :role="tabs ? 'tablist' : 'group'" :aria-label="label">
    <button v-for="o in options" :key="o.value" type="button" :role="tabs ? 'tab' : undefined"
      :aria-selected="tabs ? modelValue === o.value : undefined" :aria-pressed="tabs ? undefined : modelValue === o.value"
      @click="emit('update:modelValue', o.value)">
      {{ o.label }}<span v-if="o.count !== undefined" class="tab-count">{{ o.count }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
/** Onglets ou filtres à pastilles des listes (même rendu que les filtres des listes WeKnora). */
export interface FilterOption {
  value: string
  label: string
  count?: number
}

withDefaults(defineProps<{ options: FilterOption[]; modelValue: string; label: string; tabs?: boolean }>(), { tabs: false })
const emit = defineEmits<{ 'update:modelValue': [string] }>()
</script>

<style scoped lang="less">
@import (reference) './gsms-list.less';
.tabs { .gsms-tabs(); }
</style>
