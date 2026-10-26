<template>
  <div class="gsms-settings">
    <div class="section-header">
      <h2>{{ t('gsms.parametres.sections.modules') }}</h2>
      <p class="section-description">{{ t('gsms.parametres.modules.description') }}</p>
    </div>

    <GsmsRefusal v-if="loadError" :error="loadError" inline />
    <GsmsRefusal v-if="saveError" :error="saveError" inline />
    <t-alert v-if="features.length && !canEdit" theme="info" class="alert-gap"
      :message="t('gsms.parametres.modules.lectureSeule')" />

    <div v-if="loading" class="state-block"><t-loading size="small" /></div>

    <div v-else class="settings-group">
      <div v-for="f in features" :key="f.code" class="setting-row">
        <div class="setting-info">
          <label :for="`feature-${f.code}`">{{ f.label }}</label>
          <p class="desc">
            <code class="code">{{ f.code }}</code>
            <template v-if="f.depends_on.length"> · {{ t('gsms.parametres.modules.necessite', { list: f.depends_on.map(labelOf).join(', ') }) }}</template>
          </p>
          <p v-if="!f.available" class="desc muted">{{ t('gsms.parametres.modules.indisponibleAide') }}</p>
        </div>
        <div class="setting-control">
          <t-tag v-if="!f.available" variant="light" theme="default">{{ t('gsms.parametres.modules.indisponible') }}</t-tag>
          <t-switch :id="`feature-${f.code}`" :value="f.enabled" :loading="busy === f.code"
            :disabled="!canEdit || !f.available || (busy !== '' && busy !== f.code)"
            :aria-label="f.label" @change="(v: any) => toggle(f, Boolean(v))" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next'
import { useI18n } from 'vue-i18n'
import { listFeatures, setFeature, type Feature } from '@/api/gsms/platform'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import { useGsmsAccessStore } from '@/stores/gsmsAccess'

const { t } = useI18n()
const access = useGsmsAccessStore()
const canEdit = computed(() => access.can('settings.manage'))

const features = ref<Feature[]>([])
const loading = ref(true)
const busy = ref('')
const loadError = ref<unknown>(null)
const saveError = ref<unknown>(null)

const labelOf = (code: string) => features.value.find((f) => f.code === code)?.label ?? code

async function load(showSpinner = true) {
  if (showSpinner) loading.value = true
  loadError.value = null
  try {
    features.value = await listFeatures()
  } catch (err) {
    loadError.value = err
  } finally {
    loading.value = false
  }
}

async function apply(f: Feature, enabled: boolean) {
  busy.value = f.code
  saveError.value = null
  try {
    await setFeature(f.code, enabled)
    MessagePlugin.success(t(enabled ? 'gsms.parametres.modules.active' : 'gsms.parametres.modules.desactive', { label: f.label }))
    await Promise.all([load(false), access.load(true)])
  } catch (err) {
    saveError.value = err
  } finally {
    busy.value = ''
  }
}

function toggle(f: Feature, enabled: boolean) {
  if (enabled) {
    void apply(f, true)
    return
  }
  const dialog = DialogPlugin.confirm({
    header: t('gsms.parametres.modules.confirmerTitre', { label: f.label }),
    body: t('gsms.parametres.modules.confirmerTexte'),
    confirmBtn: t('gsms.parametres.modules.desactiver'),
    cancelBtn: t('gsms.parametres.commun.annuler'),
    theme: 'warning',
    onConfirm: () => {
      dialog.destroy()
      void apply(f, false)
    },
    onClose: () => dialog.destroy(),
  })
}

onMounted(() => load())
</script>

<style lang="less" scoped>
@import (reference) './gsms-section.less';

.gsms-settings {
  .gsms-section();
}

.code {
  font-family: var(--app-font-family-mono);
  font-size: var(--app-text-sm);
}

.setting-control {
  min-width: 120px;
}
</style>
