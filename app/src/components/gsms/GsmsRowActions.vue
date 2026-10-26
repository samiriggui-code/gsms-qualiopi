<template>
  <div class="row-actions" @click.stop>
    <button type="button" class="link-btn" @click="emit('edit')">{{ t('gsms.commun.modifier') }}</button>
    <button type="button" class="link-btn link-btn--danger" @click="confirmDelete">{{ t('gsms.commun.supprimer') }}</button>
  </div>
</template>

<script setup lang="ts">
/** Modifier / supprimer une ligne d'une ressource CRUD ; la suppression est confirmée, l'API peut la refuser (409). */
import { useI18n } from 'vue-i18n'
import { DialogPlugin } from 'tdesign-vue-next'

const props = defineProps<{ deleteTitle: string }>()
const emit = defineEmits<{ edit: []; delete: [] }>()
const { t } = useI18n()

function confirmDelete() {
  const dlg = DialogPlugin.confirm({
    header: props.deleteTitle, body: t('gsms.commun.suppressionDefinitive'), theme: 'danger',
    confirmBtn: { content: t('gsms.commun.supprimer'), theme: 'danger' }, cancelBtn: t('gsms.commun.annuler'),
    onConfirm: () => { dlg.destroy(); emit('delete') },
    onClose: () => dlg.destroy(),
  })
}
</script>

<style scoped lang="less">
@import (reference) './gsms-list.less';
.row-actions { display: flex; gap: 12px; }
.link-btn { .gsms-link-button(); }
</style>
