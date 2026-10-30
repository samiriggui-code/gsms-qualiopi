<template>
  <div class="not-found">
    <GsmsIllustration :n="19" :height="200" />
    <h1>{{ t('gsms.introuvable.titre') }}</h1>
    <p>{{ t('gsms.introuvable.texte') }}</p>
    <router-link :to="GSMS_HOME_PATH" class="home-link">
      <t-button theme="primary" tabindex="-1">{{ t('gsms.introuvable.accueil') }}</t-button>
    </router-link>
  </div>
</template>

<script setup lang="ts">
/** Page introuvable du back-office (adresse inconnue sous /platform), illustrée comme dans l'ancienne application. */
import { useI18n } from 'vue-i18n'
import GsmsIllustration from '@/components/gsms/GsmsIllustration.vue'
import { GSMS_HOME_PATH } from '@/config/gsmsMenu'

const { t } = useI18n()
</script>

<style scoped lang="less">
.not-found {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 32px 16px;
  text-align: center;
  h1 { margin: 12px 0 0; color: var(--td-text-color-primary); font-size: var(--app-text-3xl, 24px); font-weight: 600; }
  p { max-width: 460px; margin: 0 0 8px; color: var(--td-text-color-secondary); font-size: var(--app-text-md); line-height: 20px; }
}
.home-link { border-radius: var(--app-radius-sm); &:focus-visible { outline: 2px solid var(--td-brand-color); outline-offset: 2px; } }
</style>
