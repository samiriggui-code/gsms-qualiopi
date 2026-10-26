<template>
  <GsmsListPage :title="t('gsms.qualite.dossier.titre')" icon="folder" :subtitle="dossier ? dossier.label : t('gsms.qualite.dossier.sousTitre')"
    :items="rows" :loading="loading" :error="error" :columns="columns" row-key="code" :empty-title="t('gsms.qualite.dossier.aucune')" @retry="load">
    <template #toolbar>
      <GsmsFilterTabs v-model="filter" :options="filterTabs" :label="t('gsms.commun.filtrerEtat')" />
      <span v-if="dossier" class="muted">{{ t('gsms.qualite.dossier.completude', { n: dossier.complete, total: dossier.required }) }}</span>
    </template>
    <template #before><GsmsRefusal v-if="actionError" :error="actionError" inline /></template>

    <template #cell-label="{ row }">
      <span class="cell-title">{{ row.label }}</span>
      <span class="cell-sub">{{ row.required ? t('gsms.qualite.dossier.obligatoire') : t('gsms.qualite.dossier.facultative') }}
        <template v-for="n in row.indicators" :key="n"> · I{{ n }}</template></span>
    </template>
    <template #cell-state="{ row }"><GsmsStatusTag :code="row.state" /></template>
    <template #cell-piece="{ row }"><span class="cell-sub">{{ pieceText(row) }}</span></template>
    <template #cell-actions="{ row }"><PieceActions :item="row" /></template>

    <template #card="{ item }">
      <div class="card card--static">
        <div class="card-header">
          <div class="card-header-left"><span class="card-title" :title="item.label">{{ item.label }}</span></div>
          <GsmsStatusTag :code="item.state" />
        </div>
        <div class="card-content">
          <p class="card-description" :class="{ 'is-empty': !item.document && !item.request }">{{ pieceText(item) }}</p>
          <p v-if="item.evidence" class="muted">
            <router-link :to="`/platform/qualite/preuves/${item.evidence.id}`">{{ item.evidence.reference }}</router-link>
            · {{ stateLabel(item.evidence.status) }}<template v-if="item.evidence.valid_until"> · {{ t('gsms.qualite.dossier.valableJusquau', { date: fmtDate(item.evidence.valid_until) }) }}</template>
          </p>
          <p v-if="item.evidence?.issues.length" class="issues">{{ item.evidence.issues.join(' · ') }}</p>
        </div>
        <div class="card-meta">
          <span>{{ item.required ? t('gsms.qualite.dossier.obligatoire') : t('gsms.qualite.dossier.facultative') }}</span>
          <span v-for="n in item.indicators" :key="n" class="chip">I{{ n }}</span>
        </div>
        <PieceActions :item="item" class="card-actions" />
      </div>
    </template>
  </GsmsListPage>

  <ActionDialog v-model:visible="upload.visible" :title="t('gsms.qualite.dossier.deposerTitre', { piece: upload.item?.label ?? '' })"
    :confirm-label="t('gsms.qualite.dossier.deposer')" :fields="[{ name: 'note', label: t('gsms.qualite.dossier.note'), type: 'textarea' }]" :run="submitUpload" @done="done">
    <div class="file-field">
      <label class="field-label" for="gsms-piece-file">{{ t('gsms.qualite.dossier.fichier') }}</label>
      <input id="gsms-piece-file" type="file" @change="onFile" />
      <span v-if="upload.file" class="file-chosen">
        <img v-if="fileTypeIcon(upload.file.name, upload.file.type)" :src="fileTypeIcon(upload.file.name, upload.file.type)!" alt="" />{{ upload.file.name }}
      </span>
    </div>
    <GridPoints v-if="upload.item" v-model="upload.grille" :points="upload.item.grille" :title="t('gsms.grille.titre')" />
  </ActionDialog>
  <ActionDialog v-model:visible="paper.visible" :title="t('gsms.qualite.dossier.papierTitre', { piece: paper.item?.label ?? '' })"
    :confirm-label="t('gsms.qualite.dossier.declarer')"
    :fields="[{ name: 'lieu', label: t('gsms.qualite.dossier.lieu') }, { name: 'note', label: t('gsms.qualite.dossier.note'), type: 'textarea' }]"
    :run="submitPaper" @done="done">
    <GridPoints v-if="paper.item" v-model="paper.grille" :points="paper.item.grille" :title="t('gsms.grille.titre')" />
  </ActionDialog>
  <ActionDialog v-model:visible="request.visible" :title="t('gsms.qualite.dossier.demanderTitre', { piece: request.item?.label ?? '' })"
    :confirm-label="t('gsms.qualite.dossier.envoyerDemande')"
    :fields="[{ name: 'requested_from', label: t('gsms.qualite.dossier.demandeeA') }, { name: 'due_on', label: t('gsms.qualite.dossier.echeance'), type: 'date' }, { name: 'message', label: t('gsms.qualite.dossier.message'), type: 'textarea' }]"
    :run="submitRequest" @done="done" />
</template>

<script setup lang="ts">
import { fileTypeIcon } from '@/components/gsms/media'
import { computed, defineComponent, h, onMounted, reactive, ref, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button as TButton, MessagePlugin } from 'tdesign-vue-next'
import GsmsListPage, { type ListColumn } from '@/components/gsms/GsmsListPage.vue'
import GsmsFilterTabs from '@/components/gsms/GsmsFilterTabs.vue'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import ActionDialog from '@/components/gsms/ActionDialog.vue'
import GridPoints from '@/components/gsms/GridPoints.vue'
import {
  declarePaperPiece, downloadDocument, downloadPieceModel, getPieceDossier, requestPiece, uploadPiece,
  type PieceDossier, type PieceItem,
} from '@/api/gsms/dossiers'
import { getOrganisme } from '@/api/gsms/platform'
import { useGsmsAccessStore } from '@/stores/gsmsAccess'
import { fmtDate, refusalText, stateLabel } from '@/components/gsms/format'

const { t } = useI18n()
const access = useGsmsAccessStore()
const orgId = ref('')
const dossier = ref<PieceDossier | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const actionError = ref<unknown>(null)
const filter = ref('all')

// Aucune `capabilities` ici : les boutons d'écriture suivent la permission de la route (docs/API.md :
// quality.write pour le dossier de l'organisme). L'API tranche à chaque dépôt.
const canWrite = computed(() => access.can('quality.write'))

async function load() {
  loading.value = true
  error.value = null
  try {
    if (!orgId.value) {
      const org = await getOrganisme()
      if (!org.id) throw new Error(t('gsms.qualite.dossier.organismeAbsent'))
      orgId.value = org.id
    }
    dossier.value = await getPieceDossier('ORGANISME', orgId.value)
  } catch (e) {
    error.value = e
    dossier.value = null
  } finally {
    loading.value = false
  }
}
onMounted(() => { access.load(); load() })

const STATES = ['MANQUANTE', 'EN_RETARD', 'DEMANDEE', 'A_COMPLETER', 'REJETEE', 'EXPIREE', 'RECUE', 'VALIDEE']
const filterTabs = computed(() => {
  const items = dossier.value?.items ?? []
  const present = STATES.filter((s) => items.some((i) => i.state === s))
  return [{ value: 'all', label: t('gsms.commun.toutes'), count: items.length },
    ...present.map((s) => ({ value: s, label: stateLabel(s), count: items.filter((i) => i.state === s).length }))]
})
const rows = computed(() => dossier.value?.items.filter((i) => filter.value === 'all' || i.state === filter.value) ?? null)
const columns = computed<ListColumn[]>(() => [
  { colKey: 'label', title: t('gsms.qualite.dossier.piece') },
  { colKey: 'state', title: t('gsms.qualite.indicateurs.colEtat'), width: 130 },
  { colKey: 'piece', title: t('gsms.qualite.dossier.depot') },
  { colKey: 'actions', title: '' },
])

function pieceText(item: PieceItem) {
  if (item.document) {
    const name = item.document.support === 'PAPIER' ? t('gsms.qualite.dossier.originalPapier') : item.document.name
    return [name, `v${item.document.version}`, fmtDate(item.document.uploaded_at), item.document.by].filter(Boolean).join(' · ')
  }
  if (item.request) return t('gsms.qualite.dossier.demandeeLe', { qui: item.request.from, date: fmtDate(item.request.due_on) })
  return t('gsms.qualite.dossier.aucunDepot')
}

async function download(item: PieceItem) {
  if (!item.document) return
  try { await downloadDocument(item.document.id, item.document.name || item.code) } catch (e) { MessagePlugin.error(refusalText(e)) }
}
async function model(item: PieceItem) {
  try { await downloadPieceModel('ORGANISME', item.code) } catch (e) { MessagePlugin.error(refusalText(e)) }
}

const upload = reactive<{ visible: boolean; item: PieceItem | null; file: File | null; grille: Record<string, string> }>({ visible: false, item: null, file: null, grille: {} })
const paper = reactive<{ visible: boolean; item: PieceItem | null; grille: Record<string, string> }>({ visible: false, item: null, grille: {} })
const request = reactive<{ visible: boolean; item: PieceItem | null }>({ visible: false, item: null })
const onFile = (e: Event) => { upload.file = (e.target as HTMLInputElement).files?.[0] ?? null }

function submitUpload(v: Record<string, any>) {
  if (!upload.file || !upload.item) return Promise.reject(new Error(t('gsms.qualite.dossier.choisirFichier')))
  return uploadPiece('ORGANISME', orgId.value, upload.item.code, upload.file, upload.grille, v.note)
}
const submitPaper = (v: Record<string, any>) =>
  declarePaperPiece('ORGANISME', orgId.value, paper.item!.code, { grille: paper.grille, lieu: v.lieu ?? '', note: v.note || null })
const submitRequest = (v: Record<string, any>) =>
  requestPiece('ORGANISME', orgId.value, request.item!.code, { requested_from: v.requested_from ?? '', due_on: v.due_on ?? '', message: v.message || null })

async function done() {
  MessagePlugin.success(t('gsms.commun.misAJour'))
  await load()
}

/** Boutons d'une pièce : télécharger, trame, et (droit d'écriture) déposer, original papier, demander. */
const PieceActions = defineComponent({
  props: { item: { type: Object as PropType<PieceItem>, required: true } },
  setup(props) {
    const btn = (label: string, onClick: () => void, variant: 'text' | 'outline' = 'outline') =>
      h(TButton, { size: 'small', variant, onClick }, () => label)
    return () => {
      const i = props.item
      return h('div', { class: 'piece-actions', onClick: (e: Event) => e.stopPropagation() }, [
        i.document && i.document.support !== 'PAPIER' ? btn(t('gsms.commun.telecharger'), () => download(i), 'text') : null,
        i.modele ? btn(t('gsms.qualite.dossier.trame'), () => model(i), 'text') : null,
        ...(canWrite.value ? [
          btn(t('gsms.qualite.dossier.deposer'), () => Object.assign(upload, { visible: true, item: i, file: null, grille: {} })),
          btn(t('gsms.qualite.dossier.originalPapier'), () => Object.assign(paper, { visible: true, item: i, grille: {} })),
          btn(t('gsms.qualite.dossier.demander'), () => Object.assign(request, { visible: true, item: i })),
        ] : []),
      ])
    }
  },
})
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.card { .gsms-card(); }
.card--static { cursor: default; }
.card .card-content { overflow: visible; }
.chip { .gsms-chip(); }
.muted { .gsms-muted(); margin: 4px 0 0; a { color: var(--td-brand-color); } }
.issues { margin: 4px 0 0; color: var(--td-warning-color); font-size: var(--app-text-xs); line-height: 16px; }
.card-actions { margin-top: 10px; }
.cell-title { display: block; font-weight: 500; }
.cell-sub { display: block; color: var(--td-text-color-secondary); font-size: var(--app-text-sm); }
:deep(.piece-actions) { display: flex; flex-wrap: wrap; gap: 6px; }
.file-field { margin-bottom: 12px; input { max-width: 100%; } }
.file-chosen { display: flex; align-items: center; gap: 8px; margin-top: 8px; font-size: var(--app-text-sm); overflow-wrap: anywhere; img { width: 28px; height: 28px; flex-shrink: 0; } }
.field-label { display: block; margin-bottom: 6px; font-size: var(--app-text-md); color: var(--td-text-color-primary); }
</style>
