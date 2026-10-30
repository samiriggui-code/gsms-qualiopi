<template>
  <GsmsListPage :title="t('gsms.finances.paiements.titre')" icon="money" :subtitle="t('gsms.finances.paiements.sousTitre')"
    :items="rows" :loading="loading" :error="error" :columns="columns" :row-to="(p) => `/platform/factures/${p.facture_id}?onglet=encaissements`"
    :empty-title="t('gsms.finances.paiements.aucun')" :empty-description="t('gsms.finances.paiements.aucunAide')" @retry="load">
    <template #toolbar>
      <div class="filters">
        <t-date-range-picker v-model="periode" value-type="YYYY-MM-DD" format="DD/MM/YYYY" clearable class="range"
          :placeholder="[t('gsms.finances.paiements.du'), t('gsms.finances.paiements.au')]" />
        <t-checkbox v-model="annules">{{ t('gsms.finances.paiements.inclureAnnules') }}</t-checkbox>
      </div>
    </template>
    <template #before><GsmsRefusal v-if="actionError" :error="actionError" inline /></template>

    <template #cell-date="{ row }">{{ fmtDate(row.date) }}</template>
    <template #cell-facture="{ row }">
      <router-link :to="`/platform/factures/${row.facture_id}?onglet=encaissements`" class="cell-link" @click.stop>{{ row.facture?.numero || '—' }}</router-link>
    </template>
    <template #cell-client="{ row }">{{ row.facture?.client || '—' }}</template>
    <template #cell-montant_centimes="{ row }"><span class="num" :class="{ cancelled: row.annule }">{{ centimes(row.montant_centimes) }}</span></template>
    <template #cell-etat="{ row }">
      <GsmsStatusTag v-if="row.annule" code="ANNULE" />
      <button v-else type="button" class="link-btn link-btn--danger" :disabled="busy === row.id" @click.stop="askCancel(row)">{{ t('gsms.finances.paiements.annuler') }}</button>
    </template>

    <template #card="{ item }">
      <div class="card card--static">
        <div class="card-header">
          <div class="card-header-left"><span class="card-title num" :class="{ cancelled: item.annule }">{{ centimes(item.montant_centimes) }}</span></div>
          <GsmsStatusTag v-if="item.annule" code="ANNULE" />
        </div>
        <div class="card-content">
          <p class="card-description">
            <router-link :to="`/platform/factures/${item.facture_id}?onglet=encaissements`">{{ item.facture?.numero || '—' }}</router-link> · {{ item.facture?.client }}
          </p>
          <p v-if="item.annule" class="sub">{{ item.motif_annulation }}</p>
        </div>
        <div class="card-bottom">
          <div class="card-meta">
            <span><t-icon name="time" size="14px" />{{ fmtDate(item.date) }}</span>
            <span>{{ item.mode_libelle }}</span>
            <span v-if="item.reference">{{ item.reference }}</span>
          </div>
          <button v-if="!item.annule" type="button" class="link-btn link-btn--danger" :disabled="busy === item.id" @click="askCancel(item)">{{ t('gsms.finances.paiements.annuler') }}</button>
        </div>
      </div>
    </template>
  </GsmsListPage>

  <ActionDialog :visible="!!target" :title="t('gsms.finances.paiements.annuler')" :fields="['motif']" danger
    :consequence="t('gsms.finances.paiements.annulerConsequence')"
    :intro="t('gsms.finances.paiements.annulerAide')" :confirm-label="t('gsms.finances.paiements.annuler')"
    :run="(v) => cancelPayment(target, v.motif ?? '')" @update:visible="(v) => { if (!v) target = '' }" @done="cancelled" />
</template>

<script setup lang="ts">
/**
 * Encaissements (page 20). La liste de l'API ne porte pas de capacité : avant d'annuler, on lit la décision
 * `annuler` de l'encaissement dans la fiche de sa facture, et l'API reste seule juge.
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { MessagePlugin } from 'tdesign-vue-next'
import GsmsListPage, { type ListColumn } from '@/components/gsms/GsmsListPage.vue'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import ActionDialog from '@/components/gsms/ActionDialog.vue'
import { cancelPayment, getInvoice, listPayments, type Payment } from '@/api/gsms/invoicing'
import { fmtDate } from '@/components/gsms/format'
import { centimes } from './display'

const { t } = useI18n()
const rows = ref<Payment[] | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const actionError = ref<unknown>(null)
const periode = ref<string[]>([])
const annules = ref(false)
const target = ref('')
const busy = ref('')

const columns = computed<ListColumn[]>(() => [
  { colKey: 'date', title: t('gsms.finances.paiements.recuLe'), width: 120 },
  { colKey: 'facture', title: t('gsms.finances.facture'), width: 170 },
  { colKey: 'client', title: t('gsms.finances.factures.client') },
  { colKey: 'mode_libelle', title: t('gsms.finances.paiements.mode'), width: 130 },
  { colKey: 'reference', title: t('gsms.finances.paiements.reference') },
  { colKey: 'montant_centimes', title: t('gsms.finances.paiements.montant'), width: 130 },
  { colKey: 'etat', title: '', width: 110 },
])

let seq = 0
async function load() {
  const mine = ++seq
  loading.value = true
  error.value = null
  try {
    const [du, au] = periode.value ?? []
    const res = await listPayments({ du: du || undefined, au: au || undefined, annules: annules.value })
    if (mine === seq) rows.value = res
  } catch (e) {
    if (mine === seq) { error.value = e; rows.value = null }
  } finally {
    if (mine === seq) loading.value = false
  }
}
watch([periode, annules], load, { immediate: true })

async function askCancel(p: Payment) {
  busy.value = p.id
  actionError.value = null
  try {
    const decision = (await getInvoice(p.facture_id)).encaissements.find((x) => x.id === p.id)?.capabilities?.annuler
    if (decision?.allowed) target.value = p.id
    else MessagePlugin.info(decision?.message || t('gsms.commun.refus.actionRefusee'))
  } catch (e) {
    actionError.value = e
  } finally {
    busy.value = ''
  }
}

async function cancelled() {
  MessagePlugin.success(t('gsms.commun.misAJour'))
  await load()
}
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.filters { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; flex: 1 1 auto; justify-content: flex-end; min-width: 0; }
.range { width: 280px; max-width: 100%; }
.card { .gsms-card(); }
.card--static { cursor: default; }
.sub { .gsms-muted(); margin: 2px 0 0; }
.num { font-variant-numeric: tabular-nums; white-space: nowrap; }
.cancelled { text-decoration: line-through; color: var(--td-text-color-placeholder); }
.link-btn { .gsms-link-button(); }
.cell-link { color: var(--td-text-color-primary); font-weight: 500; text-decoration: none; &:hover { color: var(--td-brand-color); } }
@media (max-width: 720px) { .filters { justify-content: stretch; } .range { flex: 1 1 100%; width: 100%; } }
</style>
