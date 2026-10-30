<template>
  <div class="row-actions" @click.stop>
    <button type="button" class="link-btn" @click="emit('edit')">{{ t('gsms.commun.modifier') }}</button>
    <button type="button" class="link-btn link-btn--danger" @click="confirmDelete">{{ t('gsms.commun.supprimer') }}</button>
  </div>
</template>

<script setup lang="ts">
/**
 * Modifier / supprimer une ligne d'une ressource CRUD. La suppression passe par la confirmation critique : l'appel
 * (`remove`) est fait depuis le dialogue, un refus de l'API (409) s'y affiche et le dialogue reste ouvert.
 */
import { useI18n } from 'vue-i18n'
import { confirmCritical } from './critical'

const props = defineProps<{ deleteTitle: string; remove: () => Promise<unknown> }>()
const emit = defineEmits<{ edit: [] }>()
const { t } = useI18n()

function confirmDelete() {
  void confirmCritical({
    title: props.deleteTitle, consequence: t('gsms.commun.suppressionDefinitive'),
    confirmLabel: t('gsms.commun.supprimer'), run: props.remove,
  })
}
</script>

<style scoped lang="less">
@import (reference) './gsms-list.less';
.row-actions { display: flex; gap: 12px; }
.link-btn { .gsms-link-button(); }
</style>
