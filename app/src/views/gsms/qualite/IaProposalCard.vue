<template>
  <article class="proposal">
    <header>
      <strong class="proposal-action">{{ proposal.action }}</strong>
      <GsmsStatusTag :code="proposal.statut" :label="statusLabel" />
    </header>
    <p v-if="proposal.statut === 'PROPOSEE'" class="caveat"><t-icon name="lightbulb" size="12px" /> {{ t('gsms.qualite.analyse.propositionNonValidee') }}</p>
    <p class="justification">{{ proposal.justification }}</p>
    <IaCitedPassages :passages="proposal.passages" :labels="labels" />
    <p v-if="decidedOn || motif" class="decision muted">
      <template v-if="decidedOn">{{ t('gsms.qualite.analyse.decideeLe', { le: decidedOn }) }}</template>
      <template v-if="motif"> · {{ t('gsms.qualite.analyse.motif', { motif }) }}</template>
    </p>
    <p v-if="proposal.statut === 'ACCEPTEE'" class="muted">{{ t('gsms.qualite.analyse.accepteeNapplique') }}
      <router-link to="/platform/qualite/constats">{{ t('gsms.qualite.analyse.versConstats') }}</router-link></p>
    <div v-if="canDecide && proposal.statut === 'PROPOSEE'" class="actions">
      <t-button size="small" theme="primary" variant="outline" @click="emit('decide', 'ACCEPTEE')">{{ t('gsms.qualite.analyse.accepter') }}</t-button>
      <t-button size="small" theme="danger" variant="outline" @click="emit('decide', 'REJETEE')">{{ t('gsms.qualite.analyse.rejeter') }}</t-button>
    </div>
  </article>
</template>

<script setup lang="ts">
/**
 * Proposition d'action de l'IA : statut et décision tels que rendus par l'API. Les boutons ne sont offerts qu'avec
 * `quality.write` (`canDecide`) et tant que l'API rend la proposition « PROPOSEE » ; l'API tranche (409 si déjà décidée).
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import type { AIProposal, AIProposalRow } from '@/api/gsms/qualite'
import { fmtDateTime, stateLabel } from '@/components/gsms/format'
import IaCitedPassages from './IaCitedPassages.vue'

const props = defineProps<{ proposal: AIProposal | AIProposalRow; canDecide: boolean; labels?: Map<string, string> }>()
const emit = defineEmits<{ decide: ['ACCEPTEE' | 'REJETEE'] }>()
const { t, te } = useI18n()

const statusLabel = computed(() => {
  const key = `gsms.qualite.analyse.propositionStatuts.${props.proposal.statut}`
  return te(key) ? t(key) : stateLabel(props.proposal.statut)
})
const decidedOn = computed(() => ('decide_le' in props.proposal && props.proposal.decide_le ? fmtDateTime(props.proposal.decide_le) : ''))
const motif = computed(() => ('motif' in props.proposal ? props.proposal.motif : null))
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.muted { .gsms-muted(); margin: 2px 0 4px; }
.proposal {
  margin-bottom: 10px;
  padding: 8px 10px;
  border-radius: var(--app-radius-sm);
  background: var(--td-bg-color-container);
  border: 1px solid var(--td-component-stroke);
  header { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 6px; }
}
.proposal-action { font-size: var(--app-text-sm); overflow-wrap: anywhere; }
.caveat { display: flex; align-items: center; gap: 4px; margin: 4px 0; font-size: var(--app-text-xs); color: var(--td-text-color-primary); font-style: italic; .t-icon { color: var(--td-warning-color); } }
.justification { margin: 4px 0 0; font-size: var(--app-text-sm); line-height: 20px; white-space: pre-line; overflow-wrap: anywhere; color: var(--td-text-color-secondary); }
.decision { margin-top: 6px; overflow-wrap: anywhere; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
</style>
