<template>
  <GsmsRecordSheet :title="data?.stagiaire || t('gsms.parcours.titre')" icon="user-checked" :back="backTo"
    :back-label="data?.session || t('gsms.sessions.titre')" :subtitle="data ? t('gsms.parcours.sessionRef', { ref: data.session }) : ''"
    :ready="!!data" :loading="loading" :error="error" @retry="load">
    <template v-if="data" #status><GsmsStatusTag :code="data.statut" /></template>
    <template v-if="data" #before><GsmsRefusal v-if="actionError" :error="actionError" inline /></template>
    <template v-if="data" #side>
      <section class="side-section">
        <h3><GsmsPersonAvatar :name="data.stagiaire" :size="32" /> {{ t('gsms.parcours.contact') }}</h3>
        <dl>
          <div><dt>{{ t('gsms.parcours.email') }}</dt><dd>{{ data.contact.email || '—' }}</dd></div>
          <div><dt>{{ t('gsms.parcours.telephone') }}</dt><dd>{{ data.contact.telephone || '—' }}</dd></div>
          <div><dt>{{ t('gsms.parcours.entreprise') }}</dt><dd>{{ data.contact.entreprise || '—' }}</dd></div>
          <div><dt>{{ t('gsms.parcours.financement') }}</dt><dd>{{ data.contact.financement || '—' }}</dd></div>
          <div><dt>{{ t('gsms.parcours.inscritLe') }}</dt><dd>{{ fmtDate(data.contact.inscrit_le) }}</dd></div>
          <div><dt>{{ t('gsms.parcours.assiduite') }}</dt><dd>{{ t('gsms.parcours.demiJournees', { n: data.assiduite.suivies, total: data.assiduite.prevues }) }}</dd></div>
        </dl>
      </section>
    </template>

    <template v-if="data">
      <section class="panel">
        <h3 class="title">{{ t('gsms.parcours.etapes') }}</h3>
        <ol class="steps">
          <li v-for="s in data.etapes" :key="s.etape" class="step">
            <GsmsStepMark :state="s.etat" :label="stepLabel(s.etape)" />
            <div class="step-body">
              <div class="step-head"><span class="step-name">{{ stepLabel(s.etape) }}</span><GsmsStatusTag :code="s.etat" /></div>
              <p class="muted">
                <template v-if="s.le">{{ fmtDate(s.le) }} · </template>{{ s.detail || (s.echeance ? t('gsms.parcours.echeanceLe', { date: fmtDate(s.echeance) }) : '—') }}
              </p>
              <p v-if="s.manque?.length" class="muted">{{ t('gsms.parcours.manque', { liste: s.manque.join(', ') }) }}</p>
            </div>
          </li>
        </ol>
      </section>
      <section class="panel">
        <h3 class="title">{{ t('gsms.parcours.actions') }}</h3>
        <p class="muted intro">{{ t('gsms.parcours.actionsAide') }}</p>
        <div class="actions">
          <GsmsActionGate v-for="(cap, name) in data.capabilities" :key="name" :decision="cap" show-reason
            :theme="DANGER.has(String(name)) ? 'danger' : 'primary'" :variant="DANGER.has(String(name)) ? 'outline' : 'base'"
            :pending="busy === name" @run="run(String(name))" />
        </div>
      </section>
    </template>
  </GsmsRecordSheet>

  <ActionDialog v-model:visible="dialog.visible" :title="dialog.title" :fields="dialog.fields" :danger="DANGER.has(dialog.action)"
    :run="(v) => journeyAction(id, dialog.action, v)" @done="done" />
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { useI18n } from 'vue-i18n'
import GsmsRecordSheet from '@/components/gsms/GsmsRecordSheet.vue'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import GsmsActionGate from '@/components/gsms/GsmsActionGate.vue'
import GsmsStepMark from '@/components/gsms/GsmsStepMark.vue'
import GsmsPersonAvatar from '@/components/gsms/GsmsPersonAvatar.vue'
import ActionDialog, { type ActionField } from '@/components/gsms/ActionDialog.vue'
import { getLearnerJourney, journeyAction, type LearnerJourney } from '@/api/gsms/journey'
import { fmtDate, stepLabel } from '@/components/gsms/format'

const DANGER = new Set(['annuler', 'abandonner'])
const { t } = useI18n()
const route = useRoute()
const id = computed(() => String(route.params.enrollmentId || ''))
const sessionId = computed(() => String(route.params.sessionId || ''))
const data = ref<LearnerJourney | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const actionError = ref<unknown>(null)
const busy = ref('')
const dialog = reactive<{ visible: boolean; title: string; action: string; fields: ActionField[] }>({ visible: false, title: '', action: '', fields: [] })

const backTo = computed(() => `/platform/sessions/${sessionId.value}?onglet=parcours`)

async function load() {
  const asked = id.value
  loading.value = true
  error.value = null
  try {
    const res = await getLearnerJourney(asked)
    if (asked !== id.value) return // réponse d'une fiche quittée entre-temps
    data.value = res
  } catch (e) {
    error.value = e
    data.value = null
  } finally {
    loading.value = false
  }
}
watch(id, () => { actionError.value = null; load() }, { immediate: true })

const NUMBER_FIELDS = new Set(['note'])
async function run(name: string) {
  const cap = data.value?.capabilities[name]
  if (!cap) return
  const inputs = cap.a_saisir ?? []
  if (inputs.length) {
    dialog.action = name
    dialog.title = cap.libelle ?? name
    dialog.fields = inputs.map((f) => ({ name: f, type: f === 'date' ? 'date' : NUMBER_FIELDS.has(f) ? 'number' : undefined }))
    dialog.visible = true
    return
  }
  busy.value = name
  actionError.value = null
  try {
    await journeyAction(id.value, name, {})
    await done()
  } catch (e) {
    actionError.value = e
  } finally {
    busy.value = ''
  }
}

async function done() {
  MessagePlugin.success(t('gsms.commun.misAJour'))
  await load()
}
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.side-section { .gsms-side-section(); h3 { display: flex; align-items: center; gap: 8px; } }
.panel { .gsms-panel(); }
.title { .gsms-panel-title(); }
.muted { .gsms-muted(); margin: 2px 0 0; }
.intro { margin: -4px 0 12px; }
.steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr)); }
.step { display: flex; gap: 8px; padding: 10px 12px; border: 1px solid var(--td-component-stroke); border-radius: var(--app-radius-sm); }
.step-body { flex: 1; min-width: 0; }
.step-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.step-name { font-weight: 600; font-size: var(--app-text-md); color: var(--td-text-color-primary); }
.actions { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr)); }
</style>
