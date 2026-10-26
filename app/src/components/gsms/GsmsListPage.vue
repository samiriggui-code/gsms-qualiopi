<template>
  <div class="gsms-page">
    <div class="gsms-page-content">
      <GsmsPageHeader :title="title" :icon="icon" :subtitle="subtitle" :back="back" :back-label="backLabel">
        <template v-if="$slots.actions" #actions><slot name="actions" /></template>
      </GsmsPageHeader>
      <div v-if="$slots.toolbar" class="gsms-toolbar"><slot name="toolbar" /></div>
      <div class="gsms-page-main">
        <slot name="before" />
        <div v-if="loading && !items" class="cards">
          <div v-for="n in 6" :key="n" class="card is-skeleton">
            <t-skeleton animation="gradient" :row-col="[{ width: '50%' }, { width: '100%' }, { width: '70%' }]" />
          </div>
        </div>
        <GsmsRefusal v-else-if="error" :error="error">
          <t-button size="small" variant="outline" @click="emit('retry')">{{ t('gsms.commun.reessayer') }}</t-button>
        </GsmsRefusal>
        <template v-else-if="items">
          <EmptyState v-if="!items.length" :icon="emptyIcon || icon" :title="emptyTitle || t('gsms.commun.aucunResultat')" :description="emptyDescription">
            <slot name="empty-actions" />
          </EmptyState>
          <template v-else>
            <t-table v-if="useTable" :data="pageItems" :columns="tableColumns" :row-key="rowKey" hover size="medium"
              class="table" table-layout="auto" :on-row-click="rowClick">
              <template v-for="col in columns" :key="col.colKey" #[col.colKey]="{ row }">
                <slot :name="`cell-${col.colKey}`" :row="row as T">
                  <router-link v-if="col.link && rowTo" :to="rowTo(row as T)" class="cell-link" @click.stop>{{ display(row, col.colKey) }}</router-link>
                  <template v-else>{{ display(row, col.colKey) }}</template>
                </slot>
              </template>
            </t-table>
            <div v-else class="cards">
              <template v-for="item in pageItems" :key="String(item[rowKey])">
                <slot name="card" :item="item" />
              </template>
            </div>
            <div v-if="items.length > pageSize" class="pager">
              <t-pagination v-model:current="page" :total="items.length" :page-size="pageSize" size="small"
                :show-page-size="false" :show-jumper="false" :total-content="!isMobile" />
            </div>
          </template>
        </template>
        <slot name="after" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts" generic="T extends Record<string, any>">
/**
 * Patron de niveau 2 (liste) : en-tête + action, barre de filtres, tableau (≥ 768 px) ou cartes (téléphone),
 * pagination, squelette, état vide et refus lisible. La page fournit les lignes déjà filtrées ; rien n'est calculé ici.
 */
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import EmptyState from '@/components/EmptyState.vue'
import GsmsPageHeader from './GsmsPageHeader.vue'
import GsmsRefusal from './GsmsRefusal.vue'
import { useGsmsShellStore } from '@/stores/gsmsShell'

export interface ListColumn {
  colKey: string
  title: string
  width?: number | string
  /** Cellule cliquable vers la fiche (`rowTo`). */
  link?: boolean
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
  emptyIcon?: string
  pageSize?: number
}>(), {
  icon: 'app', subtitle: '', back: '', backLabel: '', loading: false, columns: () => [], rowKey: 'id',
  rowTo: undefined, emptyTitle: '', emptyDescription: '', emptyIcon: '', pageSize: 24,
})
const emit = defineEmits<{ retry: [] }>()
const { t } = useI18n()
const router = useRouter()
const { isMobile } = storeToRefs(useGsmsShellStore())

const page = ref(1)
watch(() => props.items, () => { page.value = 1 })
const pageItems = computed(() => (props.items ?? []).slice((page.value - 1) * props.pageSize, page.value * props.pageSize))
const useTable = computed(() => props.columns.length > 0 && !isMobile.value)
const tableColumns = computed(() => props.columns.map(({ colKey, title, width }) => ({ colKey, title, width })))

const display = (row: Record<string, any>, key: string) => {
  const v = row[key]
  return v === null || v === undefined || v === '' ? '—' : String(v)
}
const rowClick = ({ row }: { row: Record<string, any> }) => { if (props.rowTo) router.push(props.rowTo(row as T)) }
</script>

<style scoped lang="less">
@import (reference) './gsms-list.less';
.gsms-page { .gsms-page-shell(); }
.gsms-page-content { .resource-list-content(); }
.gsms-page-main { .resource-list-main(); }
.gsms-toolbar { .gsms-toolbar(); }
.cards { .gsms-grid(); }
.card { .gsms-card(); }
.table { .gsms-table(); }
.cell-link { color: var(--td-text-color-primary); font-weight: 500; text-decoration: none; &:hover { color: var(--td-brand-color); } }
.pager { display: flex; justify-content: center; margin-top: 12px; }
</style>
