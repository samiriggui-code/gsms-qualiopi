/**
 * Rubriques métier Qualiopi du menu, séparées des fonctions IA.
 * Une entrée s'affiche si GET /api/v1/bootstrap l'ouvre : clé de navigation renvoyée par l'API
 * (fonctionnalité active ET permission détenue), et, pour l'émargement, module « attendance » actif.
 */
export interface GsmsMenuEntry {
  /** Chemin sous /platform, aussi valeur de `meta.gsms` des routes. */
  path: string
  title: string
  icon: string
  /** Clés de GET /bootstrap → navigation : l'une d'elles suffit. Vide : tout compte connecté. */
  nav: string[]
  feature?: string
}

export interface GsmsMenuGroup {
  key: string
  title: string
  entries: GsmsMenuEntry[]
}

export const GSMS_MENU: GsmsMenuGroup[] = [
  {
    key: 'formation',
    title: 'Formation',
    entries: [
      { path: 'pilotage', title: 'Pilotage', icon: 'dashboard', nav: [] },
      { path: 'sessions', title: 'Sessions', icon: 'calendar-1', nav: ['sessions', 'mes_sessions'] },
      { path: 'emargement', title: 'Émargement', icon: 'edit-1', nav: ['sessions', 'mes_sessions'], feature: 'attendance' },
      { path: 'parcours', title: 'Parcours stagiaire', icon: 'user-checked', nav: ['sessions', 'mes_sessions'] },
    ],
  },
  {
    key: 'qualite',
    title: 'Qualité',
    entries: [
      { path: 'qualite/indicateurs', title: 'Indicateurs', icon: 'chart-bar', nav: ['qualite'] },
      { path: 'qualite/preuves', title: 'Preuves', icon: 'file-safety', nav: ['qualite'] },
      { path: 'qualite/constats', title: 'Constats et actions', icon: 'error-circle', nav: ['qualite'] },
      { path: 'qualite/audits', title: 'Audits internes', icon: 'fact-check', nav: ['qualite'] },
      { path: 'qualite/echeances', title: 'Échéances', icon: 'time', nav: ['qualite'] },
      { path: 'dossiers', title: 'Dossiers de pièces', icon: 'folder', nav: ['dossiers'] },
      { path: 'journal', title: 'Journal', icon: 'history', nav: ['journal'] },
    ],
  },
]
