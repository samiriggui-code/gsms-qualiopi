/**
 * Pages métier GSMS, enfants de /platform (même coque que les écrans WeKnora), routes du CDC §5.
 * `meta.gsms` désigne l'entrée du menu à mettre en évidence (config/gsmsMenu.ts) ; l'API vérifie l'accès à chaque appel.
 */
import { defineComponent } from 'vue'
import type { RouteRecordRaw } from 'vue-router'
import { GSMS_HOME_PATH, firstOpenGsmsRoute } from '@/config/gsmsMenu'
import { useGsmsAccessStore } from '@/stores/gsmsAccess'

const meta = (gsms: string) => ({ requiresInit: true, requiresAuth: true, gsms })

/** Accueil des écrans du moteur IA, quand aucune section métier n'est ouverte au compte. */
const IA_HOME_PATH = '/platform/knowledge-bases'

// La garde redirige toujours : ce composant n'est jamais affiché.
const HomeRedirect = defineComponent({ name: 'GsmsHomeRedirect', render: () => null })

export const gsmsRoutes: RouteRecordRaw[] = [
  // Accueil : tableau de bord (Pilotage), sinon la première section que GET /bootstrap ouvre au compte.
  {
    path: 'accueil', // GSMS_HOME_PATH
    name: 'gsmsAccueil',
    component: HomeRedirect,
    meta: { requiresInit: true, requiresAuth: true },
    beforeEnter: async () => {
      const access = useGsmsAccessStore()
      await access.load()
      if (!access.bootstrap) return IA_HOME_PATH
      const names = new Set(gsmsRoutes.map((r) => r.name))
      const target = firstOpenGsmsRoute(access, (name) => names.has(name))
      return target ? { name: target, replace: true } : IA_HOME_PATH
    },
  },
  // A. Pilotage (vue d'ensemble = tableau de bord, page 1)
  { path: 'pilotage', name: 'gsmsPilotage', component: () => import('../views/gsms/pilotage/Overview.vue'), meta: meta('pilotage') },
  // Planning (page 2), bilans et rapports, aide au BPF (page 3)
  { path: 'planning', name: 'gsmsPlanning', component: () => import('../views/gsms/pilotage/Planning.vue'), meta: meta('planning') },
  { path: 'rapports', name: 'gsmsRapports', component: () => import('../views/gsms/pilotage/Reports.vue'), meta: meta('rapports') },
  { path: 'rapports/bpf', name: 'gsmsBpf', component: () => import('../views/gsms/pilotage/Bpf.vue'), meta: meta('rapports') },
  // École (vue d'ensemble) ; C. Offre de formation (pages 8 à 10)
  { path: 'ecole', name: 'gsmsEcole', component: () => import('../views/gsms/ecole/Overview.vue'), meta: meta('ecole') },
  // B. Commercial (pages 4 à 7) : demandes du site, devis, entreprises clientes
  { path: 'demandes', name: 'gsmsDemandes', component: () => import('../views/gsms/commercial/Requests.vue'), meta: meta('demandes') },
  { path: 'demandes/:requestId', name: 'gsmsDemande', component: () => import('../views/gsms/commercial/RequestSheet.vue'), meta: meta('demandes') },
  { path: 'devis', name: 'gsmsDevis', component: () => import('../views/gsms/commercial/Quotes.vue'), meta: meta('devis') },
  { path: 'devis/:quoteId', name: 'gsmsDevisFiche', component: () => import('../views/gsms/commercial/QuoteSheet.vue'), meta: meta('devis') },
  { path: 'entreprises', name: 'gsmsEntreprises', component: () => import('../views/gsms/commercial/Companies.vue'), meta: meta('entreprises') },
  { path: 'entreprises/:companyId', name: 'gsmsEntreprise', component: () => import('../views/gsms/commercial/CompanySheet.vue'), meta: meta('entreprises') },
  { path: 'formations', name: 'gsmsFormations', component: () => import('../views/gsms/formations/Catalogue.vue'), meta: meta('formations') },
  { path: 'formations/:programId', name: 'gsmsFormation', component: () => import('../views/gsms/formations/ProgramSheet.vue'), meta: meta('formations') },
  { path: 'edof', name: 'gsmsEdof', component: () => import('../views/gsms/edof/Edof.vue'), meta: meta('edof') },
  { path: 'edof/dossiers/:dossierId', name: 'gsmsEdofDossier', component: () => import('../views/gsms/edof/EdofDossier.vue'), meta: meta('edof') },
  // D. Sessions et pédagogie (pages 11 à 13)
  { path: 'sessions', name: 'gsmsSessions', component: () => import('../views/gsms/sessions/SessionList.vue'), meta: meta('sessions') },
  { path: 'sessions/:sessionId', name: 'gsmsSession', component: () => import('../views/gsms/sessions/SessionDetail.vue'), meta: meta('sessions') },
  { path: 'sessions/:sessionId/inscriptions/:enrollmentId', name: 'gsmsInscription', component: () => import('../views/gsms/sessions/LearnerJourney.vue'), meta: meta('sessions') },
  { path: 'emargement/:sessionId?', name: 'gsmsEmargement', component: () => import('../views/gsms/sessions/Attendance.vue'), meta: meta('emargement') },
  // Évaluations des acquis et résultats (page 14), satisfaction (page 15)
  { path: 'evaluations', name: 'gsmsEvaluations', component: () => import('../views/gsms/sessions/Assessments.vue'), meta: meta('evaluations') },
  { path: 'satisfaction', name: 'gsmsSatisfaction', component: () => import('../views/gsms/sessions/Satisfaction.vue'), meta: meta('satisfaction') },
  // E. Apprenants (pages 16, 17, 17 bis)
  { path: 'stagiaires', name: 'gsmsStagiaires', component: () => import('../views/gsms/stagiaires/Learners.vue'), meta: meta('stagiaires') },
  { path: 'stagiaires/:learnerId', name: 'gsmsStagiaire', component: () => import('../views/gsms/stagiaires/LearnerSheet.vue'), meta: meta('stagiaires') },
  { path: 'parcours/:vue?', name: 'gsmsParcours', component: () => import('../views/gsms/stagiaires/Registers.vue'), meta: meta('parcours') },
  // F. Finances : vue d'ensemble, financement (page 18), factures et avoirs (19), encaissements (20)
  { path: 'finances', name: 'gsmsFinances', component: () => import('../views/gsms/finances/Overview.vue'), meta: meta('finances') },
  { path: 'financement', name: 'gsmsFinancement', component: () => import('../views/gsms/finances/FundingCases.vue'), meta: meta('financement') },
  { path: 'financement/:enrollmentId', name: 'gsmsDossierFinancement', component: () => import('../views/gsms/finances/FundingCase.vue'), meta: meta('financement') },
  { path: 'factures', name: 'gsmsFactures', component: () => import('../views/gsms/finances/Invoices.vue'), meta: meta('factures') },
  { path: 'factures/:invoiceId', name: 'gsmsFacture', component: () => import('../views/gsms/finances/InvoiceDetail.vue'), meta: meta('factures') },
  { path: 'paiements', name: 'gsmsPaiements', component: () => import('../views/gsms/finances/Payments.vue'), meta: meta('paiements') },
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
  { path: 'personnel/:staffId', name: 'gsmsPersonnelFiche', component: () => import('../views/gsms/rh/StaffSheet.vue'), meta: meta('personnel') },
  { path: 'developpement', name: 'gsmsDeveloppement', component: () => import('../views/gsms/rh/StaffDevelopment.vue'), meta: meta('developpement') },
  { path: 'lieux', name: 'gsmsLieux', component: () => import('../views/gsms/ressources/Premises.vue'), meta: meta('lieux') },
  { path: 'equipements', name: 'gsmsEquipements', component: () => import('../views/gsms/ressources/Equipment.vue'), meta: meta('equipements') },
  { path: 'sous-traitants', name: 'gsmsSousTraitants', component: () => import('../views/gsms/ressources/Subcontractors.vue'), meta: meta('sousTraitants') },
  { path: 'sous-traitants/:subcontractorId', name: 'gsmsSousTraitant', component: () => import('../views/gsms/ressources/SubcontractorSheet.vue'), meta: meta('sousTraitants') },
  { path: 'partenaires', name: 'gsmsPartenaires', component: () => import('../views/gsms/ressources/Partners.vue'), meta: meta('partenaires') },
  // I et J. Communication : vue d'ensemble, messages et relances (page 37), documents (page 38)
  { path: 'communication', name: 'gsmsCommunication', component: () => import('../views/gsms/communication/Overview.vue'), meta: meta('communication') },
  { path: 'messages', name: 'gsmsMessages', component: () => import('../views/gsms/communication/Messages.vue'), meta: meta('messages') },
  { path: 'documents', name: 'gsmsDocuments', component: () => import('../views/gsms/communication/Documents.vue'), meta: meta('documents') },
  // K. Administration (page 39)
  { path: 'journal', name: 'gsmsJournal', component: () => import('../views/gsms/journal/Journal.vue'), meta: meta('journal') },
  // Adresse inconnue sous /platform : page introuvable (le routeur la classe après toutes les routes connues).
  { path: ':pathMatch(.*)*', name: 'gsmsIntrouvable', component: () => import('../views/gsms/NotFound.vue'), meta: { requiresInit: true, requiresAuth: true } },
]
