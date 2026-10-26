<template>
  <GsmsListPage :title="t('gsms.qualite.reclamations.titre')" icon="chat-bubble-error" :subtitle="t('gsms.qualite.reclamations.sousTitre')"
    :items="rows" :loading="loading" :error="error" :columns="columns" :empty-title="t('gsms.qualite.reclamations.aucune')" @retry="load">
    <template #actions>
      <t-button v-if="canWrite" size="small" @click="openForm(null)"><template #icon><t-icon name="add" /></template>{{ t('gsms.qualite.reclamations.nouvelle') }}</t-button>
    </template>
    <template #toolbar>
      <GsmsFilterTabs v-model="kind" :options="kindTabs" :label="t('gsms.qualite.reclamations.type')" />
      <GsmsFilterTabs v-model="follow" :options="followTabs" :label="t('gsms.commun.filtrerEtat')" />
    </template>
    <template #before><GsmsRefusal v-if="actionError" :error="actionError" inline /></template>

    <template #cell-received_on="{ row }">{{ fmtDate(row.received_on) }}</template>
    <template #cell-kind="{ row }">{{ kindLabel(row.kind) }}</template>
    <template #cell-stakeholder="{ row }">{{ stakeholderLabel(row.stakeholder) }}</template>
    <template #cell-suivi="{ row }"><span class="follow">{{ followText(row) }}</span></template>
    <template #cell-actions="{ row }"><GsmsRowActions v-if="canWrite" :delete-title="t('gsms.qualite.reclamations.supprimer')" @edit="openForm(row)" @delete="remove(row)" /></template>

    <template #card="{ item }">
      <div class="card card--static">
        <div class="card-header">
          <div class="card-header-left"><span class="card-title">{{ kindLabel(item.kind) }} · {{ stakeholderLabel(item.stakeholder) }}</span></div>
          <t-tag :theme="item.resolved_on ? 'success' : 'warning'" variant="light" size="small">
            {{ item.resolved_on ? t('gsms.qualite.reclamations.resolue') : t('gsms.qualite.reclamations.enCours') }}
          </t-tag>
        </div>
        <div class="card-content"><p class="card-description">{{ item.description }}</p></div>
        <div class="card-meta">
          <span>{{ t('gsms.qualite.reclamations.recueLe', { date: fmtDate(item.received_on) }) }}</span>
          <span v-if="item.session_reference">{{ item.session_reference }}</span>
          <span>{{ followText(item) }}</span>
        </div>
        <GsmsRowActions v-if="canWrite" class="card-actions" :delete-title="t('gsms.qualite.reclamations.supprimer')" @edit="openForm(item)" @delete="remove(item)" />
      </div>
    </template>
  </GsmsListPage>

  <ActionDialog v-model:visible="form.visible" :title="form.id ? t('gsms.qualite.reclamations.modifier') : t('gsms.qualite.reclamations.nouvelle')"
    :fields="formFields" :run="save" @done="saved" />
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { MessagePlugin } from 'tdesign-vue-next'
import GsmsListPage, { type ListColumn } from '@/components/gsms/GsmsListPage.vue'
import GsmsFilterTabs from '@/components/gsms/GsmsFilterTabs.vue'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import ActionDialog, { type ActionField } from '@/components/gsms/ActionDialog.vue'
import GsmsRowActions from '@/components/gsms/GsmsRowActions.vue'
import { createComplaint, deleteComplaint, listComplaints, updateComplaint, type Complaint, type ComplaintIn } from '@/api/gsms/qualite'
import { useGsmsAccessStore } from '@/stores/gsmsAccess'
import { fmtDate } from '@/components/gsms/format'

// Valeurs acceptées par l'API (handler/training_resources.py) ; c'est elle qui les vérifie.
const KINDS = ['RECLAMATION', 'DIFFICULTE', 'ALEA']
const STAKEHOLDERS = ['APPRENANT', 'ENTREPRISE', 'FINANCEUR', 'FORMATEUR', 'AUTRE']

const { t } = useI18n()
const access = useGsmsAccessStore()
// Aucune `capabilities` sur les ressources CRUD : l'écriture suit la permission de la route (quality.write), l'API tranche.
const canWrite = computed(() => access.can('quality.write'))

const items = ref<Complaint[] | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const actionError = ref<unknown>(null)
const kind = ref('all')
const follow = ref('all')

const kindLabel = (k: string) => t(`gsms.qualite.reclamations.types.${k}`)
const stakeholderLabel = (k: string) => t(`gsms.qualite.reclamations.parties.${k}`)
const followText = (c: Complaint) => [
  c.acknowledged_on ? t('gsms.qualite.reclamations.accuseLe', { date: fmtDate(c.acknowledged_on) }) : '',
  c.answered_on ? t('gsms.qualite.reclamations.reponduLe', { date: fmtDate(c.answered_on) }) : '',
  c.resolved_on ? t('gsms.qualite.reclamations.resolueLe', { date: fmtDate(c.resolved_on) }) : '',
].filter(Boolean).join(' · ') || t('gsms.qualite.reclamations.sansSuite')

async function load() {
  loading.value = true
  error.value = null
  try {
    items.value = await listComplaints()
  } catch (e) {
    error.value = e
    items.value = null
  } finally {
    loading.value = false
  }
}
onMounted(() => { access.load(); load() })

const kindTabs = computed(() => [{ value: 'all', label: t('gsms.commun.toutes'), count: items.value?.length },
  ...KINDS.map((k) => ({ value: k, label: kindLabel(k), count: (items.value ?? []).filter((c) => c.kind === k).length }))])
const followTabs = computed(() => [
  { value: 'all', label: t('gsms.commun.toutes') },
  { value: 'open', label: t('gsms.qualite.reclamations.enCours'), count: (items.value ?? []).filter((c) => !c.resolved_on).length },
  { value: 'done', label: t('gsms.qualite.reclamations.resolues'), count: (items.value ?? []).filter((c) => !!c.resolved_on).length },
])
const rows = computed(() => items.value?.filter((c) => (kind.value === 'all' || c.kind === kind.value)
  && (follow.value === 'all' || (follow.value === 'open' ? !c.resolved_on : !!c.resolved_on))) ?? null)

const columns = computed<ListColumn[]>(() => [
  { colKey: 'received_on', title: t('gsms.qualite.reclamations.colRecue'), width: 110 },
  { colKey: 'kind', title: t('gsms.qualite.reclamations.type'), width: 120 },
  { colKey: 'stakeholder', title: t('gsms.qualite.reclamations.partie'), width: 120 },
  { colKey: 'description', title: t('gsms.qualite.reclamations.description') },
  { colKey: 'session_reference', title: t('gsms.qualite.reclamations.session'), width: 140 },
  { colKey: 'suivi', title: t('gsms.qualite.reclamations.suivi') },
  ...(canWrite.value ? [{ colKey: 'actions', title: '', width: 150 }] : []),
])

const form = reactive<{ visible: boolean; id: string | null; initial: Partial<Complaint> }>({ visible: false, id: null, initial: {} })
const formFields = computed<ActionField[]>(() => [
  { name: 'kind', label: t('gsms.qualite.reclamations.type'), type: 'radio', initial: form.initial.kind ?? 'RECLAMATION',
    options: KINDS.map((k) => ({ value: k, label: kindLabel(k) })) },
  { name: 'stakeholder', label: t('gsms.qualite.reclamations.partie'), type: 'select', initial: form.initial.stakeholder ?? 'APPRENANT',
    options: STAKEHOLDERS.map((k) => ({ value: k, label: stakeholderLabel(k) })) },
  { name: 'received_on', label: t('gsms.qualite.reclamations.colRecue'), type: 'date', initial: form.initial.received_on ?? '' },
  { name: 'description', label: t('gsms.qualite.reclamations.description'), type: 'textarea', initial: form.initial.description ?? '' },
  { name: 'acknowledged_on', label: t('gsms.qualite.reclamations.accuse'), type: 'date', initial: form.initial.acknowledged_on ?? '' },
  { name: 'answered_on', label: t('gsms.qualite.reclamations.reponse'), type: 'date', initial: form.initial.answered_on ?? '' },
  { name: 'resolved_on', label: t('gsms.qualite.reclamations.resolution'), type: 'date', initial: form.initial.resolved_on ?? '' },
  { name: 'resolution', label: t('gsms.qualite.reclamations.traitement'), type: 'textarea', initial: form.initial.resolution ?? '' },
])
function openForm(c: Complaint | null) {
  Object.assign(form, { visible: true, id: c?.id ?? null, initial: c ?? {} })
}
const save = (v: Record<string, any>) => (form.id ? updateComplaint(form.id, v as ComplaintIn) : createComplaint(v as ComplaintIn))
async function saved() {
  MessagePlugin.success(t('gsms.commun.enregistre'))
  await load()
}


async function remove(c: Complaint) {
  actionError.value = null
  try {
    await deleteComplaint(c.id)
    await load()
  } catch (e) {
    actionError.value = e
  }
}
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.card { .gsms-card(); }
.card--static { cursor: default; }
.card .card-content { overflow: visible; }
.card .card-description { -webkit-line-clamp: 4; line-clamp: 4; }
.card-actions { margin-top: 8px; }
.follow { color: var(--td-text-color-secondary); font-size: var(--app-text-sm); }
</style>
