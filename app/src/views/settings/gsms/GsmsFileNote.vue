<template>
  <t-alert theme="info" class="gsms-file-note"
    :message="extra ? t('gsms.parametres.commun.fichierSeulPlus', { file, extra }) : t('gsms.parametres.commun.fichierSeul', { file })" />
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{ file: string; extra?: string }>()
const { t } = useI18n()
</script>

<style lang="less" scoped>
.gsms-file-note {
  margin-bottom: 16px;
  word-break: break-word;
}
</style>
