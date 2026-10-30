<template>
  <div class="gsms-settings">
    <div class="section-header">
      <div class="section-header__top">
        <h2>{{ t('gsms.parametres.sections.edof') }}</h2>
        <t-button v-if="tab === 'profil' && canWrite && view" theme="primary" :loading="saving" :disabled="!dirty"
          @click="save">{{ t('gsms.parametres.commun.enregistrer') }}</t-button>
      </div>
      <p class="section-description">{{ t('gsms.parametres.edof.description') }}</p>
    </div>

    <t-tabs v-model="tab">
      <t-tab-panel value="profil" :label="t('gsms.parametres.edof.etablissement')" />
      <t-tab-panel value="pieces" :label="t('gsms.parametres.edof.pieces')" />
    </t-tabs>

    <template v-if="tab === 'profil'">
      <GsmsRefusal v-if="loadError" :error="loadError" inline />
      <GsmsRefusal v-if="saveError" :error="saveError" inline />
      <div v-if="loading" class="state-block"><t-loading size="small" /></div>
      <template v-else-if="view">
        <t-alert v-if="!canWrite" theme="info" class="alert-gap"
          :message="t('gsms.parametres.edof.lectureSeule')" />
        <p class="meta">{{ t('gsms.parametres.edof.dossier', { status: view.dossier.display_label ?? view.dossier.status }) }}</p>
        <template v-for="group in groups" :key="group.key">
          <div class="group-title">{{ t(`gsms.parametres.edof.groupes.${group.key}`) }}</div>
          <div class="settings-group">
            <div v-for="f in group.fields" :key="f.key" class="setting-row">
              <div class="setting-info">
                <label :for="`edof-${f.key}`">{{ t(`gsms.parametres.edof.champs.${f.key}`) }}</label>
                <p v-if="f.help" class="desc">{{ t(`gsms.parametres.edof.champs.${f.key}_aide`) }}</p>
              </div>
              <div class="setting-control">
                <t-select :placeholder="t('gsms.parametres.commun.choisir')" v-if="f.type === 'select'" :id="`edof-${f.key}`" v-model="form[f.key] as any"
                  :options="optionsOf(f)" clearable :disabled="!editable(f)" />
                <t-date-picker :placeholder="t('gsms.parametres.commun.date')" v-else-if="f.type === 'date'" :id="`edof-${f.key}`" v-model="form[f.key] as any"
                  value-type="YYYY-MM-DD" format="DD/MM/YYYY" clearable :disabled="!editable(f)" />
                <t-input-number placeholder=" " v-else-if="f.type === 'int'" :id="`edof-${f.key}`" v-model="form[f.key] as any"
                  theme="normal" :decimal-places="0" :disabled="!editable(f)" />
                <t-switch v-else-if="f.type === 'bool'" :id="`edof-${f.key}`" v-model="form[f.key] as any"
                  :disabled="!editable(f)" :aria-label="t(`gsms.parametres.edof.champs.${f.key}`)" />
                <t-checkbox-group v-else-if="f.type === 'list'" v-model="form[f.key] as any" :disabled="!editable(f)"
                  :options="categoryOptions" />
                <t-textarea :placeholder="t('gsms.parametres.commun.nonRenseigne')" v-else-if="f.type === 'textarea'" :id="`edof-${f.key}`" v-model="form[f.key] as any"
                  :autosize="{ minRows: 2, maxRows: 6 }" :disabled="!editable(f)" />
                <t-input :placeholder="t('gsms.parametres.commun.nonRenseigne')" v-else :id="`edof-${f.key}`" v-model="form[f.key] as any" :disabled="!editable(f)" />
              </div>
            </div>
          </div>
        </template>
      </template>
    </template>

    <template v-else>
      <GsmsFileNote file="backend/config/edof/referencement.yaml" />
      <GsmsRefusal v-if="piecesError" :error="piecesError" inline />
      <p v-if="pieces" class="meta">{{ t('gsms.parametres.edof.version', { version: pieces.version }) }}</p>
      <div class="table-frame">
        <t-table row-key="code" :data="pieces?.pieces ?? []" :columns="pieceColumns" :loading="piecesLoading"
          size="small" :empty="t('gsms.parametres.edof.aucunePiece')">
          <template #label="{ row }">
            <div class="cell-main">{{ row.label }}</div>
            <div class="cell-sub"><code>{{ row.code }}</code><template v-if="row.sensitive"> · {{ t('gsms.parametres.edof.sensible') }}</template></div>
          </template>
          <template #scope="{ row }">{{ te(`gsms.parametres.edof.portees.${row.scope}`) ? t(`gsms.parametres.edof.portees.${row.scope}`) : row.scope }}</template>
          <template #max_age_days="{ row }">{{ row.max_age_days ? t('gsms.parametres.edof.jours', { n: row.max_age_days }) : '—' }}</template>
        </t-table>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { useI18n } from 'vue-i18n'
import {
  getEdofEstablishment, getEdofReferential, updateEdofEstablishment, type EdofEstablishmentView, type EdofPiece,
} from '@/api/gsms/edof'
import { getOrganisme } from '@/api/gsms/platform'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import GsmsFileNote from './GsmsFileNote.vue'
import { useGsmsAccessStore } from '@/stores/gsmsAccess'

type FieldType = 'text' | 'textarea' | 'select' | 'date' | 'int' | 'bool' | 'list'
/** Libellé : gsms.parametres.edof.champs.<key> ; `help` : la clé <key>_aide existe ; `options` : codes acceptés par l'API. */
type Field = { key: string; type: FieldType; help?: boolean; options?: string[]; check?: boolean }

const { t, te } = useI18n()
const access = useGsmsAccessStore()
const canWrite = computed(() => access.can('edof.write'))
const canValidate = computed(() => access.can('edof.validate'))
// Attester une vérification humaine : droit « valider » exigé par l'API ; les autres champs : « préparer ».
const editable = (f: Field) => canWrite.value && (!f.check || canValidate.value)
const optionsOf = (f: Field) => (f.options ?? []).map((value) => ({ value, label: t(`gsms.parametres.edof.valeurs.${value}`) }))

// Valeurs acceptées par l'API (app/types/edof.py : STRUCTURE_TYPES, REPRESENTATIVE_KINDS, EFP_CONNECT_STATUSES).
const groups: { key: string; fields: Field[] }[] = [
  { key: 'identite', fields: [
    { key: 'legal_name', type: 'text' },
    { key: 'legal_form', type: 'text' },
    { key: 'structure_type', type: 'select', options: ['ENTREPRISE', 'ENTREPRISE_ARTISANALE_LIBERALE', 'ASSOCIATION'] },
    { key: 'address', type: 'text' },
    { key: 'naf_code', type: 'text' },
    { key: 'identity_source', type: 'text', help: true },
    { key: 'identity_checked_on', type: 'date', check: true },
  ] },
  { key: 'representant', fields: [
    { key: 'representative_kind', type: 'select', options: ['PERSONNE_PHYSIQUE', 'PERSONNE_MORALE'] },
    { key: 'representative_name', type: 'text' },
    { key: 'representative_role', type: 'text' },
  ] },
  { key: 'certification', fields: [
    { key: 'nda_checked_on', type: 'date', check: true },
    { key: 'qualiopi_certificate', type: 'text' },
    { key: 'qualiopi_certifier', type: 'text' },
    { key: 'qualiopi_valid_until', type: 'date' },
    { key: 'qualiopi_categories', type: 'list' },
    { key: 'qualiopi_checked_on', type: 'date', check: true },
  ] },
  { key: 'acces', fields: [
    { key: 'efp_connect_status', type: 'select', options: ['AUCUN', 'COMPTE_CREE', 'HABILITATION_DEMANDEE', 'HABILITE'] },
    { key: 'obligations_checked_on', type: 'date', check: true },
    { key: 'bpf_last_year', type: 'int' },
    { key: 'cgu_version_read', type: 'text' },
    { key: 'cgu_read_on', type: 'date', check: true },
    { key: 'uses_subcontracting', type: 'bool' },
    { key: 'note', type: 'textarea' },
  ] },
]
const allFields = groups.flatMap((g) => g.fields)

const tab = ref<'profil' | 'pieces'>('profil')
const view = ref<EdofEstablishmentView | null>(null)
const loading = ref(true)
const saving = ref(false)
const loadError = ref<unknown>(null)
const saveError = ref<unknown>(null)
const form = reactive<Record<string, unknown>>({})
let initial: Record<string, unknown> = {}
const categoryOptions = ref<{ value: string; label: string }[]>([])

const norm = (v: unknown) => (v === '' || v === undefined ? null : v)
function apply(v: EdofEstablishmentView) {
  view.value = v
  initial = Object.fromEntries(allFields.map((f) => [f.key, v.establishment[f.key] ?? (f.type === 'list' ? [] : null)]))
  for (const [k, val] of Object.entries(initial)) form[k] = Array.isArray(val) ? [...val] : val
}
const changes = computed(() => {
  const patch: Record<string, unknown> = {}
  for (const f of allFields) {
    if (JSON.stringify(norm(form[f.key])) !== JSON.stringify(norm(initial[f.key]))) {
      const val = norm(form[f.key])
      patch[f.key] = typeof val === 'string' ? val.trim() || null : val
    }
  }
  return patch
})
const dirty = computed(() => Object.keys(changes.value).length > 0)

async function load() {
  loading.value = true
  loadError.value = null
  try {
    const [v, org] = await Promise.all([getEdofEstablishment(), getOrganisme()])
    categoryOptions.value = org.categories_possibles.map((c) => ({ value: c.code, label: c.libelle }))
    apply(v)
  } catch (err) {
    loadError.value = err
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  saveError.value = null
  try {
    apply(await updateEdofEstablishment(changes.value))
    MessagePlugin.success(t('gsms.parametres.edof.succes'))
  } catch (err) {
    saveError.value = err
  } finally {
    saving.value = false
  }
}

// ── Pièces exigées (chargées à la première ouverture de l'onglet) ──
const pieces = ref<{ version: string; pieces: EdofPiece[] } | null>(null)
const piecesLoading = ref(false)
const piecesError = ref<unknown>(null)
const pieceColumns = computed(() => [
  { colKey: 'label', title: t('gsms.parametres.edof.colPiece'), minWidth: 260 },
  { colKey: 'scope', title: t('gsms.parametres.edof.colDossier'), width: 120 },
  { colKey: 'stage', title: t('gsms.parametres.edof.colEtape'), width: 130, ellipsis: true },
  { colKey: 'max_age_days', title: t('gsms.parametres.edof.colAnciennete'), width: 130 },
])
watch(tab, async (t) => {
  if (t !== 'pieces' || pieces.value || piecesLoading.value) return
  piecesLoading.value = true
  try {
    pieces.value = await getEdofReferential()
  } catch (err) {
    piecesError.value = err
  } finally {
    piecesLoading.value = false
  }
})

onMounted(load)
</script>

<style lang="less" scoped>
@import (reference) './gsms-section.less';

.gsms-settings {
  .gsms-section();
}

.setting-control :deep(.t-input__wrap),
.setting-control :deep(.t-select__wrap),
.setting-control :deep(.t-date-picker),
.setting-control :deep(.t-textarea) {
  width: 280px;
  max-width: 100%;
}

.cell-main {
  color: var(--td-text-color-primary);
  font-weight: 500;
}

.cell-sub {
  color: var(--td-text-color-secondary);
  font-size: var(--app-text-sm);

  code {
    font-family: var(--app-font-family-mono);
  }
}

@media (max-width: 720px) {
  .setting-control :deep(.t-input__wrap),
  .setting-control :deep(.t-select__wrap),
  .setting-control :deep(.t-date-picker),
  .setting-control :deep(.t-textarea) {
    width: 100%;
  }
}
</style>
