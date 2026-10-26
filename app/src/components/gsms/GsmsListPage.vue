<template>
  <div class="gsms-page">
    <div class="gsms-page-content">
      <GsmsPageHeader :title="title" :icon="icon" :subtitle="subtitle" :back="back" :back-label="backLabel">
        <template v-if="$slots.actions" #actions><slot name="actions" /></template>
      </GsmsPageHeader>
      <div v-if="$slots.toolbar" class="gsms-toolbar"><slot name="toolbar" /></div>
      <div ref="mainEl" class="gsms-page-main">
        <slot name="before" />
        <div v-if="loading && !items" class="cards" aria-busy="true">
          <div v-for="n in 6" :key="n" class="card is-skeleton">
            <t-skeleton animation="gradient" :row-col="[{ width: '50%' }, { width: '100%' }, { width: '70%' }]" />
          </div>
        </div>
        <GsmsRefusal v-else-if="error" :error="error">
          <t-button size="small" variant="outline" @click="emit('retry')">{{ t('gsms.commun.reessayer') }}</t-button>
        </GsmsRefusal>
        <template v-else-if="items">
          <GsmsEmptyState v-if="!items.length" :title="emptyTitle || t('gsms.commun.aucunResultat')" :description="emptyDescription">
            <slot name="empty-actions" />
          </GsmsEmptyState>
          <div v-else :class="useTable ? 'list-card' : 'list-plain'">
            <div class="table-bar">
              <span class="table-count" aria-live="polite">
                {{ t('gsms.liste.lignes', { n: items.length }, items.length) }}
                <span v-if="sort.sortBy" class="table-sorted">· {{ t('gsms.liste.trieesSur', { col: sortedTitle }) }}</span>
              </span>
              <div class="table-tools">
                <t-radio-group v-if="canSwitchView" v-model="view" variant="default-filled" size="small" :aria-label="t('gsms.liste.affichage')">
                  <t-radio-button value="table" :aria-label="t('gsms.liste.vueListe')" :title="t('gsms.liste.vueListe')"><t-icon name="view-list" /></t-radio-button>
                  <t-radio-button value="cards" :aria-label="t('gsms.liste.vueCartes')" :title="t('gsms.liste.vueCartes')"><t-icon name="view-module" /></t-radio-button>
                </t-radio-group>
                <template v-if="useTable">
                  <t-radio-group v-model="density" variant="default-filled" size="small" :aria-label="t('gsms.liste.densite')">
                    <t-radio-button value="compact" :aria-label="t('gsms.liste.compacte')" :title="t('gsms.liste.compacte')">
                      <t-icon name="format-vertical-align-center" />
                    </t-radio-button>
                    <t-radio-button value="confort" :aria-label="t('gsms.liste.confortable')" :title="t('gsms.liste.confortable')">
                      <t-icon name="line-height" />
                    </t-radio-button>
                  </t-radio-group>
                  <t-popup trigger="click" placement="bottom-right" :overlay-inner-style="{ padding: '10px 12px' }">
                    <t-button size="small" variant="outline" :aria-label="t('gsms.liste.colonnes')">
                      <template #icon><t-icon name="setting-1" /></template>{{ isNarrow ? '' : t('gsms.liste.colonnes') }}
                    </t-button>
                    <template #content>
                      <fieldset class="col-picker">
                        <legend>{{ t('gsms.liste.colonnesVisibles') }}</legend>
                        <t-checkbox v-for="(c, i) in columns" :key="c.colKey" :checked="!hidden.has(c.colKey)"
                          :disabled="i === 0" @change="(v: boolean) => toggleColumn(c.colKey, v)">{{ c.title }}</t-checkbox>
                        <button v-if="hidden.size" type="button" class="link-btn" @click="resetColumns">{{ t('gsms.liste.toutAfficher') }}</button>
                      </fieldset>
                    </template>
                  </t-popup>
                </template>
                <t-button v-if="exportable && columns.length" size="small" variant="outline" :title="t('gsms.liste.exporterAide')"
                  @click="exportCsv">
                  <template #icon><t-icon name="download" /></template>{{ t('gsms.liste.exporter') }}
                </t-button>
              </div>
            </div>
            <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
            <div v-if="useTable" class="table-wrap" @keydown.enter="rowKeydown">
              <t-table :data="pageItems" :columns="tableColumns" :row-key="rowKey" hover :size="density === 'compact' ? 'small' : 'medium'"
                class="table" :class="{ 'is-clickable': !!rowTo }" table-layout="auto" :sort="sort.sortBy ? sort : undefined"
                :header-affixed-top="{ container: () => mainEl ?? win }" :row-attributes="rowAttributes" :row-class-name="rowClass"
                @sort-change="onSort" :on-row-click="rowClick">
                <template v-for="col in visibleColumns" :key="col.colKey" #[col.colKey]="{ row }">
                  <slot :name="`cell-${col.colKey}`" :row="row as T">
                    <component :is="col.link && rowTo ? RouterLink : 'span'" v-bind="col.link && rowTo ? { to: rowTo(row as T), class: 'cell-link', onClick: stop } : { class: 'cell-plain' }">
                      <span v-if="col.kind === 'person'" class="cell-person">
                        <GsmsPersonAvatar :name="raw(row, col.colKey)" :email="col.emailKey ? row[col.emailKey] : null" :size="density === 'compact' ? 24 : 30" />
                        <span class="cell-person__text">
                          <span class="cell-person__name">{{ display(row, col.colKey) }}</span>
                          <span v-if="col.emailKey && row[col.emailKey]" class="cell-person__mail">{{ row[col.emailKey] }}</span>
                        </span>
                      </span>
                      <GsmsStatusTag v-else-if="col.kind === 'status'" :code="raw(row, col.colKey)" :label="col.labelKey ? row[col.labelKey] : null" />
                      <span v-else-if="col.kind === 'centimes' || col.kind === 'euros'" class="cell-num">{{ cellText(row, col) }}</span>
                      <time v-else-if="col.kind === 'relative'" :datetime="raw(row, col.colKey) ?? undefined" :title="exactDate(raw(row, col.colKey))">{{ fmtRelative(raw(row, col.colKey)) }}</time>
                      <template v-else>{{ cellText(row, col) }}</template>
                    </component>
                  </slot>
                </template>
              </t-table>
            </div>
            <div v-else class="cards">
              <template v-for="item in pageItems" :key="String(item[rowKey])">
                <slot name="card" :item="item" />
              </template>
            </div>
            <div class="pager">
              <span class="pager-range">{{ t('gsms.liste.plage', { from: rangeFrom, to: rangeTo, total: sortedItems.length }) }}</span>
              <t-pagination v-if="sortedItems.length > pageSize" v-model:current="page" :total="sortedItems.length" :page-size="pageSize" size="small"
                :show-page-size="false" :show-jumper="false" :total-content="false" />
            </div>
          </div>
        </template>
        <slot name="after" />
        <GsmsHelpFooter v-if="help" :context="helpContext" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts" generic="T extends Record<string, any>">
/**
 * Patron de niveau 2 (liste) : en-tête + action, barre de filtres, tableau (≥ 768 px) ou cartes (téléphone),
 * pagination, squelette, état vide illustré et refus lisible. La page fournit les lignes déjà filtrées par l'API.
 * Ici, uniquement de la présentation : tri des lignes reçues (aucune route ne propose de tri), colonnes visibles et
 * densité mémorisées par utilisateur, export CSV des lignes reçues telles qu'affichées (aucun calcul).
 */
import { computed, reactive, ref, useSlots, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import GsmsPageHeader from './GsmsPageHeader.vue'
import GsmsRefusal from './GsmsRefusal.vue'
import GsmsEmptyState from './GsmsEmptyState.vue'
import GsmsPersonAvatar from './GsmsPersonAvatar.vue'
import GsmsStatusTag from './GsmsStatusTag.vue'
import GsmsHelpFooter from './GsmsHelpFooter.vue'
import { useGsmsShellStore } from '@/stores/gsmsShell'
import { loadPreference, savePreference } from '@/composables/preferenceStorage'
import { fmtDate, fmtDateTime, stateLabel } from './format'
import { exactDate, fmtCentimes, fmtEuros, fmtRelative, toCsv } from './cellFormat'

export interface ListColumn {
  colKey: string
  title: string
  width?: number | string
  /** Cellule cliquable vers la fiche (`rowTo`). */
  link?: boolean
  /**
   * Rendu riche sans gabarit de la page : personne (avatar + nom + e-mail `emailKey`), statut (`labelKey`),
   * montant en centimes ou en euros (aligné à droite), date, date et heure, date relative (date exacte au survol).
   */
  kind?: 'text' | 'person' | 'status' | 'centimes' | 'euros' | 'date' | 'datetime' | 'relative'
  emailKey?: string
  labelKey?: string
  align?: 'left' | 'right' | 'center'
  minWidth?: number
  /** Tri des lignes reçues ; vrai par défaut si la valeur est simple (texte, nombre, date). */
  sortable?: boolean
  /** Texte de la cellule pour le tri et l'export quand la page la dessine elle-même (objet, gabarit). */
  text?: (row: any) => string | number | null | undefined
}

const props = withDefaults(defineProps<{
  title: string
  icon?: string
  subtitle?: string
  back?: string
  backLabel?: string
  items: T[] | null
  loading?: boolean
  error?: unknown
  /** Colonnes du tableau (grand écran) ; sans colonnes, la liste reste en cartes. */
  columns?: ListColumn[]
  rowKey?: string
  rowTo?: (row: T) => string
  emptyTitle?: string
  emptyDescription?: string
  pageSize?: number
  /** Clé de mémorisation des colonnes visibles (par défaut : le nom de la route). */
  storageKey?: string
  exportable?: boolean
  /** Cartes d'aide en bas de page (assistant, référentiel), texte adapté à la rubrique si fourni. */
  help?: boolean
  helpContext?: string
}>(), {
  icon: 'app', subtitle: '', back: '', backLabel: '', loading: false, columns: () => [], rowKey: 'id',
  rowTo: undefined, emptyTitle: '', emptyDescription: '', pageSize: 24, storageKey: '', exportable: true,
  help: true, helpContext: '',
})
const emit = defineEmits<{ retry: [] }>()
const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const { isMobile } = storeToRefs(useGsmsShellStore())
const mainEl = ref<HTMLElement | null>(null)
const isNarrow = computed(() => isMobile.value)
const stop = (e: Event) => e.stopPropagation()

// ── Préférences d'affichage (par utilisateur, stockage local protégé) ─────────────────────────────────────
const prefKey = computed(() => `gsms.liste.${props.storageKey || String(route.name ?? route.path)}`)
function readHidden(): Set<string> {
  try {
    const v = JSON.parse(loadPreference(`${prefKey.value}.colonnes`) ?? '[]')
    return new Set(Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}
const hidden = ref<Set<string>>(readHidden())
watch(prefKey, () => { hidden.value = readHidden() })
function saveHidden() { savePreference(`${prefKey.value}.colonnes`, JSON.stringify([...hidden.value])) }
function toggleColumn(key: string, visible: boolean) {
  const next = new Set(hidden.value)
  if (visible) next.delete(key)
  else next.add(key)
  hidden.value = next
  saveHidden()
}
function resetColumns() { hidden.value = new Set(); saveHidden() }

const density = ref<'compact' | 'confort'>(loadPreference('gsms.liste.densite') === 'compact' ? 'compact' : 'confort')
watch(density, (v) => savePreference('gsms.liste.densite', v))

// ── Valeurs affichées, tri et export ──────────────────────────────────────────────────────────────────────
const raw = (row: Record<string, any>, key: string) => row[key]
const display = (row: Record<string, any>, key: string) => {
  const v = row[key]
  return v === null || v === undefined || v === '' ? '—' : String(v)
}
function cellText(row: Record<string, any>, col: ListColumn): string {
  if (col.text) {
    const v = col.text(row)
    return v === null || v === undefined || v === '' ? '—' : String(v)
  }
  const v = row[col.colKey]
  switch (col.kind) {
    case 'centimes': return fmtCentimes(v)
    case 'euros': return fmtEuros(v)
    case 'date': return fmtDate(v)
    case 'datetime': return fmtDateTime(v)
    case 'relative': return exactDate(v) || '—'
    case 'status': return (col.labelKey && row[col.labelKey]) || stateLabel(v)
    default:
      if (v !== null && typeof v === 'object') return '—'
      return display(row, col.colKey)
  }
}
function sortValue(row: Record<string, any>, col: ListColumn): string | number | null {
  const v = col.text ? col.text(row) : row[col.colKey]
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'object') return null
  if (col.kind === 'centimes' || col.kind === 'euros') { const n = Number(v); return Number.isFinite(n) ? n : String(v) }
  if (col.kind === 'status') return cellText(row, col)
  return String(v)
}
const isSortable = (col: ListColumn) => {
  if (col.sortable !== undefined) return col.sortable
  if (col.text) return true
  const sample = (props.items ?? []).find((r) => r[col.colKey] !== null && r[col.colKey] !== undefined)?.[col.colKey]
  return sample === undefined || typeof sample !== 'object'
}

const sort = reactive<{ sortBy: string; descending: boolean }>({ sortBy: '', descending: false })
const onSort = (s: { sortBy: string; descending: boolean } | undefined) => {
  sort.sortBy = s?.sortBy ?? ''
  sort.descending = !!s?.descending
  page.value = 1
}
const sortedTitle = computed(() => props.columns.find((c) => c.colKey === sort.sortBy)?.title ?? '')
const collator = computed(() => new Intl.Collator(locale.value, { numeric: true, sensitivity: 'base' }))
const sortedItems = computed<T[]>(() => {
  const list = props.items ?? []
  const col = props.columns.find((c) => c.colKey === sort.sortBy)
  if (!col) return list
  const dir = sort.descending ? -1 : 1
  return [...list].sort((a, b) => {
    const va = sortValue(a, col)
    const vb = sortValue(b, col)
    if (va === null) return vb === null ? 0 : 1 // valeurs vides toujours en fin
    if (vb === null) return -1
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
    return collator.value.compare(String(va), String(vb)) * dir
  })
})

const page = ref(1)
watch(() => props.items, () => { page.value = 1 })
const pageItems = computed(() => sortedItems.value.slice((page.value - 1) * props.pageSize, page.value * props.pageSize))
const rangeFrom = computed(() => (sortedItems.value.length ? (page.value - 1) * props.pageSize + 1 : 0))
const rangeTo = computed(() => Math.min(page.value * props.pageSize, sortedItems.value.length))
// Affichage « Liste » (tableau) ou « Cartes » au choix, mémorisé par page ; sur téléphone, toujours les cartes.
const slots = useSlots()
const canSwitchView = computed(() => props.columns.length > 0 && !!slots.card && !isMobile.value)
const view = ref<'table' | 'cards'>('table')
const readView = () => { view.value = loadPreference(`${prefKey.value}.affichage`) === 'cards' ? 'cards' : 'table' }
readView()
watch(prefKey, readView)
watch(view, (v) => savePreference(`${prefKey.value}.affichage`, v))
const useTable = computed(() => props.columns.length > 0 && !isMobile.value && (view.value === 'table' || !slots.card))
const visibleColumns = computed(() => props.columns.filter((c, i) => i === 0 || !hidden.value.has(c.colKey)))
const tableColumns = computed(() => visibleColumns.value.map((c) => ({
  colKey: c.colKey, title: c.title, width: c.width,
  // Largeur minimale : un nom ou un intitulé ne se coupe jamais au milieu d'un mot faute de place.
  minWidth: c.minWidth ?? (c.kind === 'person' ? 200 : 110),
  align: c.align ?? (c.kind === 'centimes' || c.kind === 'euros' ? 'right' : undefined),
  sorter: isSortable(c),
})))

function exportCsv() {
  const cols = useTable.value ? visibleColumns.value : props.columns
  const rows = sortedItems.value.map((r) => cols.map((c) => { const v = cellText(r, c); return v === '—' ? '' : v }))
  const blob = new Blob([toCsv(cols.map((c) => c.title), rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const slug = props.title.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  a.href = url
  a.download = `${slug || 'liste'}-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ── Lignes : survol, ligne ouverte en dernier, clavier ─────────────────────────────────────────────────────
const lastOpened = ref<string>('')
const rowAttributes = ({ row }: { row: Record<string, any> }) =>
  (props.rowTo ? { tabindex: 0, 'data-row-key': String(row[props.rowKey]) } : {})
const rowClass = ({ row }: { row: Record<string, any> }) => (String(row[props.rowKey]) === lastOpened.value ? 'is-last-opened' : '')
function open(row: Record<string, any>) {
  if (!props.rowTo) return
  lastOpened.value = String(row[props.rowKey])
  router.push(props.rowTo(row as T))
}
const rowClick = ({ row }: { row: Record<string, any> }) => open(row)
function rowKeydown(e: KeyboardEvent) {
  const tr = (e.target as HTMLElement | null)?.closest?.('tr[data-row-key]')
  if (!tr || e.target !== tr) return
  const row = pageItems.value.find((r) => String(r[props.rowKey]) === tr.getAttribute('data-row-key'))
  if (row) open(row)
}
const win = globalThis.window
</script>

<style scoped lang="less">
@import (reference) './gsms-list.less';
.gsms-page { .gsms-page-shell(); }
.gsms-page-content { .resource-list-content(); }
.gsms-page-main { .resource-list-main(); display: flex; flex-direction: column; > * { flex-shrink: 0; } }
.gsms-toolbar { .gsms-toolbar(); }
.cards { .gsms-grid(); }
.card { .gsms-card(); }
.table { .gsms-table(); }
.link-btn { .gsms-link-button(); }
// Grand écran : barre d'outils, tableau et pagination dans une même carte (disposition des listes Metronic).
.list-card {
  border: 1px solid var(--td-component-stroke);
  background: var(--td-bg-color-container);
  overflow: hidden;
  .gsms-elevated();
  .table-bar { margin: 0; padding: 12px 16px; border-bottom: 1px solid var(--td-component-stroke); }
  .table { border: 0; border-radius: 0; box-shadow: none; }
  .pager { margin: 0; padding: 10px 16px; border-top: 1px solid var(--td-component-stroke); }
}
.table-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin-bottom: 10px;
}
.table-count { color: var(--td-text-color-secondary); font-size: var(--app-text-sm); font-variant-numeric: tabular-nums; }
.table-sorted { color: var(--td-text-color-placeholder); }
.table-tools { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.col-picker {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 200px;
  max-height: 320px;
  overflow-y: auto;
  margin: 0;
  padding: 0;
  border: 0;
  legend { margin-bottom: 6px; padding: 0; color: var(--td-text-color-secondary); font-size: var(--app-text-xs); font-weight: 600; }
}
.table-wrap {
  :deep(.t-table__header) th { background: var(--td-bg-color-secondarycontainer); }
  :deep(.t-table__affixed-header-elm) { border-radius: 0; box-shadow: 0 6px 12px -8px rgba(0, 0, 0, 0.25); }
  :deep(tbody td) { vertical-align: middle; }
  :deep(tbody tr) { transition: background-color var(--app-motion-instant) ease; }
  :deep(tbody tr:focus-visible) { outline: 2px solid var(--td-brand-color); outline-offset: -2px; }
  :deep(tbody tr.is-last-opened) { box-shadow: inset 3px 0 0 var(--td-brand-color); background: var(--td-brand-color-light); }
  .table:not(.is-clickable) :deep(tbody tr) { cursor: default; }
}
.cell-link { color: var(--td-text-color-primary); font-weight: 500; text-decoration: none; &:hover { color: var(--td-brand-color); } }
.cell-link:focus-visible { outline: 2px solid var(--td-brand-color); outline-offset: 2px; border-radius: var(--app-radius-xs); }
.cell-num { display: inline-block; font-variant-numeric: tabular-nums; white-space: nowrap; }
.cell-person { display: inline-flex; align-items: center; gap: 8px; min-width: 0; }
.cell-person__text { display: flex; flex-direction: column; min-width: 0; }
.cell-person__name { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cell-person__mail { color: var(--td-text-color-secondary); font-size: var(--app-text-xs); font-weight: 400; overflow-wrap: break-word; }
time { white-space: nowrap; text-decoration: underline dotted var(--td-text-color-placeholder); text-underline-offset: 3px; cursor: help; }
.pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
  @media (max-width: 720px) { justify-content: center; }
}
.pager-range { color: var(--td-text-color-secondary); font-size: var(--app-text-sm); font-variant-numeric: tabular-nums; }
</style>
