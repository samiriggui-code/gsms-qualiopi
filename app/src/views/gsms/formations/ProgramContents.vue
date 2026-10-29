<template>
  <section class="panel">
    <div class="pc-bar">
      <h3 class="title">{{ t('gsms.formations.ressources') }}</h3>
      <span class="muted">{{ t('gsms.formations.contenusCompte', { n: resources.length, v: validated }, resources.length) }}</span>
    </div>
    <p v-if="!resources.length" class="muted">{{ t('gsms.formations.aucuneRessource') }}</p>
    <div v-for="g in groups" :key="g.key" class="pc-group">
      <h4 class="pc-group__title">{{ g.label }} <span class="muted">· {{ g.items.length }}</span></h4>
      <ul class="pc-rows">
        <li v-for="r in g.items" :key="r.id" class="pc-row">
          <span v-if="r.module_code" class="pc-code">{{ r.module_code }}</span>
          <span class="pc-main">
            <span class="pc-title">{{ r.title }}</span>
            <span v-if="r.rights !== 'PROPRIETAIRE'" class="pc-rights">{{ t('gsms.formations.droits.' + r.rights) }}</span>
          </span>
          <GsmsStatusTag :code="r.status" />
          <t-button v-if="r.file_name" size="small" variant="outline" @click="open(r)">
            <template #icon><t-icon name="book-open" /></template>{{ t('gsms.formations.lire') }}
          </t-button>
        </li>
      </ul>
    </div>
  </section>

  <t-drawer v-model:visible="readerVisible" :header="current?.title || ''" size="min(920px, 100vw)" :footer="!!current && canEdit"
    attach="body" destroy-on-close>
    <GsmsRefusal v-if="error" :error="error" inline />
    <t-skeleton v-else-if="loading" animation="gradient" :row-col="[{ width: '60%' }, { width: '100%' }, { width: '100%' }, { width: '90%' }]" />
    <template v-else-if="current">
      <p v-if="current.note" class="pc-note"><t-icon name="info-circle" size="14px" /> {{ current.note }}</p>
      <dl v-if="meta.length" class="pc-meta">
        <div v-for="m in meta" :key="m.k"><dt>{{ m.k }}</dt><dd>{{ m.v }}</dd></div>
      </dl>
      <!-- Markdown rendu et nettoyé (DOMPurify) ; une banque YAML reste lisible telle quelle -->
      <article v-if="html" class="pc-doc" v-html="html" />
      <pre v-else class="pc-raw">{{ raw }}</pre>
    </template>
    <template #footer>
      <div class="pc-foot">
        <GsmsRefusal v-if="actionError" :error="actionError" inline />
        <t-button v-if="current?.status !== 'VALIDE'" theme="primary" :loading="busy" @click="setStatus('VALIDE')">
          <template #icon><t-icon name="check" /></template>{{ t('gsms.formations.validerContenu') }}
        </t-button>
        <t-button v-else variant="outline" :loading="busy" @click="setStatus('BROUILLON')">{{ t('gsms.formations.repasserBrouillon') }}</t-button>
      </div>
    </template>
  </t-drawer>
</template>

<script setup lang="ts">
/**
 * Contenus pédagogiques d'une formation (cours, QCM, évaluations, référentiel) : liste par type, lecture du fichier
 * dans un tiroir, validation par le formateur. L'API garde le fichier et son empreinte ; l'écran n'en décide rien.
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import { fetchText } from '@/api/gsms/files'
import { programResourceFilePath, updateProgramResource, type ProgramResource } from '@/api/gsms/training'
import { renderDocumentPreviewMarkdown } from '@/utils/documentPreviewMarkdown'

const props = defineProps<{ programId: string; resources: ProgramResource[]; canEdit: boolean }>()
const emit = defineEmits<{ changed: [] }>()
const { t, te } = useI18n()

const ORDER = ['COURS', 'QUIZ', 'EVALUATION', 'SUPPORT', 'CAS_PRATIQUE', 'AUTRE']
const isMac = (r: ProgramResource) => /^M\d{2}$/.test(r.module_code ?? '') || r.title.startsWith('MAC — ')
const groups = computed(() => {
  const keyOf = (r: ProgramResource) => (r.kind === 'COURS' && isMac(r) ? 'COURS_MAC' : r.kind)
  const keys = [...new Set(props.resources.map(keyOf))]
    .sort((a, b) => ORDER.indexOf(a.replace('_MAC', '')) - ORDER.indexOf(b.replace('_MAC', '')) || a.localeCompare(b))
  return keys.map((key) => ({
    key,
    label: te(`gsms.formations.types.${key}`) ? t(`gsms.formations.types.${key}`) : key,
    items: props.resources.filter((r) => keyOf(r) === key)
      // Modules dans l'ordre (A01, A02…), puis sommaires et contenus sans module.
      .sort((a, b) => Number(!a.module_code) - Number(!b.module_code)
        || (a.module_code ?? '').localeCompare(b.module_code ?? '') || a.title.localeCompare(b.title)),
  }))
})
const validated = computed(() => props.resources.filter((r) => r.status === 'VALIDE').length)

const readerVisible = ref(false)
const current = ref<ProgramResource | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const actionError = ref<unknown>(null)
const busy = ref(false)
const raw = ref('')
const html = ref('')
const meta = ref<{ k: string; v: string }[]>([])

/** En-tête YAML du fichier (formation, module, durée, sources…) affiché à part, corps rendu en Markdown. */
function split(text: string): { head: string; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text)
  return m ? { head: m[1], body: text.slice(m[0].length) } : { head: '', body: text }
}
const LABELS: Record<string, string> = { duree_officielle: 'Durée officielle', annexe: 'Annexe', statut: 'Statut' }

async function open(r: ProgramResource) {
  current.value = r
  readerVisible.value = true
  loading.value = true
  error.value = actionError.value = null
  html.value = raw.value = ''
  meta.value = []
  try {
    const text = await fetchText(programResourceFilePath(props.programId, r.id))
    if (r.mime_type === 'text/markdown') {
      const { head, body } = split(text)
      meta.value = Object.entries(LABELS).flatMap(([key, label]) => {
        const m = new RegExp(`^${key}:\\s*"?(.+?)"?\\s*$`, 'm').exec(head)
        return m ? [{ k: label, v: m[1] }] : []
      })
      html.value = renderDocumentPreviewMarkdown(body)
    } else {
      raw.value = text
    }
  } catch (e) {
    error.value = e
  } finally {
    loading.value = false
  }
}

async function setStatus(status: 'VALIDE' | 'BROUILLON') {
  if (!current.value) return
  busy.value = true
  actionError.value = null
  try {
    await updateProgramResource(props.programId, current.value.id, { status })
    current.value = { ...current.value, status }
    emit('changed')
  } catch (e) {
    actionError.value = e
  } finally {
    busy.value = false
  }
}
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.panel { .gsms-panel(); }
.title { .gsms-panel-title(); margin: 0; }
.muted { .gsms-muted(); }
.pc-bar { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 6px 12px; margin-bottom: 12px; }
.pc-group + .pc-group { margin-top: 18px; }
.pc-group__title { margin: 0 0 8px; font-size: var(--app-text-md); font-weight: 600; color: var(--td-text-color-primary); }
.pc-rows { .gsms-rows(); }
.pc-row { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 12px; padding: 10px 14px; }
.pc-code { min-width: 40px; padding: 1px 6px; border-radius: var(--td-radius-small); background: var(--td-bg-color-secondarycontainer);
  color: var(--td-text-color-secondary); font-size: var(--app-text-sm); font-weight: 600; text-align: center; font-variant-numeric: tabular-nums; }
.pc-main { flex: 1 1 240px; min-width: 0; display: flex; flex-direction: column; }
.pc-title { color: var(--td-text-color-primary); font-size: var(--app-text-md); font-weight: 500; overflow-wrap: anywhere; }
.pc-rights { color: var(--td-error-color); font-size: var(--app-text-sm); }
.pc-note { display: flex; gap: 6px; align-items: flex-start; margin: 0 0 12px; padding: 8px 12px; border-radius: var(--app-radius-sm);
  background: var(--td-bg-color-secondarycontainer); color: var(--td-text-color-secondary); font-size: var(--app-text-sm); }
.pc-meta { display: flex; flex-wrap: wrap; gap: 8px 24px; margin: 0 0 16px;
  dt { color: var(--td-text-color-placeholder); font-size: var(--app-text-xs); } dd { margin: 0; font-size: var(--app-text-md); } }
.pc-doc { max-width: 78ch; color: var(--td-text-color-primary); font-size: var(--app-text-base); line-height: 1.6;
  :deep(h1) { font-size: var(--app-text-3xl); margin: 0 0 12px; } :deep(h2) { font-size: var(--app-text-xl); margin: 24px 0 8px; }
  :deep(h3) { font-size: var(--app-text-lg); margin: 18px 0 6px; }
  :deep(table) { width: 100%; border-collapse: collapse; margin: 8px 0 16px; font-size: var(--app-text-md); display: block; overflow-x: auto; }
  :deep(th), :deep(td) { padding: 6px 8px; border: 1px solid var(--td-component-stroke); text-align: left; vertical-align: top; }
  :deep(th) { background: var(--td-bg-color-secondarycontainer); font-weight: 600; } }
.pc-raw { max-height: 70vh; overflow: auto; padding: 12px; border-radius: var(--app-radius-sm); background: var(--td-bg-color-secondarycontainer);
  font-family: var(--app-font-family-mono); font-size: var(--app-text-sm); white-space: pre-wrap; }
.pc-foot { display: flex; justify-content: flex-end; align-items: center; gap: 8px; flex-wrap: wrap; }
</style>
