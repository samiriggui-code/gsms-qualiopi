<template>
  <GsmsListPage :title="t('gsms.communication.documents.titre')" icon="folder-open" :subtitle="t('gsms.communication.documents.sousTitre')"
    :items="rows" :loading="loading" :error="error" :columns="columns" :row-to="(r) => `/platform/qualite/preuves/${r.id}`"
    :empty-title="filtered ? t('gsms.commun.aucunResultat') : t('gsms.communication.documents.aucun')"
    :empty-description="filtered ? t('gsms.commun.aucunResultatFiltres') : t('gsms.communication.documents.aucunAide')" @retry="load">
    <template v-if="!error" #toolbar>
      <GsmsFilterTabs v-model="subject" :options="subjectTabs" :label="t('gsms.communication.documents.filtrerSujet')" />
      <t-select v-model="type" class="type" :options="typeOptions" clearable :placeholder="t('gsms.communication.documents.tousTypes')"
        :aria-label="t('gsms.communication.documents.filtrerType')" />
      <t-input v-model="query" class="search" :placeholder="t('gsms.communication.documents.rechercher')" :aria-label="t('gsms.commun.rechercher')" clearable>
        <template #prefix-icon><t-icon name="search" size="16px" /></template>
      </t-input>
    </template>
    <template v-if="!error && data" #before>
      <p class="notice"><t-icon name="info-circle" size="14px" />{{ t('gsms.communication.documents.source') }}</p>
      <p v-if="data.total > data.affichees" class="notice notice--warn">
        <t-icon name="error-circle" size="14px" />{{ t('gsms.communication.documents.tronque', { n: data.affichees, total: data.total }) }}
      </p>
    </template>

    <template #cell-libelle="{ row }">
      <router-link :to="`/platform/qualite/preuves/${row.id}`" class="title-link" @click.stop>
        <span class="cell-title">{{ row.libelle }}</span><span class="cell-sub">{{ row.reference }}</span>
      </router-link>
    </template>
    <template #cell-sujet="{ row }">
      <span class="cell-title">{{ row.cible || '—' }}</span><span class="cell-sub">{{ row.portee_libelle }}</span>
    </template>
    <template #cell-produite_le="{ row }">{{ fmtDate(row.produite_le) }}</template>
    <template #cell-statut="{ row }"><GsmsStatusTag :code="row.statut" :label="row.statut_libelle" /></template>
    <template #cell-fichier="{ row }">
      <t-button size="small" variant="outline" :loading="downloading === row.id" @click.stop="download(row)">
        <template #icon><t-icon name="download" /></template>{{ t('gsms.commun.telecharger') }}
      </t-button>
    </template>

    <template #card="{ item }">
      <div class="card">
        <router-link :to="`/platform/qualite/preuves/${item.id}`" class="card-link">
          <div class="card-header">
            <span class="card-title">{{ item.libelle }}</span>
            <GsmsStatusTag :code="item.statut" :label="item.statut_libelle" />
          </div>
          <div class="card-meta">
            <span><t-icon name="file" size="14px" />{{ item.type_libelle }}</span>
            <span><t-icon name="user" size="14px" />{{ item.portee_libelle }}<template v-if="item.cible"> · {{ item.cible }}</template></span>
            <span><t-icon name="time" size="14px" />{{ item.reference }} · {{ fmtDate(item.produite_le) }}</span>
          </div>
        </router-link>
        <t-button size="small" variant="outline" class="card-dl" :loading="downloading === item.id" @click="download(item)">
          <template #icon><t-icon name="download" /></template>{{ t('gsms.commun.telecharger') }}
        </t-button>
      </div>
    </template>
  </GsmsListPage>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { MessagePlugin } from 'tdesign-vue-next'
import GsmsListPage, { type ListColumn } from '@/components/gsms/GsmsListPage.vue'
import GsmsFilterTabs from '@/components/gsms/GsmsFilterTabs.vue'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import { listEvidence, type EvidenceList, type EvidenceRow } from '@/api/gsms/qualite'
import { downloadDocument } from '@/api/gsms/dossiers'
import { fmtDate, toRefusal } from '@/components/gsms/format'

/**
 * Documents conservés par l'application : l'API n'a pas de liste transverse des documents (`GET /documents`) ;
 * ceux qu'elle rattache aux preuves Qualiopi (pièces déposées, documents rédigés par le moteur) sont lus dans
 * GET /qualiopi/preuves (filtres type et recherche faits par l'API) et téléchargés par GET /documents/{id}/contenu.
 */
const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const data = ref<EvidenceList | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const type = ref<string | undefined>(typeof route.query.type === 'string' ? route.query.type : undefined)
const subject = ref(typeof route.query.sujet === 'string' ? route.query.sujet : 'all')
const query = ref('')
const downloading = ref('')
let timer: ReturnType<typeof setTimeout> | undefined
let seq = 0

async function load() {
  const n = ++seq
  loading.value = true
  error.value = null
  try {
    const result = await listEvidence({ type: type.value || undefined, recherche: query.value.trim() || undefined })
    if (n === seq) data.value = result
  } catch (e) {
    if (n !== seq) return
    error.value = e
    data.value = null
  } finally {
    if (n === seq) loading.value = false
  }
}
onMounted(load)
onBeforeUnmount(() => clearTimeout(timer))
watch(type, (v) => { router.replace({ query: { ...route.query, type: v || undefined } }); load() })
watch(subject, (v) => router.replace({ query: { ...route.query, sujet: v === 'all' ? undefined : v } }))
watch(query, () => { clearTimeout(timer); timer = setTimeout(load, 300) })

/** Seules les preuves qui portent un document stocké sont des documents. */
const documents = computed(() => (data.value?.preuves ?? []).filter((p) => !!p.document_id))
const rows = computed(() => (data.value ? documents.value.filter((p) => subject.value === 'all' || p.portee === subject.value) : null))
const filtered = computed(() => !!type.value || subject.value !== 'all' || !!query.value.trim())

// Sujets présents dans la réponse, avec le libellé de l'API (portée de la preuve : organisme, formateur, session…).
const subjectTabs = computed(() => {
  const seen = new Map<string, { label: string; count: number }>()
  for (const p of documents.value) {
    const s = seen.get(p.portee) ?? { label: p.portee_libelle, count: 0 }
    s.count += 1
    seen.set(p.portee, s)
  }
  return [
    { value: 'all', label: t('gsms.commun.tous'), count: data.value ? documents.value.length : undefined },
    ...[...seen.entries()].map(([value, s]) => ({ value, label: s.label, count: s.count })),
  ]
})
const typeOptions = computed(() => (data.value?.types ?? []).map((x) => ({ value: x.type, label: x.libelle })))

const columns = computed<ListColumn[]>(() => [
  { colKey: 'libelle', title: t('gsms.communication.documents.colDocument') },
  { colKey: 'type_libelle', title: t('gsms.communication.documents.colType') },
  { colKey: 'sujet', title: t('gsms.communication.documents.colSujet') },
  { colKey: 'produite_le', title: t('gsms.communication.documents.colDate'), width: 120 },
  { colKey: 'statut', title: t('gsms.communication.documents.colStatut'), width: 140 },
  { colKey: 'fichier', title: '', width: 150 },
])

async function download(row: EvidenceRow) {
  if (!row.document_id) return
  downloading.value = row.id
  try {
    await downloadDocument(row.document_id, row.reference)
  } catch (e) {
    MessagePlugin.error(toRefusal(e).message)
  } finally {
    downloading.value = ''
  }
}
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.search { .gsms-search(); }
.type { width: 240px; max-width: 100%; @media (max-width: 720px) { width: 100%; } }
.notice { .gsms-notice(); }
.notice--warn { background: var(--td-warning-color-light); .t-icon { color: var(--td-warning-color); } }
.card { .gsms-card(); }
.card-link { display: block; color: inherit; text-decoration: none; &:hover .card-title { color: var(--td-brand-color); } }
.card .card-title { overflow-wrap: anywhere; white-space: normal; }
.card-dl { margin-top: 10px; align-self: flex-start; }
.title-link { display: flex; flex-direction: column; color: inherit; text-decoration: none; &:hover .cell-title { color: var(--td-brand-color); } }
.cell-title { display: block; font-weight: 500; color: var(--td-text-color-primary); overflow-wrap: anywhere; }
.cell-sub { display: block; color: var(--td-text-color-secondary); font-size: var(--app-text-sm); overflow-wrap: anywhere; }
</style>
