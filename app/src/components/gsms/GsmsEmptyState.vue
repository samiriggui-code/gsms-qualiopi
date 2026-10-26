<template>
  <div class="gsms-empty" :class="{ 'gsms-empty--compact': compact }" role="status">
    <GsmsIllustration :n="illustrationN" :height="compact ? 96 : 140" />
    <div class="gsms-empty__title">{{ title }}</div>
    <p v-if="description" class="gsms-empty__desc">{{ description }}</p>
    <div v-if="$slots.default" class="gsms-empty__actions"><slot /></div>
  </div>
</template>

<script setup lang="ts">
/** État vide illustré des listes GSMS (même illustration que l'ancienne application : loupe, 33.svg). */
import GsmsIllustration from './GsmsIllustration.vue'

withDefaults(defineProps<{ title: string; description?: string; illustrationN?: number; compact?: boolean }>(),
  { description: '', illustrationN: 33, compact: false })
</script>

<style scoped lang="less">
.gsms-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 16px 48px;
  text-align: center;
  &--compact { padding: 20px 12px; }
}
.gsms-empty__title { margin-top: 8px; color: var(--td-text-color-primary); font-size: var(--app-text-lg); font-weight: 600; line-height: 22px; }
.gsms-empty__desc { max-width: 440px; margin: 0; color: var(--td-text-color-secondary); font-size: var(--app-text-md); line-height: 20px; }
.gsms-empty__actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 8px; }
</style>
