<template>
  <GsmsRecordSheet :title="ev?.libelle || t('gsms.qualite.preuves.preuve')" icon="file-safety" back="/platform/qualite/preuves"
    :back-label="t('gsms.qualite.preuves.titre')" :subtitle="ev ? `${ev.reference} · ${ev.type_libelle}` : ''"
    :ready="!!ev" :loading="loading" :error="error" :tabs="tabs" :tab="tab" @update:tab="(v) => (tab = v)" @retry="load">
    <template v-if="ev" #status><GsmsStatusTag :code="ev.statut" :label="ev.statut_libelle" /></template>
    <template v-if="ev" #side>
      <section class="side-section">
        <h3>{{ t('gsms.qualite.preuves.origine') }}</h3>
        <dl>
          <div><dt>{{ t('gsms.qualite.preuves.portee') }}</dt><dd>{{ ev.portee_libelle }}</dd></div>
          <div><dt>{{ t('gsms.qualite.preuves.concerne') }}</dt><dd>{{ ev.cible || '—' }}</dd></div>
          <div><dt>{{ t('gsms.qualite.preuves.produiteLe') }}</dt><dd>{{ fmtDate(ev.produite_le) }}</dd></div>
          <div><dt>{{ t('gsms.qualite.preuves.valableJusquau') }}</dt><dd>{{ fmtDate(ev.valide_jusqu_au) }}</dd></div>
          <div><dt>{{ t('gsms.qualite.preuves.par') }}</dt><dd>{{ ev.par || '—' }}</dd></div>
          <div><dt>{{ t('gsms.qualite.preuves.detecteeLe') }}</dt><dd>{{ fmtDateTime(ev.detectee_le) }}</dd></div>
        </dl>
        <t-button v-if="ev.document_id" size="small" variant="outline" class="dl" :loading="downloading" @click="download">
          <template #icon><t-icon name="download" /></template>{{ t('gsms.commun.telecharger') }}
        </t-button>
      </section>
      <section v-if="ev.problemes.length" class="side-section">
        <h3>{{ t('gsms.qualite.preuves.problemes') }}</h3>
        <ul class="plain"><li v-for="(p, i) in ev.problemes" :key="i">{{ p }}</li></ul>
      </section>
    </template>

    <template v-if="ev">
      <section v-if="tab === 'relecture'" class="panel">
        <GsmsRefusal v-if="actionError" :error="actionError" inline />
        <p v-if="!ev.grille.length" class="muted">{{ t('gsms.qualite.preuves.sansGrille') }}</p>
        <GridPoints v-else v-model="checklist" :points="ev.grille" :disabled="!canDecide" />
        <t-textarea v-model="comment" :disabled="!canDecide" :placeholder="t('gsms.qualite.preuves.commentaire')"
          :autosize="{ minRows: 2, maxRows: 6 }" class="comment" :aria-label="t('gsms.qualite.preuves.commentaire')" />
        <div class="decide">
          <GsmsActionGate :decision="ev.capabilities.valider" theme="success" show-reason :pending="busy === 'VALIDEE'" @run="decide('VALIDEE')" />
          <GsmsActionGate :decision="ev.capabilities.rejeter" theme="danger" variant="outline" show-reason :pending="busy === 'REJETEE'" @run="decide('REJETEE')" />
        </div>
      </section>
      <section v-else-if="tab === 'indicateurs'" class="panel">
        <ul class="plain">
          <li v-for="l in ev.liens" :key="l.indicateur">
            <router-link :to="`/platform/qualite/indicateurs/${l.indicateur}`" class="chip">ind. {{ l.indicateur }}</router-link> {{ l.titre || '' }}
            <span class="muted"> · {{ l.raison || l.origine }}</span>
          </li>
        </ul>
      </section>
      <section v-else-if="tab === 'decisions'" class="panel">
        <p v-if="!ev.decisions.length" class="muted">{{ t('gsms.qualite.preuves.aucuneDecision') }}</p>
        <ul class="timeline">
          <li v-for="(d, i) in ev.decisions" :key="i">
            <span class="tl-date">{{ fmtDateTime(d.le) }}</span>
            <span><GsmsStatusTag :code="d.decision" /> {{ d.par }}<template v-if="d.auto_validee"> ({{ t('gsms.qualite.preuves.autoValidation') }})</template></span>
            <span v-if="d.commentaire" class="muted">{{ d.commentaire }}</span>
          </li>
        </ul>
      </section>
      <section v-else class="panel">
        <ul class="timeline">
          <li v-for="(h, i) in ev.historique" :key="i">
            <span class="tl-date">{{ fmtDateTime(h.le) }}</span>
            <span>{{ h.libelle }}<template v-if="h.vers"> → {{ stateLabel(h.vers) }}</template><template v-if="h.detail"> · {{ h.detail }}</template></span>
            <span class="muted">{{ h.par }}</span>
          </li>
        </ul>
      </section>
    </template>
  </GsmsRecordSheet>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { MessagePlugin } from 'tdesign-vue-next'
import GsmsRecordSheet from '@/components/gsms/GsmsRecordSheet.vue'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import GsmsActionGate from '@/components/gsms/GsmsActionGate.vue'
import GridPoints from '@/components/gsms/GridPoints.vue'
import { getEvidence, validateEvidence, type EvidenceDetail } from '@/api/gsms/qualite'
import { downloadDocument } from '@/api/gsms/dossiers'
import { fmtDate, fmtDateTime, refusalText, stateLabel } from '@/components/gsms/format'

const { t } = useI18n()
const route = useRoute()
const id = computed(() => String(route.params.evidenceId || ''))
const ev = ref<EvidenceDetail | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const actionError = ref<unknown>(null)
const busy = ref('')
const downloading = ref(false)
const checklist = ref<Record<string, string>>({})
const comment = ref('')
const tab = ref('relecture')
const tabs = computed(() => [
  { value: 'relecture', label: t('gsms.qualite.preuves.relecture') },
  { value: 'indicateurs', label: t('gsms.qualite.preuves.indicateursServis'), count: ev.value?.liens.length },
  { value: 'decisions', label: t('gsms.qualite.preuves.decisions'), count: ev.value?.decisions.length },
  { value: 'historique', label: t('gsms.commun.historique') },
])

const canDecide = computed(() => !!(ev.value?.capabilities.valider?.allowed || ev.value?.capabilities.rejeter?.allowed))

async function load() {
  const asked = id.value
  loading.value = true
  error.value = null
  try {
    const res = await getEvidence(asked)
    if (asked !== id.value) return // réponse d'une fiche quittée entre-temps
    ev.value = res
    checklist.value = {}
    comment.value = ''
  } catch (e) {
    error.value = e
    ev.value = null
  } finally {
    loading.value = false
  }
}
watch(id, () => { actionError.value = null; load() }, { immediate: true })

async function decide(decision: 'VALIDEE' | 'REJETEE') {
  busy.value = decision
  actionError.value = null
  try {
    await validateEvidence(id.value, {
      decision,
      comment: comment.value.trim() || null,
      checklist: Object.keys(checklist.value).length ? { ...checklist.value } : null,
    })
    MessagePlugin.success(t(decision === 'VALIDEE' ? 'gsms.qualite.preuves.validee' : 'gsms.qualite.preuves.rejetee'))
    await load()
  } catch (e) {
    actionError.value = e
  } finally {
    busy.value = ''
  }
}

async function download() {
  if (!ev.value?.document_id) return
  downloading.value = true
  try {
    await downloadDocument(ev.value.document_id, ev.value.reference)
  } catch (e) {
    MessagePlugin.error(refusalText(e))
  } finally {
    downloading.value = false
  }
}
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.side-section { .gsms-side-section(); }
.panel { .gsms-panel(); }
.muted { .gsms-muted(); }
.chip { .gsms-chip(); text-decoration: none; }
.plain { .gsms-plain(); }
.timeline { .gsms-timeline(); }
.dl { margin-top: 12px; }
.comment { margin-top: 10px; }
.decide { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 12px; }
</style>
