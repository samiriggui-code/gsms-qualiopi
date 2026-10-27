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
        <!-- Graphiques de la rubrique (GsmsChartCard) : chiffres de l'API seulement, chaque carte montre son refus. -->
        <div v-if="$slots.charts" class="charts"><slot name="charts" /></div>
        <div v-if="alerts || engine" class="duo" :class="{ 'duo--single': !engine || !alerts }">
          <GsmsAlertList v-if="alerts" :title="alerts.title" :subtitle="alerts.subtitle" :items="alerts.items" :loading="alerts.loading"
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
        <!-- Contenu propre à la rubrique, avant les modules (ex. feuille de route du tableau de bord). -->
        <slot name="body" />
        <template v-if="modules.length">
          <h3 class="modules-title">{{ t('gsms.landing.modules') }}</h3>
          <!-- Grille équilibrée : autant de colonnes que la ligne peut en remplir ; la dernière ligne s'étire sur toute la largeur. -->
          <div class="modules" :style="{ '--module-cols': moduleColumns(modules.length) }">
            <GsmsModuleCard v-for="(m, i) in modules" :key="m.key" :item="m" :accent="i" />
          </div>
        </template>
        <slot />
        <GsmsHelpFooter :context="String($route.meta?.gsms ?? '')" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Patron de niveau 1 (vue d'ensemble d'une rubrique) : chiffres clés, graphiques, points à traiter, état du moteur Qualiopi
 * pour les indicateurs de la rubrique, une carte par module. Ne calcule rien : la page fournit tout, tiré de l'API.
 */
import { useI18n } from 'vue-i18n'
import GsmsPageHeader from './GsmsPageHeader.vue'
import GsmsRefusal from './GsmsRefusal.vue'
import GsmsKpiRow from './GsmsKpiRow.vue'
import GsmsAlertList from './GsmsAlertList.vue'
import GsmsModuleCard from './GsmsModuleCard.vue'
import GsmsStatusTag from './GsmsStatusTag.vue'
import GsmsHelpFooter from './GsmsHelpFooter.vue'
import type { AlertItem, EngineRow, KpiItem, ModuleItem } from './types'

withDefaults(defineProps<{
  title: string
  icon: string
  description: string
  error?: unknown
  kpis: KpiItem[]
  kpiLoading?: boolean
  /** Points à traiter ; absent quand la page les montre autrement (ex. colonnes de la feuille de route). */
  alerts?: { title: string; subtitle?: string; items: AlertItem[]; loading?: boolean; error?: unknown; empty: string; moreTo?: string } | null
  engine?: { subtitle: string; rows: EngineRow[]; loading?: boolean; error?: unknown } | null
  modules: ModuleItem[]
}>(), { kpiLoading: false, alerts: null })
const { t } = useI18n()

/** Colonnes des modules à grand écran : 1 à 4 cartes sur une ligne, au-delà 4 ou 3 selon ce qui laisse le moins de vide. */
function moduleColumns(n: number): number {
  if (n <= 4) return Math.max(n, 1)
  const gap = (c: number) => (n % c === 0 ? 0 : c - (n % c))
  return gap(4) <= gap(3) ? 4 : 3
}
</script>

<style scoped lang="less">
@import (reference) './gsms-list.less';
.gsms-page { .gsms-page-shell(); }
.gsms-page-content { .resource-list-content(); }
.gsms-page-main { .resource-list-main(); }
.landing { display: flex; flex-direction: column; gap: 20px; }
// Bloc d'aide : 40 px après le contenu au total (écart de la colonne compris).
.landing > .help { margin-top: 20px; }
.charts { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr)); gap: 16px; align-items: stretch; }
.duo { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; align-items: start;
  &.duo--single { grid-template-columns: minmax(0, 1fr); }
  @media (max-width: 960px) { grid-template-columns: minmax(0, 1fr); } }
.panel { .gsms-panel(); padding: 18px 20px; }
.panel-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; h3 { .gsms-panel-title(); margin: 0; display: flex; align-items: center; gap: 6px; } }
.engine-icon { color: var(--td-text-color-secondary); }
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
.modules-title { .gsms-panel-title(); margin: 8px 0 0; font-family: var(--app-font-family-display); font-size: var(--app-text-xl); }
// Lignes souples : chaque carte prend 1/N de la ligne et les cartes de la dernière ligne s'élargissent pour la
// remplir (7 modules sur 4 colonnes : 4 puis 3 cartes plus larges), sans trou à aucune largeur.
.modules {
  --module-gap: 16px;
  display: flex;
  flex-wrap: wrap;
  gap: var(--module-gap);
  > * {
    // Base un peu sous 1/N (flex-grow comble l'écart) : les arrondis au sous-pixel ne renvoient jamais une carte à la ligne.
    flex: 1 1 calc(100% / var(--module-cols) - var(--module-gap));
    box-sizing: border-box;
    min-width: 0;
  }
  @media (max-width: 1100px) { > * { flex-basis: calc(50% - var(--module-gap)); } }
  @media (max-width: 640px) { > * { flex-basis: 100%; } }
}
</style>
