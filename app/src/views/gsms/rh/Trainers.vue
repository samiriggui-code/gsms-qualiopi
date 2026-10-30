<template>
  <GsmsListPage :title="t('gsms.rh.formateurs.titre')" icon="user-talk" :subtitle="t('gsms.rh.formateurs.sousTitre')"
    :items="rows" :loading="loading" :error="error" :columns="columns" :row-to="(r) => `/platform/formateurs/${r.id}`"
    :empty-title="t('gsms.rh.formateurs.aucun')" @retry="load">
    <template #actions>
      <t-button v-if="canWrite" size="small" @click="formVisible = true"><template #icon><t-icon name="add" /></template>{{ t('gsms.rh.formateurs.nouveau') }}</t-button>
    </template>
    <template #toolbar>
      <GsmsFilterTabs v-model="filter" :options="filterTabs" :label="t('gsms.rh.formateurs.statut')" />
      <t-input v-model="search" class="search" clearable :placeholder="t('gsms.rh.formateurs.rechercher')">
        <template #prefix-icon><t-icon name="search" /></template>
      </t-input>
    </template>

    <template #cell-full_name="{ row }">
      <router-link :to="`/platform/formateurs/${row.id}`" class="person" @click.stop>
        <GsmsPersonAvatar :name="row.full_name" :photo="row.photo_url" />
        <span class="person-text"><span class="cell-title">{{ row.full_name }}</span><span v-if="row.email" class="cell-sub">{{ row.email }}</span></span>
      </router-link>
    </template>
    <template #cell-is_external="{ row }">{{ row.is_external ? t('gsms.rh.formateurs.externe') : t('gsms.rh.formateurs.interne') }}</template>
    <template #cell-specialties="{ row }">
      <span v-if="row.specialties.length" class="chips"><span v-for="s in row.specialties" :key="s" class="chip">{{ s }}</span></span>
      <span v-else class="cell-sub">—</span>
    </template>
    <template #cell-account="{ row }">{{ row.user_id ? t('gsms.rh.formateurs.compteRelie') : '—' }}</template>

    <template #card="{ item }">
      <router-link :to="`/platform/formateurs/${item.id}`" class="card">
        <div class="card-header">
          <div class="card-header-left person">
            <GsmsPersonAvatar :name="item.full_name" :photo="item.photo_url" :size="40" />
            <span class="card-title" :title="item.full_name">{{ item.full_name }}</span>
          </div>
          <t-tag variant="light" size="small">{{ item.is_external ? t('gsms.rh.formateurs.externe') : t('gsms.rh.formateurs.interne') }}</t-tag>
        </div>
        <div v-if="item.specialties.length" class="card-content chips"><span v-for="s in item.specialties" :key="s" class="chip">{{ s }}</span></div>
        <div class="card-meta">
          <span><t-icon name="calendar-1" />{{ t('gsms.rh.formateurs.nSessions', { n: item.sessions }) }}</span>
          <span><t-icon name="certificate" />{{ t('gsms.rh.formateurs.nTitres', { n: item.qualifications }) }}</span>
          <span v-if="item.user_id"><t-icon name="user-checked" />{{ t('gsms.rh.formateurs.compteRelie') }}</span>
        </div>
      </router-link>
    </template>
  </GsmsListPage>

  <ActionDialog v-model:visible="formVisible" :title="t('gsms.rh.formateurs.nouveau')" icon="user-add" :fields="trainerFields(null)"
    width="min(720px, calc(100vw - 32px))" :run="create" @done="created" />
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { MessagePlugin } from 'tdesign-vue-next'
import GsmsListPage, { type ListColumn } from '@/components/gsms/GsmsListPage.vue'
import GsmsFilterTabs from '@/components/gsms/GsmsFilterTabs.vue'
import GsmsPersonAvatar from '@/components/gsms/GsmsPersonAvatar.vue'
import ActionDialog from '@/components/gsms/ActionDialog.vue'
import { createTrainer, listTrainers, type Trainer } from '@/api/gsms/rh'
import { useGsmsAccessStore } from '@/stores/gsmsAccess'
import { trainerFields, trainerPayload } from './forms'

const { t } = useI18n()
const router = useRouter()
const access = useGsmsAccessStore()
// Ressource CRUD sans `capabilities` : l'écriture suit la permission de la route (trainers.write).
const canWrite = computed(() => access.can('trainers.write'))

const items = ref<Trainer[] | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const filter = ref('all')
const search = ref('')
const formVisible = ref(false)

async function load() {
  loading.value = true
  error.value = null
  try {
    items.value = await listTrainers()
  } catch (e) {
    error.value = e
    items.value = null
  } finally {
    loading.value = false
  }
}
onMounted(() => { access.load(); load() })

const filterTabs = computed(() => [
  { value: 'all', label: t('gsms.commun.tous'), count: items.value?.length },
  { value: 'int', label: t('gsms.rh.formateurs.internes'), count: (items.value ?? []).filter((f) => !f.is_external).length },
  { value: 'ext', label: t('gsms.rh.formateurs.externes'), count: (items.value ?? []).filter((f) => f.is_external).length },
])
const rows = computed(() => {
  const q = search.value.trim().toLowerCase()
  return items.value?.filter((f) => (filter.value === 'all' || f.is_external === (filter.value === 'ext'))
    && (!q || [f.full_name, f.email ?? '', ...f.specialties].some((s) => s.toLowerCase().includes(q)))) ?? null
})

const columns = computed<ListColumn[]>(() => [
  { colKey: 'full_name', title: t('gsms.rh.formateurs.formateur') },
  { colKey: 'is_external', title: t('gsms.rh.formateurs.statut'), width: 110 },
  { colKey: 'specialties', title: t('gsms.rh.formateurs.specialites') },
  { colKey: 'sessions', title: t('gsms.rh.formateurs.sessions'), width: 100 },
  { colKey: 'qualifications', title: t('gsms.rh.formateurs.titres'), width: 90 },
  { colKey: 'account', title: t('gsms.rh.formateurs.compte'), width: 130 },
])

const create = (v: Record<string, unknown>) => createTrainer(trainerPayload(v))
async function created(res: unknown) {
  MessagePlugin.success(t('gsms.commun.enregistre'))
  const id = (res as Trainer | null)?.id
  if (id) router.push(`/platform/formateurs/${id}`)
  else await load()
}
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.card { .gsms-card(); text-decoration: none; color: inherit; }
.search { .gsms-search(); }
.person { display: inline-flex; align-items: center; gap: 10px; min-width: 0; color: inherit; text-decoration: none; }
.person-text { display: flex; flex-direction: column; min-width: 0; }
.cell-title { font-weight: 500; color: var(--td-text-color-primary); }
.cell-sub { color: var(--td-text-color-secondary); font-size: var(--app-text-sm); overflow-wrap: anywhere; }
.chips { display: flex; flex-wrap: wrap; gap: 4px; }
.chip { .gsms-chip(); }
</style>
