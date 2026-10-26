/**
 * Sections du menu (CDC §3 « Rubriques du menu ») : Pilotage, École, Finances, RH, Qualiopi, Communication, IA,
 * Administration. Toutes les pages du CDC §5 sont prévues ici ; une entrée ne s'affiche que si sa route existe
 * (page construite) ET si GET /api/v1/bootstrap l'ouvre (clé de navigation, permission effective, module actif).
 * Libellés : gsms.menu.sections.<section> et gsms.menu.entrees.<entrée>.
 */

export interface GsmsAccessRule {
  /** Clés de GET /bootstrap → navigation (fonctionnalité active ET permission) : l'une suffit. */
  nav?: string[]
  /** Permissions effectives (modules actifs seulement) : l'une suffit. */
  perm?: string[]
  /** Module qui doit être actif. */
  feature?: string
}

export interface GsmsMenuEntry {
  /** Clé de l'entrée, égale au `meta.gsms` des routes de la page. */
  key: string
  /** Nom de la route ; l'entrée reste cachée tant que la route n'existe pas. */
  route: string
  icon: string
  access?: GsmsAccessRule
}

export interface GsmsMenuSection {
  key: string
  icon: string
  /** Vue d'ensemble de la section (niveau 1), ouverte par l'en-tête. */
  overview?: { key: string; route: string; access?: GsmsAccessRule }
  entries: GsmsMenuEntry[]
}

/** Section occupée par les écrans WeKnora (assistant, bases de connaissances, agents…). */
export const IA_SECTION = 'ia'

const SESSIONS: GsmsAccessRule = { nav: ['sessions', 'mes_sessions'] }
const QUALITE: GsmsAccessRule = { nav: ['qualite'] }

export const GSMS_MENU: GsmsMenuSection[] = [
  {
    key: 'pilotage', icon: 'dashboard', overview: { key: 'pilotage', route: 'gsmsPilotage' },
    entries: [
      { key: 'pilotage', route: 'gsmsPilotage', icon: 'dashboard' },
      { key: 'planning', route: 'gsmsPlanning', icon: 'calendar', access: SESSIONS },
      { key: 'rapports', route: 'gsmsRapports', icon: 'chart-pie', access: QUALITE },
    ],
  },
  {
    key: 'ecole', icon: 'education', overview: { key: 'ecole', route: 'gsmsEcole', access: SESSIONS },
    entries: [
      { key: 'demandes', route: 'gsmsDemandes', icon: 'user-add', access: { perm: ['leads.read'] } },
      { key: 'devis', route: 'gsmsDevis', icon: 'file-paste', access: { perm: ['documents.read'] } },
      { key: 'entreprises', route: 'gsmsEntreprises', icon: 'city', access: { perm: ['sessions.read'] } },
      { key: 'formations', route: 'gsmsFormations', icon: 'book', access: { perm: ['sessions.read'] } },
      { key: 'edof', route: 'gsmsEdof', icon: 'certificate', access: { perm: ['edof.read'] } },
      { key: 'sessions', route: 'gsmsSessions', icon: 'calendar-1', access: SESSIONS },
      { key: 'emargement', route: 'gsmsEmargement', icon: 'edit-1', access: { ...SESSIONS, feature: 'attendance' } },
      { key: 'evaluations', route: 'gsmsEvaluations', icon: 'task', access: SESSIONS },
      { key: 'satisfaction', route: 'gsmsSatisfaction', icon: 'star', access: { perm: ['sessions.read', 'quality.read'] } },
      { key: 'stagiaires', route: 'gsmsStagiaires', icon: 'usergroup', access: { perm: ['sessions.read'] } },
      { key: 'parcours', route: 'gsmsParcours', icon: 'view-list', access: SESSIONS },
      { key: 'lieux', route: 'gsmsLieux', icon: 'location', access: { perm: ['sessions.read', 'quality.read'] } },
      { key: 'equipements', route: 'gsmsEquipements', icon: 'tools', access: { perm: ['sessions.read', 'quality.read'] } },
    ],
  },
  {
    key: 'finances', icon: 'wallet', overview: { key: 'finances', route: 'gsmsFinances', access: { nav: ['financement'], perm: ['invoices.read'] } },
    entries: [
      { key: 'financement', route: 'gsmsFinancement', icon: 'wallet', access: { nav: ['financement'] } },
      { key: 'factures', route: 'gsmsFactures', icon: 'file', access: { perm: ['invoices.read'] } },
      { key: 'paiements', route: 'gsmsPaiements', icon: 'money', access: { perm: ['invoices.read'] } },
    ],
  },
  {
    key: 'rh', icon: 'user-talk', overview: { key: 'rh', route: 'gsmsRh', access: { perm: ['sessions.read', 'staff.read'] } },
    entries: [
      { key: 'formateurs', route: 'gsmsFormateurs', icon: 'user-talk', access: SESSIONS },
      { key: 'personnel', route: 'gsmsPersonnel', icon: 'user-list', access: { nav: ['personnel'] } },
      { key: 'developpement', route: 'gsmsDeveloppement', icon: 'chart-bar', access: { perm: ['sessions.read'] } },
      { key: 'sousTraitants', route: 'gsmsSousTraitants', icon: 'link', access: { perm: ['sessions.read', 'quality.read'] } },
    ],
  },
  {
    key: 'qualiopi', icon: 'secured', overview: { key: 'qualite', route: 'gsmsQualiopi', access: QUALITE },
    entries: [
      { key: 'indicateurs', route: 'gsmsIndicateurs', icon: 'chart-bar', access: QUALITE },
      { key: 'carnet', route: 'gsmsCarnet', icon: 'book-open', access: QUALITE },
      { key: 'preuves', route: 'gsmsPreuves', icon: 'file-safety', access: QUALITE },
      { key: 'constats', route: 'gsmsConstats', icon: 'flag', access: QUALITE },
      { key: 'audits', route: 'gsmsAudits', icon: 'fact-check', access: QUALITE },
      { key: 'reclamations', route: 'gsmsReclamations', icon: 'chat-bubble-error', access: QUALITE },
      { key: 'veille', route: 'gsmsVeille', icon: 'browse', access: QUALITE },
      { key: 'partenaires', route: 'gsmsPartenaires', icon: 'usergroup-add', access: { perm: ['sessions.read', 'quality.read'] } },
      { key: 'dossier', route: 'gsmsDossier', icon: 'folder', access: { nav: ['dossiers'] } },
    ],
  },
  {
    key: 'communication', icon: 'mail',
    entries: [
      { key: 'messages', route: 'gsmsMessages', icon: 'mail', access: { perm: ['communications.manage'] } },
      { key: 'documents', route: 'gsmsDocuments', icon: 'folder-open', access: { perm: ['quality.read', 'documents.read'] } },
    ],
  },
  { key: IA_SECTION, icon: 'chat', entries: [] },
  {
    key: 'administration', icon: 'setting',
    entries: [
      { key: 'journal', route: 'gsmsJournal', icon: 'history', access: { nav: ['journal'] } },
      { key: 'parametres', route: 'settings', icon: 'setting' },
    ],
  },
]
