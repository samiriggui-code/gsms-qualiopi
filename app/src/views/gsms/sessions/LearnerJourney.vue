<template>
  <GsmsPage :title="data?.stagiaire || 'Parcours du stagiaire'" icon="user-checked" :back="backTo" :back-label="data?.session || 'Retour'"
    :subtitle="data ? `Session ${data.session}` : ''">
    <template v-if="data" #title-extra><GsmsTag :code="data.statut" /></template>

    <div v-if="loading && !data" class="panel"><t-skeleton animation="gradient" :row-col="[{ width: '50%' }, { width: '100%' }, { width: '80%' }]" /></div>
    <GsmsRefusal v-else-if="error" :error="error"><t-button size="small" variant="outline" @click="load">Réessayer</t-button></GsmsRefusal>
    <template v-else-if="data">
      <dl class="kv panel">
        <div><dt>E-mail</dt><dd>{{ data.contact.email || '—' }}</dd></div>
        <div><dt>Téléphone</dt><dd>{{ data.contact.telephone || '—' }}</dd></div>
        <div><dt>Entreprise</dt><dd>{{ data.contact.entreprise || '—' }}</dd></div>
        <div><dt>Financement</dt><dd>{{ data.contact.financement || '—' }}</dd></div>
        <div><dt>Inscrit le</dt><dd>{{ fmtDate(data.contact.inscrit_le) }}</dd></div>
        <div><dt>Assiduité</dt><dd>{{ data.assiduite.suivies }} / {{ data.assiduite.prevues }} demi-journées</dd></div>
      </dl>

      <GsmsRefusal v-if="actionError" :error="actionError" inline />

      <h3 class="section-title">Étapes</h3>
      <ol class="steps">
        <li v-for="s in data.etapes" :key="s.etape" class="step">
          <div class="step-head">
            <span class="step-name">{{ STEP_LABELS[s.etape] ?? s.etape }}</span>
            <GsmsTag :code="s.etat" />
          </div>
          <p class="muted">
            <template v-if="s.le">{{ fmtDate(s.le) }} · </template>{{ s.detail || (s.echeance ? `Échéance le ${fmtDate(s.echeance)}` : '—') }}
          </p>
          <p v-if="s.manque?.length" class="muted">Manque : {{ s.manque.join(', ') }}</p>
        </li>
      </ol>

      <h3 class="section-title">Actions</h3>
      <p class="muted intro">Chaque bouton suit la décision de l'API ; les saisies demandées s'ouvrent dans un formulaire.</p>
      <div class="actions">
        <div v-for="(cap, name) in data.capabilities" :key="name" class="action">
          <CapabilityAction :capability="cap" :label="cap.libelle" :theme="DANGER.has(String(name)) ? 'danger' : 'primary'"
            :variant="DANGER.has(String(name)) ? 'outline' : 'base'" :loading="busy === name" @run="run(String(name))" />
        </div>
      </div>
    </template>

    <ActionDialog v-model:visible="dialog.visible" :title="dialog.title" :fields="dialog.fields" :danger="DANGER.has(dialog.action)"
      :run="(v) => journeyAction(id, dialog.action, v)" @done="done" />
  </GsmsPage>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import GsmsPage from './components/GsmsPage.vue'
import GsmsRefusal from './components/GsmsRefusal.vue'
import GsmsTag from './components/GsmsTag.vue'
import CapabilityAction from './components/CapabilityAction.vue'
import ActionDialog, { type ActionField } from './components/ActionDialog.vue'
import { getLearnerJourney, journeyAction, type LearnerJourney } from '@/api/gsms/journey'
import { listSessions } from '@/api/gsms/sessions'
import { STEP_LABELS, fmtDate } from './format'

const DANGER = new Set(['annuler', 'abandonner'])
const route = useRoute()
const id = computed(() => String(route.params.enrollmentId || ''))
const data = ref<LearnerJourney | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const actionError = ref<unknown>(null)
const busy = ref('')
const sessionId = ref('')
const dialog = reactive<{ visible: boolean; title: string; action: string; fields: ActionField[] }>({ visible: false, title: '', action: '', fields: [] })

const backTo = computed(() => (sessionId.value ? `/platform/sessions/${sessionId.value}?onglet=parcours` : '/platform/parcours'))

async function load() {
  loading.value = true
  error.value = null
  try {
    data.value = await getLearnerJourney(id.value)
    // La réponse donne la référence de la session : on retrouve son identifiant pour le lien retour.
    listSessions().then((rows) => { sessionId.value = rows.find((s) => s.reference === data.value?.session)?.id ?? '' }).catch(() => {})
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
  MessagePlugin.success('Parcours mis à jour')
  await load()
}
</script>

<style scoped lang="less">
@import (reference) './gsms-list.less';
.panel { .gsms-panel(); margin-bottom: 16px; }
.kv { .gsms-kv(); }
.muted { .gsms-muted(); margin: 2px 0 0; }
.intro { margin: -4px 0 12px; }
.section-title { .gsms-panel-title(); margin-top: 8px; }
.steps { list-style: none; margin: 0 0 16px; padding: 0; display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr)); }
.step { .gsms-panel(); padding: 10px 12px; }
.step-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.step-name { font-weight: 600; font-size: var(--app-text-md); color: var(--td-text-color-primary); }
.actions { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr)); }
.action { .gsms-panel(); padding: 10px 12px; }
</style>
