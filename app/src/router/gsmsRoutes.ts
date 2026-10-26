/**
 * Pages métier GSMS, enfants de /platform (même coque que les écrans WeKnora), routes du CDC §5.
 * `meta.gsms` désigne l'entrée du menu à mettre en évidence (config/gsmsMenu.ts) ; l'API vérifie l'accès à chaque appel.
 */
import type { RouteRecordRaw } from 'vue-router'

const meta = (gsms: string) => ({ requiresInit: true, requiresAuth: true, gsms })

export const gsmsRoutes: RouteRecordRaw[] = [
  // A. Pilotage (vue d'ensemble = tableau de bord, page 1)
  { path: 'pilotage', name: 'gsmsPilotage', component: () => import('../views/gsms/pilotage/Overview.vue'), meta: meta('pilotage') },
  // D. Sessions et pédagogie (pages 11 à 13)
  { path: 'sessions', name: 'gsmsSessions', component: () => import('../views/gsms/sessions/SessionList.vue'), meta: meta('sessions') },
  { path: 'sessions/:sessionId', name: 'gsmsSession', component: () => import('../views/gsms/sessions/SessionDetail.vue'), meta: meta('sessions') },
  { path: 'sessions/:sessionId/inscriptions/:enrollmentId', name: 'gsmsInscription', component: () => import('../views/gsms/sessions/LearnerJourney.vue'), meta: meta('sessions') },
  { path: 'emargement/:sessionId?', name: 'gsmsEmargement', component: () => import('../views/gsms/sessions/Attendance.vue'), meta: meta('emargement') },
  // H. Qualité Qualiopi (vue d'ensemble, pages 29 à 36 bis)
  { path: 'qualite', name: 'gsmsQualiopi', component: () => import('../views/gsms/qualite/Overview.vue'), meta: meta('qualite') },
  { path: 'qualite/indicateurs', name: 'gsmsIndicateurs', component: () => import('../views/gsms/qualite/Indicators.vue'), meta: meta('indicateurs') },
  { path: 'qualite/indicateurs/:number(\\d+)', name: 'gsmsIndicateur', component: () => import('../views/gsms/qualite/IndicatorDetail.vue'), meta: meta('indicateurs') },
  { path: 'qualite/carnet', name: 'gsmsCarnet', component: () => import('../views/gsms/qualite/Carnet.vue'), meta: meta('carnet') },
  { path: 'qualite/preuves', name: 'gsmsPreuves', component: () => import('../views/gsms/qualite/Evidence.vue'), meta: meta('preuves') },
  { path: 'qualite/preuves/:evidenceId', name: 'gsmsPreuve', component: () => import('../views/gsms/qualite/EvidenceDetail.vue'), meta: meta('preuves') },
  { path: 'qualite/constats', name: 'gsmsConstats', component: () => import('../views/gsms/qualite/Findings.vue'), meta: meta('constats') },
  { path: 'qualite/audits', name: 'gsmsAudits', component: () => import('../views/gsms/qualite/Audits.vue'), meta: meta('audits') },
  { path: 'qualite/audits/:auditId', name: 'gsmsAudit', component: () => import('../views/gsms/qualite/AuditDetail.vue'), meta: meta('audits') },
  { path: 'qualite/reclamations', name: 'gsmsReclamations', component: () => import('../views/gsms/qualite/Complaints.vue'), meta: meta('reclamations') },
  { path: 'qualite/veille', name: 'gsmsVeille', component: () => import('../views/gsms/qualite/Watch.vue'), meta: meta('veille') },
  { path: 'qualite/dossier', name: 'gsmsDossier', component: () => import('../views/gsms/qualite/OrganismeDossier.vue'), meta: meta('dossier') },
  // K. Administration (page 39)
  { path: 'journal', name: 'gsmsJournal', component: () => import('../views/gsms/journal/Journal.vue'), meta: meta('journal') },
]
