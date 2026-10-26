<template>
  <div class="gsms-refusal" :class="{ 'gsms-refusal--inline': inline }" role="alert">
    <div class="gsms-refusal__icon"><t-icon :name="icon" /></div>
    <div class="gsms-refusal__body">
      <div class="gsms-refusal__title">{{ refusal.title }}</div>
      <div class="gsms-refusal__message">{{ refusal.message }}</div>
      <ul v-if="refusal.details.length" class="gsms-refusal__details">
        <li v-for="(d, i) in refusal.details" :key="i">{{ d }}</li>
      </ul>
      <div v-if="$slots.default" class="gsms-refusal__actions"><slot /></div>
    </div>
  </div>
</template>

<script setup lang="ts">
/** Refus de l'API affiché tel quel (detail + details) : jamais remplacé par une liste vide ou des compteurs à zéro. */
import { computed } from 'vue'
import { toRefusal } from './format'

const props = withDefaults(defineProps<{ error: unknown; inline?: boolean }>(), { inline: false })
const refusal = computed(() => toRefusal(props.error))
const icon = computed(() => {
  const s = refusal.value.status
  if (s === 403) return 'lock-on'
  if (s === 409) return 'error-circle'
  if (s === 0) return 'wifi-off'
  return 'info-circle'
})
</script>

<style scoped lang="less">
.gsms-refusal {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  max-width: 640px;
  margin: 40px auto;
  padding: 20px;
  border: 1px solid var(--td-component-stroke);
  border-radius: var(--app-radius-md);
  background: var(--td-bg-color-container);

  &--inline {
    max-width: none;
    margin: 0 0 12px;
    padding: 12px 14px;
    background: var(--td-bg-color-secondarycontainer);
  }
}

.gsms-refusal__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--td-warning-color-light);
  color: var(--td-warning-color);
  font-size: 18px;

  .gsms-refusal--inline & { width: 28px; height: 28px; font-size: 16px; }
}

.gsms-refusal__body { min-width: 0; flex: 1; }
.gsms-refusal__title { color: var(--td-text-color-primary); font-size: var(--app-text-lg); font-weight: 600; line-height: 22px; }
.gsms-refusal__message { margin-top: 4px; color: var(--td-text-color-secondary); font-size: var(--app-text-md); line-height: 20px; overflow-wrap: anywhere; }
.gsms-refusal__details {
  margin: 8px 0 0;
  padding-left: 18px;
  color: var(--td-text-color-secondary);
  font-size: var(--app-text-sm);
  line-height: 18px;
  overflow-wrap: anywhere;
}
.gsms-refusal__actions { margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap; }
</style>
