<template>
  <GsmsListPage :title="t('gsms.rh.developpement.titre')" icon="chart-bar" :subtitle="t('gsms.rh.developpement.sousTitre')"
    :items="rows" :loading="loading" :error="error" :columns="columns" :empty-title="t('gsms.rh.developpement.aucune')" @retry="load">
    <template #actions>
      <t-button v-if="canWrite" size="small" @click="openForm(null)"><template #icon><t-icon name="add" /></template>{{ t('gsms.rh.developpement.nouvelle') }}</t-button>
    </template>
    <template #toolbar>
      <GsmsFilterTabs v-model="filter" :options="filterTabs" :label="t('gsms.commun.filtrerEtat')" />
    </template>
    <template #before><GsmsRefusal v-if="actionError" :error="actionError" inline /></template>

    <template #cell-label="{ row }"><span class="cell-title">{{ row.label }}</span></template>
    <template #cell-trainer_name="{ row }">
      <router-link v-if="row.trainer_id" :to="`/platform/formateurs/${row.trainer_id}`" class="person" @click.stop>
        <GsmsPersonAvatar :name="row.trainer_name" :size="24" />{{ row.trainer_name }}
      </router-link>
      <span v-else class="cell-sub">{{ t('gsms.rh.developpement.sansFormateur') }}</span>
    </template>
    <template #cell-planned_on="{ row }">{{ fmtDate(row.planned_on) }}</template>
    <template #cell-completed_on="{ row }">
      <t-tag :theme="row.completed_on ? 'success' : 'default'" variant="light" size="small">
        {{ row.completed_on ? t('gsms.rh.developpement.realiseeLe', { date: fmtDate(row.completed_on) }) : t('gsms.rh.developpement.nonRealisee') }}
      </t-tag>
    </template>
    <template #cell-actions="{ row }"><GsmsRowActions v-if="canWrite" :delete-title="t('gsms.rh.developpement.supprimer')" @edit="openForm(row)" @delete="remove(row)" /></template>

    <template #card="{ item }">
      <div class="card card--static">
        <div class="card-header">
          <div class="card-header-left"><span class="card-title" :title="item.label">{{ item.label }}</span></div>
          <t-tag :theme="item.completed_on ? 'success' : 'default'" variant="light" size="small">
            {{ item.completed_on ? t('gsms.rh.developpement.realisee') : t('gsms.rh.developpement.nonRealisee') }}
          </t-tag>
        </div>
        <div class="card-meta">
          <router-link v-if="item.trainer_id" :to="`/platform/formateurs/${item.trainer_id}`" class="person">
            <GsmsPersonAvatar :name="item.trainer_name" :size="20" />{{ item.trainer_name }}
          </router-link>
          <span v-else>{{ t('gsms.rh.developpement.sansFormateur') }}</span>
          <span>{{ t('gsms.rh.developpement.prevueLe', { date: fmtDate(item.planned_on) }) }}</span>
          <span v-if="item.completed_on">{{ t('gsms.rh.developpement.realiseeLe', { date: fmtDate(item.completed_on) }) }}</span>
        </div>
        <GsmsRowActions v-if="canWrite" class="card-actions" :delete-title="t('gsms.rh.developpement.supprimer')" @edit="openForm(item)" @delete="remove(item)" />
      </div>
    </template>
  </GsmsListPage>

  <ActionDialog v-model:visible="form.visible" :title="form.row ? t('gsms.rh.developpement.modifier') : t('gsms.rh.developpement.nouvelle')"
    :fields="formFields" :run="save" @done="saved">
    <GsmsRefusal v-if="trainersError" :error="trainersError" inline />
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
import GsmsPersonAvatar from '@/components/gsms/GsmsPersonAvatar.vue'
import ActionDialog, { type ActionField } from '@/components/gsms/ActionDialog.vue'
import {
  createStaffDevelopment, deleteStaffDevelopment, listStaffDevelopment, listTrainers, updateStaffDevelopment,
  type StaffDevelopment, type StaffDevelopmentIn, type Trainer,
} from '@/api/gsms/rh'
import { useGsmsAccessStore } from '@/stores/gsmsAccess'
import { fmtDate } from '@/components/gsms/format'

const { t } = useI18n()
const access = useGsmsAccessStore()
// Ressource CRUD sans `capabilities` : l'écriture suit la permission de la route (trainers.write).
const canWrite = computed(() => access.can('trainers.write'))

const items = ref<StaffDevelopment[] | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const actionError = ref<unknown>(null)
const filter = ref('all')

async function load() {
  loading.value = true
  error.value = null
  try {
    items.value = await listStaffDevelopment()
  } catch (e) {
    error.value = e
    items.value = null
  } finally {
    loading.value = false
  }
}
onMounted(() => { access.load(); load() })

const filterTabs = computed(() => [
  { value: 'all', label: t('gsms.commun.toutes'), count: items.value?.length },
  { value: 'todo', label: t('gsms.rh.developpement.nonRealisees'), count: (items.value ?? []).filter((d) => !d.completed_on).length },
  { value: 'done', label: t('gsms.rh.developpement.realisees'), count: (items.value ?? []).filter((d) => !!d.completed_on).length },
])
const rows = computed(() => items.value?.filter((d) => filter.value === 'all' || (filter.value === 'done') === !!d.completed_on) ?? null)

const columns = computed<ListColumn[]>(() => [
  { colKey: 'label', title: t('gsms.rh.developpement.action') },
  { colKey: 'trainer_name', title: t('gsms.rh.formateurs.formateur') },
  { colKey: 'planned_on', title: t('gsms.rh.developpement.prevue'), width: 120 },
  { colKey: 'completed_on', title: t('gsms.rh.developpement.realisation'), width: 180 },
  ...(canWrite.value ? [{ colKey: 'actions', title: '', width: 150 }] : []),
])

// Formateurs proposés : lus à l'ouverture du formulaire (leur refus s'affiche dans le formulaire).
const trainers = ref<Trainer[]>([])
const trainersError = ref<unknown>(null)
const form = reactive<{ visible: boolean; row: StaffDevelopment | null }>({ visible: false, row: null })
const formFields = computed<ActionField[]>(() => [
  { name: 'label', label: `${t('gsms.rh.developpement.action')} *`, initial: form.row?.label },
  { name: 'trainer_id', label: t('gsms.rh.formateurs.formateur'), type: 'select', initial: form.row?.trainer_id ?? undefined,
    options: trainers.value.map((f) => ({ value: f.id, label: f.full_name })) },
  { name: 'planned_on', label: t('gsms.rh.developpement.prevue'), type: 'date', initial: form.row?.planned_on ?? undefined },
  { name: 'completed_on', label: t('gsms.rh.developpement.realisation'), type: 'date', initial: form.row?.completed_on ?? undefined },
])
async function openForm(row: StaffDevelopment | null) {
  trainersError.value = null
  try {
    trainers.value = await listTrainers()
  } catch (e) {
    trainers.value = []
    trainersError.value = e
  }
  Object.assign(form, { visible: true, row })
}
const save = (v: Record<string, unknown>) =>
  (form.row ? updateStaffDevelopment(form.row.id, v as StaffDevelopmentIn) : createStaffDevelopment(v as StaffDevelopmentIn))
async function saved() {
  MessagePlugin.success(t('gsms.commun.enregistre'))
  await load()
}

async function remove(d: StaffDevelopment) {
  actionError.value = null
  try {
    await deleteStaffDevelopment(d.id)
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
.card-actions { margin-top: 8px; }
.cell-title { display: block; font-weight: 500; }
.cell-sub { color: var(--td-text-color-secondary); font-size: var(--app-text-sm); }
.person { display: inline-flex; align-items: center; gap: 6px; color: inherit; text-decoration: none; &:hover { color: var(--td-brand-color); } }
</style>
