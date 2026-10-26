<template>
  <div class="att">
    <div v-if="loading && !sheet" class="panel"><t-skeleton animation="gradient" :row-col="[{ width: '40%' }, { width: '100%' }, { width: '100%' }]" /></div>
    <GsmsRefusal v-else-if="error" :error="error"><t-button size="small" variant="outline" @click="load">{{ t('gsms.commun.reessayer') }}</t-button></GsmsRefusal>
    <template v-else-if="sheet">
      <GsmsRefusal v-if="actionError" :error="actionError" inline />
      <EmptyState v-if="!sheet.demi_journees.length" icon="calendar" :title="t('gsms.emargement.aucuneDemiJournee')"
        :description="t('gsms.emargement.aucuneDemiJourneeAide')">
        <t-button v-if="canPlan" :loading="busy === 'plan'" @click="plan">{{ t('gsms.emargement.preparer') }}</t-button>
      </EmptyState>
      <template v-else>
        <div class="att-bar">
          <t-select v-model="slotId" :options="slotOptions" class="att-select" :aria-label="t('gsms.emargement.demiJournee')" />
          <span class="muted">{{ t('gsms.emargement.contreValidees', { n: validatedCount, total: sheet.demi_journees.length }) }}</span>
        </div>
        <div v-if="slot" class="panel">
          <div class="slot-head">
            <div class="slot-title">
              <strong>{{ slotLabel(slot) }}</strong>
              <span v-if="slot.horaires" class="muted">{{ slot.horaires }}</span>
            </div>
            <t-tag v-if="slot.contre_validee" theme="success" variant="light" size="small">
              {{ t('gsms.emargement.contreValideeLe', { le: fmtDateTime(slot.contre_validee.le) }) }}<template v-if="slot.contre_validee.par"> · {{ slot.contre_validee.par }}</template>
            </t-tag>
            <t-tag v-else theme="default" variant="light" size="small">{{ t('gsms.emargement.nonContreValidee') }}</t-tag>
          </div>
          <div class="slot-actions">
            <GsmsActionGate :decision="slot.capabilities.validate" show-reason :pending="busy === 'validate'" @run="validate(slot.id)">
              {{ t('gsms.emargement.contreValider') }}
            </GsmsActionGate>
            <GsmsActionGate :decision="slot.capabilities.code" show-reason variant="outline" :pending="busy === 'code'" @run="code(slot.id)">
              {{ slot.code_actif ? t('gsms.emargement.renouvelerCode') : t('gsms.emargement.emettreCode') }}
            </GsmsActionGate>
          </div>
          <p v-if="slot.capabilities.record && !slot.capabilities.record.allowed" class="muted record-refused">
            {{ t('gsms.emargement.saisieImpossible', { motif: slot.capabilities.record.message }) }}
          </p>
          <ul class="presences">
            <li v-for="p in slot.presences" :key="p.enrollment_id" class="presence">
              <GsmsPersonAvatar :name="p.stagiaire" :photo="p.stagiaire_photo_url" />
              <div class="presence-who">
                <span class="presence-name">{{ p.stagiaire }}</span>
                <span v-if="p.heure || p.procede || p.note" class="muted">
                  {{ p.heure ? fmtDateTime(p.heure) : '' }}<template v-if="p.procede"> · {{ p.procede }}</template><template v-if="p.note"> · {{ p.note }}</template>
                </span>
              </div>
              <GsmsStatusTag :code="p.etat" />
              <div v-if="slot.capabilities.record?.allowed && p.etat !== 'NON_ATTENDU'" class="presence-actions">
                <t-button size="small" :variant="p.etat === 'PRESENT' ? 'base' : 'outline'" :theme="p.etat === 'PRESENT' ? 'success' : 'default'"
                  :loading="busy === `p:${p.enrollment_id}:1`" @click="mark(slot.id, p.enrollment_id, true)">{{ t('gsms.etats.PRESENT') }}</t-button>
                <t-button size="small" :variant="p.etat === 'ABSENT' ? 'base' : 'outline'" :theme="p.etat === 'ABSENT' ? 'danger' : 'default'"
                  :loading="busy === `p:${p.enrollment_id}:0`" @click="mark(slot.id, p.enrollment_id, false)">{{ t('gsms.etats.ABSENT') }}</t-button>
              </div>
            </li>
          </ul>
        </div>
      </template>
    </template>

    <t-dialog v-model:visible="codeVisible" :header="t('gsms.emargement.codeSalle')" :footer="false" attach="body" width="min(420px, calc(100vw - 32px))">
      <div v-if="issued" class="code-box">
        <div class="code-value">{{ issued.code }}</div>
        <p class="muted">{{ t('gsms.emargement.codeAide') }}</p>
        <code class="code-link">{{ issued.qr }}</code>
      </div>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { DialogPlugin } from 'tdesign-vue-next'
import { useI18n } from 'vue-i18n'
import EmptyState from '@/components/EmptyState.vue'
import GsmsRefusal from './GsmsRefusal.vue'
import GsmsStatusTag from './GsmsStatusTag.vue'
import GsmsActionGate from './GsmsActionGate.vue'
import GsmsPersonAvatar from './GsmsPersonAvatar.vue'
import { getAttendanceSheet, issueSlotCode, planSlots, recordPresence, validateSlot, type AttendanceSheet, type HalfDay } from '@/api/gsms/attendance'
import { useGsmsAccessStore } from '@/stores/gsmsAccess'
import { fmtDate, fmtDateTime } from './format'

const props = defineProps<{ sessionId: string }>()
const access = useGsmsAccessStore()
const { t, te, locale } = useI18n()

const sheet = ref<AttendanceSheet | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const actionError = ref<unknown>(null)
const busy = ref('')
const slotId = ref('')
const codeVisible = ref(false)
const issued = ref<{ code: string; qr: string } | null>(null)

// Préparer les demi-journées n'a pas d'objet `capabilities` : le bouton suit la permission de la route (attendance.write).
const canPlan = computed(() => access.can('attendance.write'))

const slotLabel = (s: HalfDay) => {
  const d = new Date(`${s.jour}T00:00:00`)
  const day = Number.isNaN(d.getTime()) ? fmtDate(s.jour) : d.toLocaleDateString(locale.value, { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
  const period = te(`gsms.emargement.periodes.${s.periode}`) ? t(`gsms.emargement.periodes.${s.periode}`) : s.periode.toLowerCase()
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} · ${period}`
}
const slotOptions = computed(() => (sheet.value?.demi_journees ?? []).map((s) => ({
  value: s.id, label: `${slotLabel(s)}${s.contre_validee ? ' ✓' : ''}`,
})))
const slot = computed(() => sheet.value?.demi_journees.find((s) => s.id === slotId.value) ?? null)
const validatedCount = computed(() => (sheet.value?.demi_journees ?? []).filter((s) => s.contre_validee).length)

async function load() {
  loading.value = true
  error.value = null
  try {
    sheet.value = await getAttendanceSheet(props.sessionId)
    const slots = sheet.value.demi_journees
    if (!slots.some((s) => s.id === slotId.value)) {
      const today = new Date().toISOString().slice(0, 10)
      slotId.value = (slots.find((s) => s.jour === today) ?? slots.find((s) => !s.contre_validee) ?? slots[0])?.id ?? ''
    }
  } catch (e) {
    error.value = e
    sheet.value = null
  } finally {
    loading.value = false
  }
}
watch(() => props.sessionId, () => { slotId.value = ''; actionError.value = null; load() }, { immediate: true })

async function act(key: string, fn: () => Promise<unknown>) {
  busy.value = key
  actionError.value = null
  try {
    await fn()
    await load()
  } catch (e) {
    actionError.value = e
  } finally {
    busy.value = ''
  }
}

const plan = () => act('plan', () => planSlots(props.sessionId))
const mark = (slot: string, enrollment: string, present: boolean) =>
  act(`p:${enrollment}:${present ? 1 : 0}`, () => recordPresence(slot, enrollment, present))
const validate = (slot: string) => {
  const dlg = DialogPlugin.confirm({
    header: t('gsms.emargement.contreValider'),
    body: t('gsms.emargement.contreValiderAide'),
    confirmBtn: t('gsms.emargement.contreValiderBouton'),
    cancelBtn: t('gsms.commun.annuler'),
    onConfirm: () => { dlg.destroy(); act('validate', () => validateSlot(slot)) },
    onClose: () => dlg.destroy(),
  })
}
const code = (slot: string) => act('code', async () => {
  issued.value = await issueSlotCode(slot)
  codeVisible.value = true
})
</script>

<style scoped lang="less">
@import (reference) './gsms-list.less';
.panel { .gsms-panel(); }
.muted { .gsms-muted(); }
.att-bar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; margin-bottom: 10px; }
.att-select { width: 320px; max-width: 100%; }
.slot-head { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
.slot-title { display: flex; flex-direction: column; gap: 2px; min-width: 0; strong { font-size: var(--app-text-md); } }
.slot-actions { display: flex; flex-wrap: wrap; gap: 12px; margin: 12px 0 4px; }
.record-refused { margin: 8px 0 0; }
.presences { list-style: none; margin: 12px 0 0; padding: 0; }
.presence {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 10px;
  padding: 8px 0;
  border-top: 1px solid color-mix(in srgb, var(--td-component-stroke) 70%, transparent);
}
.presence-who { flex: 1 1 180px; min-width: 0; display: flex; flex-direction: column; }
.presence-name { font-size: var(--app-text-md); color: var(--td-text-color-primary); }
.presence-actions { display: flex; gap: 6px; }
.code-box { text-align: center; }
.code-value { font-size: var(--app-text-4xl); font-weight: 700; letter-spacing: 4px; color: var(--td-brand-color); font-variant-numeric: tabular-nums; }
.code-link { display: block; margin-top: 8px; padding: 6px 8px; border-radius: var(--app-radius-sm); background: var(--td-bg-color-secondarycontainer); overflow-wrap: anywhere; font-size: var(--app-text-sm); }
@media (max-width: 720px) {
  .presence-actions { width: 100%; .t-button { flex: 1; } }
}
</style>
