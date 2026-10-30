<template>
  <div class="gsms-settings">
    <div class="section-header">
      <div class="section-header__top">
        <h2>{{ t('gsms.parametres.sections.moyens') }}</h2>
        <t-button v-if="canWrite" theme="primary" @click="openEdit(null)">
          {{ t('gsms.parametres.moyens.ajouter', { name: singular }) }}
        </t-button>
      </div>
      <p class="section-description">{{ t('gsms.parametres.moyens.description') }}</p>
    </div>

    <t-tabs v-model="current">
      <t-tab-panel v-for="d in MOYENS" :key="d.resource" :value="d.resource"
        :label="t(`gsms.parametres.moyens.ressources.${d.i18nKey}.label`)" />
    </t-tabs>

    <GsmsRefusal v-if="loadError" :error="loadError" inline />
    <GsmsRefusal v-if="actionError" :error="actionError" inline />
    <t-alert v-if="!canWrite" theme="info" class="alert-gap" :message="t('gsms.parametres.moyens.lectureSeule', { perm: def.write })" />

    <div class="table-frame">
      <t-table row-key="id" :data="rows" :columns="columns" :loading="loading" size="medium"
        :empty="t('gsms.parametres.commun.aucunElement')">
        <template v-for="c in def.columns" :key="c.key" #[c.key]="{ row }">
          <span :class="{ 'cell-main': c === def.columns[0] }">{{ cell(row, c) }}</span>
        </template>
        <template #actions="{ row }">
          <t-button size="small" variant="text" @click="openEdit(row)">{{ t(canWrite ? 'gsms.parametres.commun.modifier' : 'gsms.parametres.commun.voir') }}</t-button>
          <t-button v-if="canWrite" size="small" variant="text" theme="danger" @click="remove(row)">
            {{ t('gsms.parametres.commun.supprimer') }}
          </t-button>
        </template>
      </t-table>
    </div>

    <t-dialog v-model:visible="editVisible" :header="editing ? def.title(editing) || singular : t('gsms.parametres.moyens.nouveau', { name: singular })"
      width="640px" attach="body" dialog-class-name="gsms-dialog" :footer="canWrite"
      :confirm-btn="{ content: t('gsms.parametres.commun.enregistrer'), loading: saving }" :cancel-btn="t('gsms.parametres.commun.annuler')" @confirm="save">
      <div class="dialog-form">
        <GsmsRefusal v-if="dialogError" :error="dialogError" inline />
        <div class="field-grid">
          <div v-for="f in def.fields" :key="f.key" class="field" :class="{ 'field--wide': f.type === 'textarea' }">
            <span class="field-label">{{ t(`gsms.parametres.moyens.champs.${f.key}`) }}{{ f.required ? ' *' : '' }}</span>
            <t-select v-if="f.type === 'select'" v-model="draft[f.key] as any" :options="optionsOf(f)" clearable
              :placeholder="t('gsms.parametres.commun.choisir')" :disabled="!canWrite" />
            <t-select v-else-if="f.type === 'premises'" v-model="draft[f.key] as any" :options="premisesOptions"
              clearable filterable :placeholder="t('gsms.parametres.commun.choisir')" :disabled="!canWrite" />
            <t-date-picker v-else-if="f.type === 'date'" v-model="draft[f.key] as any" value-type="YYYY-MM-DD"
              format="DD/MM/YYYY" clearable :placeholder="t('gsms.parametres.commun.date')" :disabled="!canWrite" />
            <t-input-number v-else-if="f.type === 'int'" v-model="draft[f.key] as any" theme="normal"
              :decimal-places="0" :min="0" placeholder=" " :disabled="!canWrite" />
            <t-switch v-else-if="f.type === 'bool'" v-model="draft[f.key] as any" :disabled="!canWrite"
              :aria-label="t(`gsms.parametres.moyens.champs.${f.key}`)" />
            <t-textarea v-else-if="f.type === 'textarea'" v-model="draft[f.key] as any"
              :autosize="{ minRows: 2, maxRows: 5 }" :placeholder="t('gsms.parametres.commun.nonRenseigne')" :disabled="!canWrite" />
            <t-input v-else v-model="draft[f.key] as any" :placeholder="t('gsms.parametres.commun.nonRenseigne')" :disabled="!canWrite" />
          </div>
        </div>
      </div>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { confirmCritical } from '@/components/gsms/critical'
import { useI18n } from 'vue-i18n'
import {
  createMoyen, deleteMoyen, listMoyens, updateMoyen, type MoyenResource, type MoyenRow,
} from '@/api/gsms/training'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import { fmtDate as formatDate } from '@/components/gsms/format'
import { MOYENS, type MoyenColumn, type MoyenField } from './moyens'
import { useGsmsAccessStore } from '@/stores/gsmsAccess'
import { useGsmsValueListsStore } from '@/stores/gsmsValueLists'

const { t } = useI18n()
const access = useGsmsAccessStore()
const current = ref<MoyenResource>('premises')
const def = computed(() => MOYENS.find((d) => d.resource === current.value)!)
const canWrite = computed(() => access.can(def.value.write))
const singular = computed(() => t(`gsms.parametres.moyens.ressources.${def.value.i18nKey}.singulier`))
const valueLists = useGsmsValueListsStore()
const optionsOf = (f: MoyenField) => (f.list ? valueLists.options(f.list) : [])

const rows = ref<MoyenRow[]>([])
const premises = ref<MoyenRow[]>([])
const loading = ref(true)
const loadError = ref<unknown>(null)
const actionError = ref<unknown>(null)

const columns = computed(() => [
  ...def.value.columns.map((c, i) => ({
    colKey: c.key, title: t(`gsms.parametres.moyens.champs.${c.title}`), ...(c.width ? { width: c.width } : { minWidth: i === 0 ? 200 : 140 }), ellipsis: i !== 0,
  })),
  { colKey: 'actions', title: '', width: canWrite.value ? 170 : 80 },
])

function cell(row: MoyenRow, c: MoyenColumn): string {
  if (c.display && row[c.display]) return String(row[c.display])
  const v = row[c.key]
  const field = def.value.fields.find((f) => f.key === c.key)
  if (field?.type === 'date') return formatDate(v as string)
  if (field?.type === 'bool') return v === true ? t('gsms.parametres.commun.oui') : v === false ? t('gsms.parametres.commun.non') : '—'
  if (field?.type === 'select' && field.list) return valueLists.label(field.list, v)
  return v === null || v === undefined || v === '' ? '—' : String(v)
}

const premisesOptions = computed(() => premises.value
  .filter((p) => p.id !== editing.value?.id)
  .map((p) => ({ value: p.id, label: String(p.name ?? p.code ?? p.id) })))

async function load() {
  loading.value = true
  loadError.value = null
  actionError.value = null
  try {
    rows.value = await listMoyens(current.value)
    if (current.value === 'premises') premises.value = rows.value
    else if (def.value.fields.some((f) => f.type === 'premises')) premises.value = await listMoyens('premises')
  } catch (err) {
    rows.value = []
    loadError.value = err
  } finally {
    loading.value = false
  }
}
watch(current, load)

// ── Création, modification ──
const editVisible = ref(false)
const editing = ref<MoyenRow | null>(null)
const draft = reactive<Record<string, unknown>>({})
const saving = ref(false)
const dialogError = ref<unknown>(null)

function openEdit(row: MoyenRow | null) {
  editing.value = row
  for (const k of Object.keys(draft)) delete draft[k]
  for (const f of def.value.fields) draft[f.key] = row ? row[f.key] ?? null : (f.type === 'bool' ? false : null)
  dialogError.value = null
  editVisible.value = true
}

async function save() {
  saving.value = true
  dialogError.value = null
  const data: Record<string, unknown> = {}
  for (const f of def.value.fields) {
    const v = draft[f.key]
    const clean = v === '' || v === undefined ? null : typeof v === 'string' ? v.trim() || null : v
    if (!editing.value || JSON.stringify(clean) !== JSON.stringify(editing.value[f.key] ?? null)) data[f.key] = clean
  }
  try {
    if (editing.value) await updateMoyen(current.value, editing.value.id, data)
    else await createMoyen(current.value, data)
    editVisible.value = false
    MessagePlugin.success(t('gsms.parametres.commun.enregistre'))
    await load()
  } catch (err) {
    dialogError.value = err
  } finally {
    saving.value = false
  }
}

async function remove(row: MoyenRow) {
  actionError.value = null
  const done = await confirmCritical({
    title: t('gsms.parametres.moyens.supprimerTitre', { name: def.value.title(row) || singular.value }),
    consequence: t('gsms.parametres.moyens.supprimerTexte'), confirmLabel: t('gsms.parametres.commun.supprimer'),
    run: () => deleteMoyen(current.value, row.id).then(() => true),
  })
  if (!done) return
  MessagePlugin.success(t('gsms.parametres.commun.supprime'))
  await load()
}

onMounted(() => { valueLists.load(); load() })
</script>

<style lang="less" scoped>
@import (reference) './gsms-section.less';
@import (reference) './gsms-dialog.less';

.gsms-settings {
  .gsms-section();
}

.dialog-form {
  .gsms-dialog-form();

  .field--wide {
    grid-column: 1 / -1;
  }
}

.cell-main {
  color: var(--td-text-color-primary);
  font-weight: 500;
}
</style>
