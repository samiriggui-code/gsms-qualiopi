<template>
  <t-dialog :visible="visible" :header="t('gsms.commercial.devis.modifierLignes')" width="min(760px, calc(100vw - 32px))" attach="body" destroy-on-close
    :confirm-btn="{ content: t('gsms.commun.enregistrer'), loading: saving }" :cancel-btn="{ content: t('gsms.commun.annuler') }"
    :close-on-overlay-click="!saving" @confirm="save" @close="close" @cancel="close">
    <div class="lines">
      <p class="muted">{{ t('gsms.commercial.devis.lignesAide') }}</p>
      <GsmsRefusal v-if="error" :error="error" inline />
      <GsmsRefusal v-if="programsError" :error="programsError" inline />
      <p v-if="!rows.length" class="muted">{{ t('gsms.commercial.devis.aucuneLigne') }}</p>
      <fieldset v-for="(r, i) in rows" :key="r.key" class="line">
        <legend>{{ t('gsms.commercial.devis.ligneN', { n: i + 1 }) }}</legend>
        <div class="grid">
          <label class="wide">{{ t('gsms.commercial.devis.formation') }}
            <t-select v-model="r.formation_id" :options="programOptions" clearable filterable @change="pickProgram(r)" />
            <span v-if="hintOf(r)" class="hint">{{ hintOf(r) }}</span>
          </label>
          <label class="wide">{{ t('gsms.commercial.devis.libelle') }} *<t-input v-model="r.libelle" :maxlength="300" /></label>
          <label class="wide">{{ t('gsms.commercial.devis.detail') }}<t-textarea v-model="r.detail" :maxlength="2000" :autosize="{ minRows: 1, maxRows: 4 }" /></label>
          <label>{{ t('gsms.commercial.devis.quantite') }}<t-input-number v-model="r.quantite" theme="normal" :min="0" :decimal-places="2" /></label>
          <label>{{ t('gsms.commercial.devis.unite') }}<t-select v-model="r.unite" :options="unitOptions" /></label>
          <label>{{ t('gsms.commercial.devis.prixUnitaire') }}<t-input-number v-model="r.prix_unitaire" theme="normal" :min="0" :decimal-places="2" /></label>
          <label>{{ t('gsms.commercial.devis.remise') }}<t-input-number v-model="r.remise_pct" theme="normal" :min="0" :max="100" :decimal-places="2" /></label>
        </div>
        <button type="button" class="link-btn link-btn--danger" @click="rows.splice(i, 1)">{{ t('gsms.commercial.devis.retirerLigne') }}</button>
      </fieldset>
      <t-button variant="dashed" size="small" @click="add"><template #icon><t-icon name="add" /></template>{{ t('gsms.commercial.devis.ajouterLigne') }}</t-button>
    </div>
  </t-dialog>
</template>

<script setup lang="ts">
/**
 * Lignes d'un devis en brouillon : la liste entière est renvoyée à PUT /editions/{id}/lignes, l'API valide
 * (quantité, prix, remise) et calcule les montants. Choisir une formation reprend son intitulé et son tarif
 * tels que l'API les donne, sans rien décider.
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import { listEditionPrograms, putEditionLines, type EditionDetail, type EditionLine, type EditionProgram } from '@/api/gsms/editions'
import { euros } from '@/views/gsms/formations/display'

interface Row {
  key: number
  formation_id: string | null
  libelle: string
  detail: string
  quantite: number | undefined
  unite: string
  prix_unitaire: number | undefined
  remise_pct: number | undefined
}

const props = defineProps<{ visible: boolean; quoteId: string; lines: EditionLine[]; units: Record<string, string> }>()
const emit = defineEmits<{ 'update:visible': [boolean]; saved: [EditionDetail] }>()
const { t } = useI18n()

const rows = ref<Row[]>([])
const programs = ref<EditionProgram[]>([])
const programsError = ref<unknown>(null)
const error = ref<unknown>(null)
const saving = ref(false)
let seq = 0

const unitOptions = computed(() => Object.entries(props.units).map(([value, label]) => ({ value, label })))
const programOptions = computed(() => programs.value.map((p) => ({ value: p.id, label: `${p.code} · ${p.titre}` })))
const firstUnit = () => unitOptions.value[0]?.value ?? 'STAGIAIRE'

watch(() => props.visible, async (v) => {
  if (!v) return
  error.value = null
  rows.value = props.lines.map((l) => ({
    key: ++seq, formation_id: l.formation_id, libelle: l.libelle, detail: l.detail ?? '', quantite: l.quantite,
    unite: l.unite, prix_unitaire: l.prix_unitaire ?? undefined, remise_pct: l.remise_pct,
  }))
  programsError.value = null
  try {
    programs.value = await listEditionPrograms()
  } catch (e) {
    programsError.value = e
  }
}, { immediate: true })

function add() {
  rows.value.push({ key: ++seq, formation_id: null, libelle: '', detail: '', quantite: 1, unite: firstUnit(), prix_unitaire: undefined, remise_pct: 0 })
}

function pickProgram(r: Row) {
  const p = programs.value.find((x) => x.id === r.formation_id)
  if (!p) return
  if (!r.libelle.trim()) r.libelle = p.titre
  if (r.prix_unitaire === undefined && p.prix !== null) r.prix_unitaire = p.prix
}

function hintOf(r: Row): string {
  const p = programs.value.find((x) => x.id === r.formation_id)
  if (!p) return ''
  const price = p.prix === null ? t('gsms.commercial.devis.sansTarif') : t('gsms.commercial.devis.tarif', { prix: euros(p.prix) })
  return p.prix_a_confirmer ? `${price} · ${t('gsms.commercial.devis.tarifAConfirmer')}` : price
}

function close() {
  if (!saving.value) emit('update:visible', false)
}

async function save() {
  saving.value = true
  error.value = null
  try {
    const res = await putEditionLines(props.quoteId, rows.value.map((r) => ({
      formation_id: r.formation_id || null, libelle: r.libelle, detail: r.detail.trim() || null,
      quantite: r.quantite ?? 1, unite: r.unite, prix_unitaire: r.prix_unitaire ?? null, remise_pct: r.remise_pct ?? 0,
    })))
    emit('saved', res)
    emit('update:visible', false)
  } catch (e) {
    error.value = e
  } finally {
    saving.value = false
  }
}
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.lines { display: flex; flex-direction: column; gap: 12px; }
.muted { .gsms-muted(); margin: 0; }
.line { margin: 0; padding: 10px 12px 12px; border: 1px solid var(--td-component-stroke); border-radius: var(--app-radius-md); min-width: 0;
  legend { padding: 0 4px; color: var(--td-text-color-secondary); font-size: var(--app-text-sm); } }
.grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 8px;
  label { display: flex; flex-direction: column; gap: 4px; min-width: 0; color: var(--td-text-color-secondary); font-size: var(--app-text-sm); }
  .wide { grid-column: 1 / -1; }
  :deep(.t-input-number) { width: 100%; } }
.hint { color: var(--td-text-color-placeholder); font-size: var(--app-text-xs); }
.link-btn { .gsms-link-button(); }
@media (max-width: 600px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
