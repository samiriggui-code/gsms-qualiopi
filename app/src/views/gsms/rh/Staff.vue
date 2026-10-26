<template>
  <GsmsListPage :title="t('gsms.rh.personnel.titre')" icon="user-list" :subtitle="t('gsms.rh.personnel.sousTitre')"
    :items="rows" :loading="loading" :error="error" :columns="columns" :row-to="(r) => `/platform/personnel/${r.id}`"
    :empty-title="t('gsms.rh.personnel.aucun')" @retry="load">
    <template #actions>
      <t-button v-if="canWrite && !error" size="small" @click="openCreate"><template #icon><t-icon name="add" /></template>{{ t('gsms.rh.personnel.nouveau') }}</t-button>
    </template>
    <template v-if="!error" #toolbar>
      <GsmsFilterTabs v-model="service" :options="serviceTabs" :label="t('gsms.rh.personnel.services')" />
      <GsmsFilterTabs v-model="scope" :options="scopeTabs" :label="t('gsms.rh.personnel.afficher')" />
    </template>

    <template #cell-nom="{ row }">
      <router-link :to="`/platform/personnel/${row.id}`" class="person" @click.stop>
        <GsmsPersonAvatar :name="row.nom" :photo="row.photo_url" />
        <span class="person-text"><span class="cell-title">{{ row.nom }}</span><span v-if="row.fonction" class="cell-sub">{{ row.fonction }}</span></span>
      </router-link>
    </template>
    <template #cell-service="{ row }">
      <span v-if="row.service_libelle">{{ row.service_libelle }}</span><span v-else class="cell-sub">—</span>
    </template>
    <template #cell-statut="{ row }">
      {{ codeLabel(row.statut) }}
      <t-tag v-if="!row.actif" variant="light" size="small" class="tag-gap">{{ t('gsms.rh.personnel.inactif') }}</t-tag>
    </template>
    <template #cell-contrat="{ row }">{{ contractText(row) }}</template>
    <template #cell-absences="{ row }">{{ row.absences.length }}</template>
    <template #cell-formateur="{ row }">
      <router-link v-if="row.formateur_id" :to="`/platform/formateurs/${row.formateur_id}`" class="link" @click.stop>{{ t('gsms.rh.personnel.ficheFormateur') }}</router-link>
      <span v-else class="cell-sub">—</span>
    </template>

    <template #card="{ item }">
      <router-link :to="`/platform/personnel/${item.id}`" class="card">
        <div class="card-header">
          <div class="card-header-left person-static">
            <GsmsPersonAvatar :name="item.nom" :photo="item.photo_url" :size="40" />
            <span class="person-text"><span class="card-title" :title="item.nom">{{ item.nom }}</span>
              <span v-if="item.service_libelle" class="cell-sub">{{ item.service_libelle }}</span></span>
          </div>
          <t-tag variant="light" size="small">{{ codeLabel(item.statut) }}</t-tag>
        </div>
        <div class="card-content"><p class="card-description" :class="{ 'is-empty': !item.fonction }">{{ item.fonction || '—' }}</p></div>
        <div class="card-meta">
          <span>{{ contractText(item) }}</span>
          <span>{{ t('gsms.rh.personnel.nAbsences', { n: item.absences.length }) }}</span>
          <span v-if="!item.actif">{{ t('gsms.rh.personnel.inactif') }}</span>
        </div>
      </router-link>
    </template>
  </GsmsListPage>

  <ActionDialog v-model:visible="createVisible" :title="t('gsms.rh.personnel.nouveau')" icon="user-add" :fields="createFields"
    width="min(760px, calc(100vw - 32px))" :run="create" @done="created">
    <GsmsRefusal v-if="trainersError" :error="trainersError" inline />
  </ActionDialog>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { MessagePlugin } from 'tdesign-vue-next'
import GsmsListPage, { type ListColumn } from '@/components/gsms/GsmsListPage.vue'
import GsmsFilterTabs from '@/components/gsms/GsmsFilterTabs.vue'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import GsmsPersonAvatar from '@/components/gsms/GsmsPersonAvatar.vue'
import ActionDialog from '@/components/gsms/ActionDialog.vue'
import {
  createStaff, listStaff, listStaffServices, listTrainers,
  type StaffIn, type StaffMember, type StaffService, type Trainer,
} from '@/api/gsms/rh'
import { useGsmsAccessStore } from '@/stores/gsmsAccess'
import { fmtDate } from '@/components/gsms/format'
import { codeLabel, staffFields } from './forms'

const ALL = 'tous'
const NONE = 'sans'

const { t } = useI18n()
const router = useRouter()
const access = useGsmsAccessStore()
// Module `hr` désactivé ou droit absent : l'API refuse (403) et le refus s'affiche à la place de la liste.
const canWrite = computed(() => access.can('staff.write'))

const items = ref<StaffMember[] | null>(null)
const services = ref<StaffService[]>([])
const loading = ref(false)
const error = ref<unknown>(null)
const scope = ref('actifs')
const service = ref(ALL)

// Un service précis est filtré par l'API (`?service=`) ; « Sans service » n'a pas de filtre côté API : la liste
// complète est lue et seules les lignes sans service sont affichées.
// Seule la dernière demande met la page à jour (onglets changés vite : une réponse ancienne est ignorée).
let loadSeq = 0
async function load() {
  const seq = ++loadSeq
  loading.value = true
  error.value = null
  const actifs = scope.value === 'actifs'
  const code = service.value === ALL || service.value === NONE ? undefined : service.value
  try {
    const [list, counts] = await Promise.all([listStaff(actifs, code), listStaffServices(actifs)])
    if (seq !== loadSeq) return
    items.value = list
    services.value = counts
  } catch (e) {
    if (seq !== loadSeq) return
    error.value = e
    items.value = null
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}
onMounted(() => { access.load(); load() })
watch([scope, service], load)

const rows = computed(() => (service.value === NONE ? items.value?.filter((m) => !m.service) ?? null : items.value))

const serviceTabs = computed(() => {
  const named = services.value.filter((s) => s.code)
  const none = services.value.find((s) => !s.code)
  return [
    { value: ALL, label: t('gsms.commun.tous'), count: services.value.reduce((n, s) => n + s.effectif, 0) },
    ...named.map((s) => ({ value: s.code!, label: s.libelle, count: s.effectif })),
    ...(none && (none.effectif > 0 || service.value === NONE) ? [{ value: NONE, label: none.libelle, count: none.effectif }] : []),
  ]
})
const scopeTabs = computed(() => [
  { value: 'actifs', label: t('gsms.rh.personnel.actifs') },
  { value: 'tous', label: t('gsms.rh.personnel.tous') },
])

const columns = computed<ListColumn[]>(() => [
  { colKey: 'nom', title: t('gsms.rh.personnel.personne') },
  { colKey: 'service', title: t('gsms.rh.personnel.service'), width: 170 },
  { colKey: 'statut', title: t('gsms.rh.personnel.statut'), width: 150 },
  { colKey: 'contrat', title: t('gsms.rh.personnel.contratEnCours') },
  { colKey: 'absences', title: t('gsms.rh.personnel.absences'), width: 100 },
  { colKey: 'formateur', title: t('gsms.rh.formateurs.formateur'), width: 150 },
])

function contractText(m: StaffMember) {
  const c = m.contrat_en_cours
  if (!c) return t('gsms.rh.personnel.aucunContratEnCours')
  return c.fin ? `${codeLabel(c.type)} · ${t('gsms.rh.personnel.jusquau', { date: fmtDate(c.fin) })}` : codeLabel(c.type)
}

// ── Nouvelle personne (POST /rh/personnel) ──
const createVisible = ref(false)
const trainers = ref<Trainer[]>([])
const trainersError = ref<unknown>(null)
const createFields = computed(() => staffFields(null, services.value, trainers.value))
async function openCreate() {
  trainersError.value = null
  try {
    trainers.value = await listTrainers()
  } catch (e) {
    trainers.value = []
    trainersError.value = e
  }
  createVisible.value = true
}
const create = (v: Record<string, unknown>) => createStaff(v as StaffIn)
async function created(res: unknown) {
  MessagePlugin.success(t('gsms.commun.enregistre'))
  const id = (res as StaffMember | null)?.id
  if (id) router.push(`/platform/personnel/${id}`)
  else await load()
}
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.card { .gsms-card(); width: 100%; text-decoration: none; color: inherit; }
.person { display: inline-flex; align-items: center; gap: 10px; min-width: 0; color: inherit; text-decoration: none;
  &:hover .cell-title { color: var(--td-brand-color); }
  &:focus-visible { outline: 2px solid var(--td-brand-color); outline-offset: 2px; border-radius: var(--app-radius-xs); } }
.person-static { display: inline-flex; align-items: center; gap: 10px; min-width: 0; }
.person-text { display: flex; flex-direction: column; min-width: 0; }
.cell-title { font-weight: 500; color: var(--td-text-color-primary); }
.cell-sub { color: var(--td-text-color-secondary); font-size: var(--app-text-sm); }
.tag-gap { margin-left: 4px; }
.link { color: var(--td-brand-color); text-decoration: none; &:hover { text-decoration: underline; } }
</style>
