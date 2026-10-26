<template>
  <GsmsListPage :title="t('gsms.ressources.equipements.titre')" icon="tools" :subtitle="t('gsms.ressources.equipements.sousTitre')"
    :items="rows" :loading="loading" :error="error" :columns="columns" :empty-title="t('gsms.ressources.equipements.aucun')"
    :empty-description="canWrite ? t('gsms.ressources.equipements.aucunAide') : ''" @retry="load">
    <template #actions>
      <t-button v-if="canWrite" size="small" @click="openForm(null)"><template #icon><t-icon name="add" /></template>{{ t('gsms.ressources.equipements.nouveau') }}</t-button>
    </template>
    <template #toolbar>
      <GsmsFilterTabs v-model="filter" :options="filterTabs" :label="moyenLabel('category')" />
    </template>
    <template #before>
      <GsmsRefusal v-if="actionError" :error="actionError" inline />
      <!-- Prochaine échéance mise en avant : la plus proche des dates saisies ; « dépassée » est décidé par l'API -->
      <div v-if="next" class="next" :class="{ 'next--late': next.check_overdue }">
        <t-icon :name="next.check_overdue ? 'error-circle' : 'time'" size="20px" class="next-icon" />
        <div class="next-text">
          <span class="next-label">{{ next.check_overdue ? t('gsms.ressources.equipements.verificationDepassee') : t('gsms.ressources.equipements.prochaineVerification') }}</span>
          <strong>{{ fmtDate(next.next_check_on) }} · {{ next.label || next.code }}</strong>
          <span v-if="next.premises_name || next.regulatory_ref" class="next-sub">{{ [next.premises_name, next.regulatory_ref].filter(Boolean).join(' · ') }}</span>
        </div>
        <span v-if="overdue" class="next-count">{{ t('gsms.ressources.equipements.nDepassees', { n: overdue }) }}</span>
      </div>
    </template>

    <template #cell-label="{ row }">
      <span class="cell-title">{{ row.label || row.code || '—' }}</span>
      <span v-if="row.regulatory_ref" class="cell-sub">{{ row.regulatory_ref }}</span>
    </template>
    <template #cell-category="{ row }">{{ row.category_label }}</template>
    <template #cell-premises_name="{ row }">{{ row.premises_name || '—' }}</template>
    <template #cell-next_check_on="{ row }">
      <span :class="{ late: row.check_overdue }">{{ fmtDate(row.next_check_on) }}</span>
      <span v-if="row.last_check_on" class="cell-sub">{{ t('gsms.ressources.equipements.dernierLe', { date: fmtDate(row.last_check_on) }) }}</span>
    </template>
    <template #cell-status="{ row }">
      <GsmsStatusTag :code="row.status" :label="row.status_label" />
      <GsmsStatusTag v-if="row.check_overdue" code="EN_RETARD" :label="t('gsms.ressources.equipements.depassee')" class="tag-gap" />
    </template>
    <template #cell-actions="{ row }"><GsmsRowActions v-if="canWrite" :delete-title="t('gsms.ressources.equipements.supprimer')" @edit="openForm(row)" @delete="remove(row)" /></template>

    <template #card="{ item }">
      <div class="card card--static">
        <div class="card-header">
          <div class="card-header-left"><span class="card-title" :title="item.label ?? ''">{{ item.label || item.code || '—' }}</span></div>
          <GsmsStatusTag v-if="item.check_overdue" code="EN_RETARD" :label="t('gsms.ressources.equipements.depassee')" />
          <GsmsStatusTag v-else :code="item.status" :label="item.status_label" />
        </div>
        <div class="card-content">
          <p class="card-description" :class="{ late: item.check_overdue, 'is-empty': !item.next_check_on }">
            {{ item.next_check_on ? t('gsms.ressources.equipements.prochainLe', { date: fmtDate(item.next_check_on) }) : t('gsms.ressources.equipements.sansEcheance') }}
          </p>
        </div>
        <div class="card-meta">
          <span>{{ item.category_label }}</span>
          <span>{{ t('gsms.ressources.equipements.quantite', { n: item.quantity }) }}</span>
          <span v-if="item.premises_name"><t-icon name="location" />{{ item.premises_name }}</span>
        </div>
        <GsmsRowActions v-if="canWrite" class="card-actions" :delete-title="t('gsms.ressources.equipements.supprimer')" @edit="openForm(item)" @delete="remove(item)" />
      </div>
    </template>
  </GsmsListPage>

  <ActionDialog v-model:visible="form.visible" :title="form.row ? t('gsms.ressources.equipements.modifier') : t('gsms.ressources.equipements.nouveau')"
    :fields="formFields" :run="save" @done="saved">
    <GsmsRefusal v-if="premisesError" :error="premisesError" inline />
  </ActionDialog>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { MessagePlugin } from 'tdesign-vue-next'
import GsmsListPage, { type ListColumn } from '@/components/gsms/GsmsListPage.vue'
import GsmsFilterTabs from '@/components/gsms/GsmsFilterTabs.vue'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import GsmsRowActions from '@/components/gsms/GsmsRowActions.vue'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import ActionDialog from '@/components/gsms/ActionDialog.vue'
import {
  createRessource, deleteRessource, listRessources, updateRessource, type Equipment, type Premises,
} from '@/api/gsms/ressources'
import { useGsmsAccessStore } from '@/stores/gsmsAccess'
import { fmtDate } from '@/components/gsms/format'
import { moyenFields, moyenLabel, moyenOptions, moyenPayload, moyenWrite } from './moyenForm'

const { t } = useI18n()
const access = useGsmsAccessStore()
// Ressource CRUD sans `capabilities` : l'écriture suit la permission de la route (sessions.write).
const canWrite = computed(() => access.can(moyenWrite('equipment')))

const items = ref<Equipment[] | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const actionError = ref<unknown>(null)
const filter = ref('all')

// Classement par prochaine vérification (les équipements sans date en dernier) : simple tri d'affichage.
const byNextCheck = (a: Equipment, b: Equipment) =>
  (a.next_check_on ?? '9999-12-31').localeCompare(b.next_check_on ?? '9999-12-31')

async function load() {
  loading.value = true
  error.value = null
  try {
    items.value = (await listRessources('equipment')).sort(byNextCheck)
  } catch (e) {
    error.value = e
    items.value = null
  } finally {
    loading.value = false
  }
}
onMounted(() => { access.load(); load() })

const overdue = computed(() => (items.value ?? []).filter((e) => e.check_overdue).length)
const next = computed(() => (items.value ?? []).find((e) => e.next_check_on) ?? null)
const filterTabs = computed(() => [
  { value: 'all', label: t('gsms.commun.tous'), count: items.value?.length },
  ...(overdue.value ? [{ value: 'late', label: t('gsms.ressources.equipements.depassees'), count: overdue.value }] : []),
  ...moyenOptions('equipment', 'category').filter((o) => (items.value ?? []).some((e) => e.category === o.value))
    .map((o) => ({ ...o, count: (items.value ?? []).filter((e) => e.category === o.value).length })),
])
const rows = computed(() => items.value?.filter((e) => filter.value === 'all'
  || (filter.value === 'late' ? e.check_overdue : e.category === filter.value)) ?? null)

const columns = computed<ListColumn[]>(() => [
  { colKey: 'label', title: moyenLabel('equipement') },
  { colKey: 'category', title: moyenLabel('category'), width: 150 },
  { colKey: 'quantity', title: moyenLabel('quantite'), width: 70 },
  { colKey: 'premises_name', title: moyenLabel('premises_id') },
  { colKey: 'next_check_on', title: moyenLabel('next_check_on'), width: 160 },
  { colKey: 'status', title: moyenLabel('status'), width: 170 },
  ...(canWrite.value ? [{ colKey: 'actions', title: '', width: 150 }] : []),
])

// Lieux proposés au rattachement : lus à l'ouverture du formulaire (leur refus s'affiche dans le formulaire).
const premises = ref<Premises[]>([])
const premisesError = ref<unknown>(null)
const form = reactive<{ visible: boolean; row: Equipment | null }>({ visible: false, row: null })
const formFields = computed(() => moyenFields('equipment', form.row,
  premises.value.map((p) => ({ value: p.id, label: p.name || p.code || p.id }))))
async function openForm(row: Equipment | null) {
  premisesError.value = null
  try {
    premises.value = await listRessources('premises')
  } catch (e) {
    premises.value = []
    premisesError.value = e
  }
  Object.assign(form, { visible: true, row })
}
const save = (v: Record<string, unknown>) => {
  const body = moyenPayload('equipment', v)
  return form.row ? updateRessource('equipment', form.row.id, body) : createRessource('equipment', body)
}
async function saved() {
  MessagePlugin.success(t('gsms.commun.enregistre'))
  await load()
}

async function remove(e: Equipment) {
  actionError.value = null
  try {
    await deleteRessource('equipment', e.id)
    await load()
  } catch (err) {
    actionError.value = err
  }
}
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.card { .gsms-card(); }
.card--static { cursor: default; }
.card-actions { margin-top: 8px; }
.cell-title { display: block; font-weight: 500; }
.cell-sub { display: block; color: var(--td-text-color-secondary); font-size: var(--app-text-sm); }
.late, .card .card-description.late { color: var(--td-error-color); font-weight: 500; }
.tag-gap { margin-left: 4px; }
.next { .gsms-panel(); display: flex; align-items: center; flex-wrap: wrap; gap: 8px 14px; margin-bottom: 12px;
  border-left: 3px solid var(--td-brand-color);
  &.next--late { border-left-color: var(--td-error-color); .next-icon { color: var(--td-error-color); } } }
.next-icon { color: var(--td-brand-color); flex-shrink: 0; }
.next-text { flex: 1 1 200px; min-width: 0; display: flex; flex-direction: column; gap: 2px; overflow-wrap: anywhere;
  strong { color: var(--td-text-color-primary); font-size: var(--app-text-md); } }
.next-label { .gsms-muted(); }
.next-sub { .gsms-muted(); }
.next-count { .gsms-chip(); color: var(--td-error-color); }
</style>
