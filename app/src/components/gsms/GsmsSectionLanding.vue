<template>
  <div class="gsms-page">
    <div class="gsms-page-content">
      <GsmsPageHeader :title="title" :icon="icon" :subtitle="description">
        <template v-if="$slots.actions" #actions><slot name="actions" /></template>
      </GsmsPageHeader>
      <div class="gsms-page-main landing">
        <GsmsRefusal v-if="error" :error="error" inline />
        <!-- Refus : pas de chiffres, jamais des compteurs à zéro à la place du refus -->
        <GsmsKpiRow v-if="!error" :items="kpis" :loading="kpiLoading" />
        <div class="duo" :class="{ 'duo--single': !engine }">
          <GsmsAlertList :title="alerts.title" :subtitle="alerts.subtitle" :items="alerts.items" :loading="alerts.loading"
            :error="alerts.error" :empty="alerts.empty" :more-to="alerts.moreTo" />
          <section v-if="engine" class="panel engine">
            <header class="panel-head">
              <h3><t-icon name="chart-bar" size="16px" class="engine-icon" />{{ t('gsms.landing.moteur') }}</h3>
              <span v-if="!engine.loading" class="count">{{ engine.rows.length }}</span>
            </header>
            <p class="sub">{{ engine.subtitle }}</p>
            <div v-if="engine.loading"><t-skeleton v-for="n in 4" :key="n" animation="gradient" :row-col="[{ width: '100%' }]" class="skel" /></div>
            <GsmsRefusal v-else-if="engine.error" :error="engine.error" inline />
            <ul v-else class="engine-rows">
              <li v-for="r in engine.rows" :key="r.numero">
                <router-link :to="r.to" class="engine-row">
                  <span class="num">{{ r.numero }}</span>
                  <span class="engine-text">
                    <span class="engine-name">{{ r.nom }}</span>
                    <span v-if="r.detail" class="engine-detail">{{ r.detail }}</span>
                  </span>
                  <GsmsStatusTag :code="r.etat" />
                </router-link>
              </li>
            </ul>
          </section>
        </div>
        <template v-if="modules.length">
          <h3 class="modules-title">{{ t('gsms.landing.modules') }}</h3>
          <div class="modules">
            <GsmsModuleCard v-for="(m, i) in modules" :key="m.key" :item="m" :accent="i" />
          </div>
        </template>
        <slot />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Patron de niveau 1 (vue d'ensemble d'une rubrique) : chiffres clés, points à traiter, état du moteur Qualiopi
 * pour les indicateurs de la rubrique, une carte par module. Ne calcule rien : la page fournit tout, tiré de l'API.
 */
import { useI18n } from 'vue-i18n'
import GsmsPageHeader from './GsmsPageHeader.vue'
import GsmsRefusal from './GsmsRefusal.vue'
import GsmsKpiRow from './GsmsKpiRow.vue'
import GsmsAlertList from './GsmsAlertList.vue'
import GsmsModuleCard from './GsmsModuleCard.vue'
import GsmsStatusTag from './GsmsStatusTag.vue'
import type { AlertItem, EngineRow, KpiItem, ModuleItem } from './types'

withDefaults(defineProps<{
  title: string
  icon: string
  description: string
  error?: unknown
  kpis: KpiItem[]
  kpiLoading?: boolean
  alerts: { title: string; subtitle?: string; items: AlertItem[]; loading?: boolean; error?: unknown; empty: string; moreTo?: string }
  engine?: { subtitle: string; rows: EngineRow[]; loading?: boolean; error?: unknown } | null
  modules: ModuleItem[]
}>(), { kpiLoading: false })
const { t } = useI18n()
</script>

<style scoped lang="less">
@import (reference) './gsms-list.less';
.gsms-page { .gsms-page-shell(); }
.gsms-page-content { .resource-list-content(); }
.gsms-page-main { .resource-list-main(); }
.landing { display: flex; flex-direction: column; gap: 16px; }
.duo { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; align-items: start;
  &.duo--single { grid-template-columns: minmax(0, 1fr); }
  @media (max-width: 960px) { grid-template-columns: minmax(0, 1fr); } }
.panel { .gsms-panel(); }
.panel-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; h3 { .gsms-panel-title(); margin: 0; display: flex; align-items: center; gap: 6px; } }
.engine-icon { color: var(--td-brand-color); }
.count { .gsms-chip(); }
.sub { .gsms-muted(); margin: 4px 0 8px; }
.skel { margin-top: 8px; }
.engine-rows { list-style: none; margin: 0; padding: 0; max-height: 420px; overflow-y: auto; li + li { border-top: 1px dashed var(--td-component-stroke); } }
.engine-row { display: flex; align-items: center; gap: 10px; padding: 7px 4px; color: inherit; text-decoration: none; border-radius: var(--app-radius-xs);
  &:hover { background: var(--td-bg-color-container-hover); }
  &:focus-visible { outline: 2px solid var(--td-brand-color); outline-offset: -2px; } }
.num { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 28px; height: 28px; border: 1px solid var(--td-component-stroke);
  border-radius: var(--app-radius-sm); background: var(--td-bg-color-secondarycontainer); font-size: var(--app-text-xs); font-weight: 700; font-variant-numeric: tabular-nums; }
.engine-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.engine-name { font-size: var(--app-text-md); font-weight: 500; color: var(--td-text-color-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.engine-detail { font-size: var(--app-text-xs); color: var(--td-text-color-secondary); }
.modules-title { .gsms-panel-title(); margin: 4px 0 0; }
.modules { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr)); gap: 12px; }
</style>
