<template>
  <section class="panel">
    <div class="panel-bar">
      <h3 class="title">{{ dossier?.label || t('gsms.rh.fiche.dossier') }}</h3>
      <span v-if="dossier" class="muted">{{ t('gsms.qualite.dossier.completude', { n: dossier.complete, total: dossier.required }) }}</span>
    </div>
    <GsmsRefusal v-if="error" :error="error" inline>
      <t-button size="small" variant="outline" @click="load">{{ t('gsms.commun.reessayer') }}</t-button>
    </GsmsRefusal>
    <t-skeleton v-else-if="!dossier" animation="gradient" :row-col="[{ width: '100%' }, { width: '100%' }]" />
    <p v-else-if="!dossier.items.length" class="muted">{{ t('gsms.qualite.dossier.aucune') }}</p>
    <ul v-else class="rows">
      <li v-for="item in dossier.items" :key="item.code" class="row">
        <div class="row-head">
          <span class="row-main">{{ item.label }}</span>
          <GsmsStatusTag :code="item.state" />
        </div>
        <p class="muted">
          {{ item.required ? t('gsms.qualite.dossier.obligatoire') : t('gsms.qualite.dossier.facultative') }}
          <template v-for="n in item.indicators" :key="n"> · I{{ n }}</template> · {{ pieceText(item) }}
        </p>
        <p v-if="item.evidence" class="muted">
          <router-link :to="`/platform/qualite/preuves/${item.evidence.id}`">{{ item.evidence.reference }}</router-link>
          · {{ stateLabel(item.evidence.status) }}<template v-if="item.evidence.valid_until"> · {{ t('gsms.qualite.dossier.valableJusquau', { date: fmtDate(item.evidence.valid_until) }) }}</template>
        </p>
        <p v-if="item.evidence?.issues.length" class="issues">{{ item.evidence.issues.join(' · ') }}</p>
        <div class="row-actions">
          <t-button v-if="item.document && item.document.support !== 'PAPIER'" size="small" variant="text" @click="download(item)">{{ t('gsms.commun.telecharger') }}</t-button>
          <t-button v-if="item.modele" size="small" variant="text" @click="model(item)">{{ t('gsms.qualite.dossier.trame') }}</t-button>
          <template v-if="canWrite">
            <t-button size="small" variant="outline" @click="Object.assign(upload, { visible: true, item, file: null, grille: {} })">{{ t('gsms.qualite.dossier.deposer') }}</t-button>
            <t-button size="small" variant="outline" @click="Object.assign(paper, { visible: true, item, grille: {} })">{{ t('gsms.qualite.dossier.originalPapier') }}</t-button>
            <t-button size="small" variant="outline" @click="Object.assign(request, { visible: true, item })">{{ t('gsms.qualite.dossier.demander') }}</t-button>
          </template>
        </div>
      </li>
    </ul>
  </section>

  <ActionDialog v-model:visible="upload.visible" :title="t('gsms.qualite.dossier.deposerTitre', { piece: upload.item?.label ?? '' })"
    :confirm-label="t('gsms.qualite.dossier.deposer')" :fields="[{ name: 'note', label: t('gsms.qualite.dossier.note'), type: 'textarea' }]" :run="submitUpload" @done="done">
    <div class="file-field">
      <label class="field-label" for="gsms-trainer-piece-file">{{ t('gsms.qualite.dossier.fichier') }}</label>
      <input id="gsms-trainer-piece-file" type="file" @change="onFile" />
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
/**
 * Dossier de pièces FORMATEUR d'une fiche formateur (GET /dossiers/FORMATEUR/{id}, `quality.read`) : états, dépôts,
 * originaux papier et demandes, calculés et jugés par l'API. Les boutons d'écriture suivent `trainers.write`.
 */
import { fileTypeIcon } from '@/components/gsms/media'
import { reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { MessagePlugin } from 'tdesign-vue-next'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import ActionDialog from '@/components/gsms/ActionDialog.vue'
import GridPoints from '@/components/gsms/GridPoints.vue'
import {
  declarePaperPiece, downloadDocument, downloadPieceModel, getPieceDossier, requestPiece, uploadPiece,
  type PieceDossier, type PieceItem,
} from '@/api/gsms/dossiers'
import { fmtDate, refusalText, stateLabel } from '@/components/gsms/format'

const props = defineProps<{ trainerId: string; canWrite: boolean }>()
const { t } = useI18n()

const dossier = ref<PieceDossier | null>(null)
const error = ref<unknown>(null)

async function load() {
  const id = props.trainerId
  error.value = null
  try {
    const res = await getPieceDossier('FORMATEUR', id)
    if (id === props.trainerId) dossier.value = res
  } catch (e) {
    if (id === props.trainerId) { error.value = e; dossier.value = null }
  }
}
watch(() => props.trainerId, () => { dossier.value = null; load() }, { immediate: true })

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
  try { await downloadPieceModel('FORMATEUR', item.code) } catch (e) { MessagePlugin.error(refusalText(e)) }
}

const upload = reactive<{ visible: boolean; item: PieceItem | null; file: File | null; grille: Record<string, string> }>({ visible: false, item: null, file: null, grille: {} })
const paper = reactive<{ visible: boolean; item: PieceItem | null; grille: Record<string, string> }>({ visible: false, item: null, grille: {} })
const request = reactive<{ visible: boolean; item: PieceItem | null }>({ visible: false, item: null })
const onFile = (e: Event) => { upload.file = (e.target as HTMLInputElement).files?.[0] ?? null }

function submitUpload(v: Record<string, any>) {
  if (!upload.file || !upload.item) return Promise.reject(new Error(t('gsms.qualite.dossier.choisirFichier')))
  return uploadPiece('FORMATEUR', props.trainerId, upload.item.code, upload.file, upload.grille, v.note)
}
const submitPaper = (v: Record<string, any>) =>
  declarePaperPiece('FORMATEUR', props.trainerId, paper.item!.code, { grille: paper.grille, lieu: v.lieu ?? '', note: v.note || null })
const submitRequest = (v: Record<string, any>) =>
  requestPiece('FORMATEUR', props.trainerId, request.item!.code, { requested_from: v.requested_from ?? '', due_on: v.due_on ?? '', message: v.message || null })

async function done() {
  MessagePlugin.success(t('gsms.commun.misAJour'))
  await load()
}
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.panel { .gsms-panel(); }
.title { .gsms-panel-title(); margin: 0; }
.panel-bar { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.muted { .gsms-muted(); margin: 4px 0 0; overflow-wrap: anywhere; a { color: var(--td-brand-color); } }
.rows { .gsms-rows(); }
.row { padding: 10px 14px; }
.row-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.row-main { flex: 1 1 160px; min-width: 0; color: var(--td-text-color-primary); font-size: var(--app-text-md); font-weight: 500; overflow-wrap: anywhere; }
.row-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.issues { margin: 4px 0 0; color: var(--td-warning-color); font-size: var(--app-text-xs); line-height: 16px; }
.file-field { margin-bottom: 12px; input { max-width: 100%; } }
.file-chosen { display: flex; align-items: center; gap: 8px; margin-top: 8px; font-size: var(--app-text-sm); overflow-wrap: anywhere; img { width: 28px; height: 28px; flex-shrink: 0; } }
.field-label { display: block; margin-bottom: 6px; font-size: var(--app-text-md); color: var(--td-text-color-primary); }
</style>
