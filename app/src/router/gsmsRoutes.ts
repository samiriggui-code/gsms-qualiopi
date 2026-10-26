/**
 * Pages métier Qualiopi, enfants de /platform (même coque que les écrans WeKnora).
 * `meta.gsms` porte la rubrique du menu ; l'accès réel est vérifié par l'API à chaque appel.
 */
import type { RouteRecordRaw } from 'vue-router'

const meta = (gsms: string) => ({ requiresInit: true, requiresAuth: true, gsms })

export const gsmsRoutes: RouteRecordRaw[] = [
  { path: 'pilotage', name: 'gsmsPilotage', component: () => import('../views/gsms/PilotageRoadmap.vue'), meta: meta('pilotage') },
  { path: 'sessions', name: 'gsmsSessions', component: () => import('../views/gsms/SessionList.vue'), meta: meta('sessions') },
  { path: 'sessions/:sessionId', name: 'gsmsSession', component: () => import('../views/gsms/SessionDetail.vue'), meta: meta('sessions') },
  { path: 'emargement/:sessionId?', name: 'gsmsEmargement', component: () => import('../views/gsms/AttendancePage.vue'), meta: meta('emargement') },
  { path: 'parcours', name: 'gsmsParcours', component: () => import('../views/gsms/JourneyOverview.vue'), meta: meta('parcours') },
  { path: 'parcours/:enrollmentId', name: 'gsmsParcoursStagiaire', component: () => import('../views/gsms/LearnerJourney.vue'), meta: meta('parcours') },
  { path: 'qualite/indicateurs', name: 'gsmsIndicateurs', component: () => import('../views/gsms/QualityIndicators.vue'), meta: meta('qualite/indicateurs') },
  { path: 'qualite/preuves', name: 'gsmsPreuves', component: () => import('../views/gsms/EvidenceList.vue'), meta: meta('qualite/preuves') },
  { path: 'qualite/preuves/:evidenceId', name: 'gsmsPreuve', component: () => import('../views/gsms/EvidenceDetail.vue'), meta: meta('qualite/preuves') },
  { path: 'qualite/constats', name: 'gsmsConstats', component: () => import('../views/gsms/FindingsPage.vue'), meta: meta('qualite/constats') },
  { path: 'qualite/audits', name: 'gsmsAudits', component: () => import('../views/gsms/AuditList.vue'), meta: meta('qualite/audits') },
  { path: 'qualite/audits/:auditId', name: 'gsmsAudit', component: () => import('../views/gsms/AuditDetail.vue'), meta: meta('qualite/audits') },
  { path: 'qualite/echeances', name: 'gsmsEcheances', component: () => import('../views/gsms/MilestonesPage.vue'), meta: meta('qualite/echeances') },
  { path: 'dossiers', name: 'gsmsDossiers', component: () => import('../views/gsms/DossiersPage.vue'), meta: meta('dossiers') },
  { path: 'journal', name: 'gsmsJournal', component: () => import('../views/gsms/JournalPage.vue'), meta: meta('journal') },
]
