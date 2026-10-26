/**
 * Sections Qualiopi du panneau Paramètres (docs/API.md §3). Chaque section n'apparaît que si le compte a le droit
 * de lire ce qu'elle affiche et que le module est actif (GET /api/v1/bootstrap, store gsmsAccess) ; l'API reste seule juge.
 *
 * Sections proposées par docs/API.md sans route de lecture, donc absentes : Échéancier (circuit de session),
 * Questionnaires, Documents et modèles (gabarits), Déploiement (seul `available` des modules est visible, dans Modules).
 */
import type { Component } from 'vue'
import { defineAsyncComponent } from 'vue'
import type { useGsmsAccessStore } from '@/stores/gsmsAccess'

type Access = ReturnType<typeof useGsmsAccessStore>

export const GSMS_SECTION_PREFIX = 'gsms-'

export interface GsmsSection {
  key: string
  /** Clé i18n du libellé (gsms.parametres.sections.…). */
  labelKey: string
  icon: string
  visible: (a: Access) => boolean
  component: Component
}

const lazy = (loader: () => Promise<{ default: Component }>) => defineAsyncComponent(loader)

export const GSMS_SECTIONS: GsmsSection[] = [
  { key: 'gsms-organisme', labelKey: 'gsms.parametres.sections.organisme', icon: 'building', visible: () => true,
    component: lazy(() => import('./OrganismeSettings.vue')) },
  { key: 'gsms-equipe', labelKey: 'gsms.parametres.sections.equipe', icon: 'usergroup', visible: (a) => a.can('users.manage'),
    component: lazy(() => import('./EquipeSettings.vue')) },
  { key: 'gsms-modules', labelKey: 'gsms.parametres.sections.modules', icon: 'app', visible: () => true,
    component: lazy(() => import('./ModulesSettings.vue')) },
  { key: 'gsms-reglages', labelKey: 'gsms.parametres.sections.reglages', icon: 'setting-1', visible: (a) => a.can('settings.manage'),
    component: lazy(() => import('./ReglagesSettings.vue')) },
  { key: 'gsms-referentiel', labelKey: 'gsms.parametres.sections.referentiel', icon: 'verified',
    visible: (a) => a.hasFeature('qualiopi') && a.can('quality.read'),
    component: lazy(() => import('./ReferentielSettings.vue')) },
  { key: 'gsms-preuves', labelKey: 'gsms.parametres.sections.preuves', icon: 'folder-open',
    visible: (a) => a.hasFeature('qualiopi') && a.can('quality.read'),
    component: lazy(() => import('./PreuvesSettings.vue')) },
  { key: 'gsms-communications', labelKey: 'gsms.parametres.sections.communications', icon: 'mail',
    visible: (a) => a.hasFeature('relances') && a.can('communications.manage'),
    component: lazy(() => import('./CommunicationsSettings.vue')) },
  { key: 'gsms-financement', labelKey: 'gsms.parametres.sections.financement', icon: 'wallet',
    visible: (a) => a.hasFeature('funding') && a.can('funding.read'),
    component: lazy(() => import('./FinancementSettings.vue')) },
  { key: 'gsms-edof', labelKey: 'gsms.parametres.sections.edof', icon: 'file-safety',
    visible: (a) => a.hasFeature('edof') && a.can('edof.read'),
    component: lazy(() => import('./EdofSettings.vue')) },
  { key: 'gsms-moyens', labelKey: 'gsms.parametres.sections.moyens', icon: 'location',
    visible: (a) => a.hasFeature('training') && (a.can('sessions.read') || a.can('quality.read')),
    component: lazy(() => import('./MoyensSettings.vue')) },
  { key: 'gsms-listes', labelKey: 'gsms.parametres.sections.listes', icon: 'view-list', visible: () => true,
    component: lazy(() => import('./ListesSettings.vue')) },
]

export const isGsmsSection = (key: string) => key.startsWith(GSMS_SECTION_PREFIX)
