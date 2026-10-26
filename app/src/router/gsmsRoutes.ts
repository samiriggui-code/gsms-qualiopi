/**
 * Pages métier GSMS, enfants de /platform (même coque que les écrans WeKnora), routes du CDC §5.
 * `meta.gsms` désigne l'entrée du menu à mettre en évidence (config/gsmsMenu.ts) ; l'API vérifie l'accès à chaque appel.
 */
import type { RouteRecordRaw } from 'vue-router'

const meta = (gsms: string) => ({ requiresInit: true, requiresAuth: true, gsms })

export const gsmsRoutes: RouteRecordRaw[] = [
  // A. Pilotage (vue d'ensemble = tableau de bord, page 1)
  { path: 'pilotage', name: 'gsmsPilotage', component: () => import('../views/gsms/pilotage/Overview.vue'), meta: meta('pilotage') },
  // École (vue d'ensemble) ; C. Offre de formation (pages 8 à 10)
  { path: 'ecole', name: 'gsmsEcole', component: () => import('../views/gsms/ecole/Overview.vue'), meta: meta('ecole') },
  { path: 'formations', name: 'gsmsFormations', component: () => import('../views/gsms/formations/Catalogue.vue'), meta: meta('formations') },
  { path: 'formations/:programId', name: 'gsmsFormation', component: () => import('../views/gsms/formations/ProgramSheet.vue'), meta: meta('formations') },
  { path: 'edof', name: 'gsmsEdof', component: () => import('../views/gsms/edof/Edof.vue'), meta: meta('edof') },
  { path: 'edof/dossiers/:dossierId', name: 'gsmsEdofDossier', component: () => import('../views/gsms/edof/EdofDossier.vue'), meta: meta('edof') },
  // D. Sessions et pédagogie (pages 11 à 13)
  { path: 'sessions', name: 'gsmsSessions', component: () => import('../views/gsms/sessions/SessionList.vue'), meta: meta('sessions') },
  { path: 'sessions/:sessionId', name: 'gsmsSession', component: () => import('../views/gsms/sessions/SessionDetail.vue'), meta: meta('sessions') },
  { path: 'sessions/:sessionId/inscriptions/:enrollmentId', name: 'gsmsInscription', component: () => import('../views/gsms/sessions/LearnerJourney.vue'), meta: meta('sessions') },
  { path: 'emargement/:sessionId?', name: 'gsmsEmargement', component: () => import('../views/gsms/sessions/Attendance.vue'), meta: meta('emargement') },
  // E. Apprenants (pages 16, 17, 17 bis)
  { path: 'stagiaires', name: 'gsmsStagiaires', component: () => import('../views/gsms/stagiaires/Learners.vue'), meta: meta('stagiaires') },
  { path: 'stagiaires/:learnerId', name: 'gsmsStagiaire', component: () => import('../views/gsms/stagiaires/LearnerSheet.vue'), meta: meta('stagiaires') },
  { path: 'parcours/:vue?', name: 'gsmsParcours', component: () => import('../views/gsms/stagiaires/Registers.vue'), meta: meta('parcours') },
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
  // G. Ressources : vue d'ensemble RH, pages 21 à 28 (lieux et équipements au menu École, partenaires au menu Qualiopi)
  { path: 'rh', name: 'gsmsRh', component: () => import('../views/gsms/rh/Overview.vue'), meta: meta('rh') },
  { path: 'formateurs', name: 'gsmsFormateurs', component: () => import('../views/gsms/rh/Trainers.vue'), meta: meta('formateurs') },
  { path: 'formateurs/:trainerId', name: 'gsmsFormateur', component: () => import('../views/gsms/rh/TrainerDetail.vue'), meta: meta('formateurs') },
  { path: 'personnel', name: 'gsmsPersonnel', component: () => import('../views/gsms/rh/Staff.vue'), meta: meta('personnel') },
  { path: 'developpement', name: 'gsmsDeveloppement', component: () => import('../views/gsms/rh/StaffDevelopment.vue'), meta: meta('developpement') },
  { path: 'lieux', name: 'gsmsLieux', component: () => import('../views/gsms/ressources/Premises.vue'), meta: meta('lieux') },
  { path: 'equipements', name: 'gsmsEquipements', component: () => import('../views/gsms/ressources/Equipment.vue'), meta: meta('equipements') },
  { path: 'sous-traitants', name: 'gsmsSousTraitants', component: () => import('../views/gsms/ressources/Subcontractors.vue'), meta: meta('sousTraitants') },
  { path: 'partenaires', name: 'gsmsPartenaires', component: () => import('../views/gsms/ressources/Partners.vue'), meta: meta('partenaires') },
  // K. Administration (page 39)
  { path: 'journal', name: 'gsmsJournal', component: () => import('../views/gsms/journal/Journal.vue'), meta: meta('journal') },
]
