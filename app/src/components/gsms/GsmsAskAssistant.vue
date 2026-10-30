<template>
  <template v-if="canIa">
    <t-button :size="size" :variant="variant" theme="primary" @click="open">
      <template #icon><t-icon name="chat-bubble-smile" /></template>{{ label || t('gsms.assistantIa.analyser') }}
    </t-button>
    <t-dialog v-model:visible="visible" :header="t('gsms.assistantIa.titre')" attach="body" width="min(560px, calc(100vw - 32px))"
      :footer="false" destroy-on-close>
      <div class="ask">
        <div v-if="pending" class="ask-loading"><t-loading size="small" /> {{ t('gsms.assistantIa.recherche') }}</div>
        <t-alert v-else-if="failed" theme="error" :message="t('gsms.assistantIa.injoignable')" />
        <t-alert v-else-if="target?.kind === 'no-model'" theme="warning" :title="t('gsms.assistantIa.nonConfigureTitre')"
          :message="t('gsms.assistantIa.nonConfigure')" />
        <template v-else-if="target?.kind === 'ready'">
          <p class="ask-who">
            <t-icon name="user-talk" size="16px" aria-hidden="true" />
            <span>{{ t('gsms.assistantIa.repondPar') }} <strong>{{ target.agent.name }}</strong></span>
          </p>
          <t-alert v-if="target.fallback" theme="info" :message="t('gsms.assistantIa.parDefaut', { nom: GSMS_ASSISTANTS[assistant] })" />
          <label class="ask-label" :for="fieldId">{{ t('gsms.assistantIa.question') }}</label>
          <t-textarea :id="fieldId" v-model="text" :autosize="{ minRows: 3, maxRows: 8 }" :maxlength="2000" />
          <p class="ask-note">{{ t('gsms.assistantIa.note') }}</p>
          <div class="ask-actions">
            <t-button variant="outline" @click="visible = false">{{ t('gsms.commun.annuler') }}</t-button>
            <t-button theme="primary" :loading="sending" :disabled="!text.trim()" @click="send">
              <template #icon><t-icon name="send" /></template>{{ t('gsms.assistantIa.envoyer') }}
            </t-button>
          </div>
        </template>
      </div>
    </t-dialog>
  </template>
</template>

<script setup lang="ts">
/**
 * Bouton « Analyser avec l'assistant » (droit `ia.use`) : une fenêtre fait relire et modifier la question préparée,
 * puis la conversation s'ouvre sur l'assistant Qualiopi préréglé (askAssistant.ts). Sans modèle de discussion dans
 * le moteur IA, la fenêtre le dit et ne propose pas d'envoi.
 */
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { useGsmsAccessStore } from '@/stores/gsmsAccess'
import { GSMS_ASSISTANTS, type GsmsAssistantKey } from '@/config/gsmsAssistants'
import { openAssistantChat, resolveAssistant, type AssistantTarget } from './askAssistant'

const props = withDefaults(defineProps<{
  assistant: GsmsAssistantKey
  question: string
  label?: string
  size?: 'small' | 'medium' | 'large'
  variant?: 'base' | 'outline' | 'dashed' | 'text'
}>(), { label: '', size: 'small', variant: 'outline' })
const { t } = useI18n()
const router = useRouter()
const access = useGsmsAccessStore()
const canIa = computed(() => access.can('ia.use'))
const fieldId = `ask-${useId()}`

const visible = ref(false)
const pending = ref(false)
const failed = ref(false)
const sending = ref(false)
const target = ref<AssistantTarget | null>(null)
const text = ref('')

async function open() {
  text.value = props.question
  visible.value = true
  pending.value = true
  failed.value = false
  target.value = null
  try {
    target.value = await resolveAssistant(props.assistant)
  } catch {
    failed.value = true
  } finally {
    pending.value = false
  }
}

async function send() {
  const current = target.value
  if (current?.kind !== 'ready' || !text.value.trim()) return
  sending.value = true
  try {
    await openAssistantChat(router, current, text.value.trim(), t('createChat.newSessionTitle'))
    visible.value = false
  } catch {
    MessagePlugin.error(t('gsms.assistantIa.echec'))
  } finally {
    sending.value = false
  }
}
</script>

<style scoped lang="less">
.ask { display: flex; flex-direction: column; gap: 12px; }
.ask-loading { display: flex; align-items: center; gap: 8px; color: var(--td-text-color-secondary); }
.ask-who { display: flex; align-items: center; gap: 8px; margin: 0; color: var(--td-text-color-secondary); font-size: var(--app-text-sm);
  strong { color: var(--td-text-color-primary); } }
.ask-label { font-weight: 600; font-size: var(--app-text-sm); color: var(--td-text-color-primary); margin-bottom: -6px; }
.ask-note { margin: 0; color: var(--td-text-color-placeholder); font-size: var(--app-text-xs); }
.ask-actions { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
</style>
