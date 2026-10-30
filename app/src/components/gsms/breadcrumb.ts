/**
 * Fil d'Ariane des pages GSMS : « Tableau de bord › Section (vue d'ensemble) › Page › Fiche », construit à partir du
 * menu (config/gsmsMenu.ts : section, entrée, vue d'ensemble) et de la route courante (`meta.gsms`). Une fiche renvoie
 * à sa liste ; son libellé (référence, nom…) est fourni par la page. Présentation seulement : l'accès reste décidé par
 * GET /bootstrap (une vue d'ensemble fermée au compte n'apparaît pas).
 */
import { computed, type Ref } from 'vue'
import { useRoute, useRouter, type RouteLocationRaw } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { GSMS_MENU, IA_SECTION, isAccessOpen } from '@/config/gsmsMenu'
import { useGsmsAccessStore } from '@/stores/gsmsAccess'

export interface Crumb {
  label: string
  to?: RouteLocationRaw
}

const DASHBOARD_ROUTE = 'gsmsPilotage'

export function useGsmsBreadcrumb(opts: { current: Ref<string>; back: Ref<string>; backLabel: Ref<string> }) {
  const route = useRoute()
  const router = useRouter()
  const { t } = useI18n()
  const access = useGsmsAccessStore()

  return computed<Crumb[]>(() => {
    const key = String(route.meta?.gsms ?? '')
    if (!key) return []
    let section = GSMS_MENU.find((s) => s.key !== IA_SECTION && s.overview?.key === key && s.overview.route === route.name)
    const isOverview = !!section
    const entry = isOverview ? undefined : GSMS_MENU.flatMap((s) => s.entries.map((e) => ({ s, e }))).find(({ e }) => e.key === key)
    section ??= entry?.s
    if (!section) return []

    const crumbs: Crumb[] = []
    if (route.name !== DASHBOARD_ROUTE && router.hasRoute(DASHBOARD_ROUTE)) {
      crumbs.push({ label: t('gsms.menu.entrees.pilotage'), to: { name: DASHBOARD_ROUTE } })
    }
    const sectionLabel = t(`gsms.menu.sections.${section.key}`)
    if (isOverview) {
      if (route.name !== DASHBOARD_ROUTE) crumbs.push({ label: sectionLabel })
      return crumbs
    }
    const ov = section.overview
    if (ov && ov.route !== DASHBOARD_ROUTE && router.hasRoute(ov.route) && isAccessOpen(ov.access, access)) {
      crumbs.push({ label: sectionLabel, to: { name: ov.route } })
    }
    const e = entry!.e
    if (e.route === DASHBOARD_ROUTE) return crumbs
    const entryLabel = t(`gsms.menu.entrees.${e.key}`)
    if (route.name === e.route) {
      crumbs.push({ label: entryLabel })
      return crumbs
    }
    // Fiche : la liste, puis (si la page l'indique) l'étage intermédiaire (ex. la session d'une inscription).
    crumbs.push({ label: entryLabel, to: { name: e.route } })
    const listPath = router.hasRoute(e.route) ? router.resolve({ name: e.route }).path : ''
    if (opts.back.value && opts.back.value !== listPath && opts.backLabel.value) {
      crumbs.push({ label: opts.backLabel.value, to: opts.back.value })
    }
    crumbs.push({ label: opts.current.value })
    return crumbs
  })
}
