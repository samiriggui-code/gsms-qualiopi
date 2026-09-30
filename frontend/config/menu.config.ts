import {
  Accessibility,
  Award,
  BadgeCheck,
  BellRing,
  BookOpen,
  Briefcase,
  Building2,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  Crosshair,
  FileCheck2,
  FileSignature,
  FolderOpen,
  GraduationCap,
  HandCoins,
  Handshake,
  History,
  Home,
  Landmark,
  LayoutDashboard,
  Library,
  ListChecks,
  Mail,
  MessageSquareWarning,
  Network,
  Presentation,
  Radar,
  ScanSearch,
  School,
  ShieldCheck,
  Smile,
  Sprout,
  TrendingUp,
  UserRound,
  Users,
  UserX,
  Warehouse,
  Wrench,
  Settings,
  BookOpenCheck,
} from 'lucide-react';
import { type NavConfig, type NavItem } from './types';

export const MAIN_NAV: NavConfig = [
  {
    id: 'pilotage',
    title: 'Pilotage',
    icon: LayoutDashboard,
    items: [
      {
        id: 'dashboard',
        title: 'Tableau de bord',
        icon: Home,
        path: '/',
        spec: {
          description:
            'Synthèse de conformité par critère, sessions à venir, écarts ouverts, actions correctives en retard et prochaines échéances.',
          source: 'Moteur Qualiopi (évaluations, preuves, CAPA) et sessions',
          data: 'calcule',
        },
      },
      {
        id: 'agenda',
        title: 'Agenda',
        icon: CalendarRange,
        path: '/agenda',
        spec: {
          description: 'Planning des sessions, des formateurs et des salles (vue mois, semaine, jour).',
          indicators: [9, 17],
          source: 'formation.session, formation.attendance_slot',
          data: 'existant',
        },
      },
      {
        id: 'alertes',
        title: 'Échéances & alertes',
        icon: BellRing,
        path: '/alertes',
        spec: {
          description:
            'Preuves expirées, habilitations à renouveler, conventions non signées, convocations non envoyées, émargements manquants.',
          indicators: [9, 11, 12, 21],
          source: 'Statuts des preuves, dates de validité, dossiers de session',
          data: 'calcule',
        },
      },
      {
        id: 'communications',
        title: 'Communications',
        icon: Mail,
        path: '/communications',
      },
    ],
  },
  {
    id: 'commercial',
    title: 'Clients & financement',
    icon: Briefcase,
    items: [
      {
        id: 'entreprises',
        title: 'Entreprises clientes',
        icon: Building2,
        path: '/commercial/entreprises',
        spec: {
          description: 'Entreprises clientes, contacts, salariés inscrits et historique des sessions.',
          source: 'formation.company',
          data: 'existant',
        },
      },
      {
        id: 'financeurs',
        title: 'Financeurs',
        icon: HandCoins,
        path: '/commercial/financeurs',
        spec: {
          description:
            'OPCO, CPF, France Travail, Région, entreprises : prises en charge, accords, montants, pièces demandées.',
          source: 'Aujourd’hui un simple texte (enrollment.funding) : tables financeurs et prises en charge à créer',
          data: 'a-creer',
        },
      },
      {
        id: 'conventions',
        title: 'Conventions & contrats',
        icon: FileSignature,
        path: '/commercial/conventions',
        spec: {
          description: 'Conventions et contrats de formation : envoi, signature, relances.',
          indicators: [9],
          source: 'formation.agreement',
          data: 'existant',
        },
      },
    ],
  },
  {
    id: 'formation',
    title: 'Offre de formation',
    icon: GraduationCap,
    items: [
      {
        id: 'programmes',
        title: 'Programmes',
        icon: BookOpen,
        path: '/formation/programmes',
        spec: {
          description:
            'Fiches formation : objectifs, prérequis, contenus, modalités, délais d’accès, accessibilité, tarifs, adéquation à la certification.',
          indicators: [1, 5, 6, 7],
          source: 'formation.program',
          data: 'existant',
        },
      },
      {
        id: 'sessions',
        title: 'Sessions',
        icon: CalendarDays,
        path: '/formation/sessions',
        new: { tooltip: 'Nouvelle session', path: '/formation/sessions?nouveau=1' },
      },
      {
        id: 'resultats',
        title: 'Résultats & taux',
        icon: TrendingUp,
        path: '/formation/resultats',
        spec: {
          description:
            'Taux de satisfaction, de réussite, d’obtention de la certification, d’abandon et débouchés, par formation.',
          indicators: [2, 3],
          source: 'Calcul à partir des évaluations, attestations, enquêtes et abandons',
          data: 'calcule',
        },
      },
      {
        id: 'ressources',
        title: 'Ressources pédagogiques',
        icon: Library,
        path: '/formation/ressources',
        spec: {
          description: 'Supports, plateformes et ressources mis à disposition des apprenants.',
          indicators: [19],
          source: 'Table des ressources pédagogiques à créer',
          data: 'a-creer',
        },
      },
      {
        id: 'moyens',
        title: 'Locaux & moyens techniques',
        icon: Warehouse,
        path: '/formation/moyens',
        spec: {
          description: 'Salles, équipements (bac à feu, extincteurs, mannequins…) et affectation aux sessions.',
          indicators: [17],
          source: 'Table des moyens techniques à créer',
          data: 'a-creer',
        },
      },
    ],
  },
  {
    id: 'parcours',
    title: 'Parcours apprenant',
    icon: School,
    items: [
      {
        id: 'apprenants',
        title: 'Apprenants',
        icon: Users,
        path: '/apprenants',
        spec: {
          description: 'Fiche apprenant : coordonnées, entreprise, parcours, documents, historique.',
          source: 'formation.learner',
          data: 'existant',
        },
      },
      {
        id: 'inscriptions',
        title: 'Inscriptions',
        icon: ClipboardList,
        path: '/apprenants/inscriptions',
        spec: {
          description: 'Inscriptions aux sessions : statut, financement, avancement du dossier.',
          indicators: [12],
          source: 'formation.enrollment',
          data: 'existant',
        },
      },
      {
        id: 'analyses-besoin',
        title: 'Analyses du besoin',
        icon: ScanSearch,
        path: '/apprenants/analyses-besoin',
        spec: {
          description: 'Recueil du besoin de chaque bénéficiaire et adaptations décidées.',
          indicators: [4, 10],
          source: 'formation.needs_analysis',
          data: 'existant',
        },
      },
      {
        id: 'positionnements',
        title: 'Positionnements',
        icon: Crosshair,
        path: '/apprenants/positionnements',
        spec: {
          description: 'Positionnement et évaluation des acquis à l’entrée, vérification des prérequis.',
          indicators: [8],
          source: 'formation.positioning',
          data: 'existant',
        },
      },
      {
        id: 'convocations',
        title: 'Convocations',
        icon: Mail,
        path: '/apprenants/convocations',
        spec: {
          description: 'Convocations et informations sur les conditions de déroulement.',
          indicators: [9],
          source: 'formation.convocation',
          data: 'existant',
        },
      },
      {
        id: 'emargements',
        title: 'Émargements',
        icon: CalendarCheck,
        path: '/apprenants/emargements',
        spec: {
          description: 'Feuilles d’émargement par demi-journée, signatures, absences.',
          indicators: [12],
          source: 'formation.attendance_slot, formation.attendance_signature',
          data: 'existant',
        },
      },
      {
        id: 'evaluations-acquis',
        title: 'Évaluations des acquis',
        icon: ClipboardCheck,
        path: '/apprenants/evaluations',
        spec: {
          description: 'Évaluations formatives, sommatives et examens.',
          indicators: [11],
          source: 'formation.assessment',
          data: 'existant',
        },
      },
      {
        id: 'certification',
        title: 'Présentation à la certification',
        icon: Award,
        path: '/apprenants/certification',
        spec: {
          description: 'Présentation des apprenants aux épreuves de certification et résultats.',
          indicators: [16, 3],
          source: 'formation.assessment (examens)',
          data: 'existant',
        },
      },
      {
        id: 'attestations',
        title: 'Attestations & certificats',
        icon: BadgeCheck,
        path: '/apprenants/attestations',
        spec: {
          description: 'Attestations de fin de formation et certificats délivrés.',
          indicators: [11],
          source: 'formation.certificate',
          data: 'existant',
        },
      },
      {
        id: 'abandons',
        title: 'Abandons & ruptures',
        icon: UserX,
        path: '/apprenants/abandons',
        spec: {
          description: 'Suivi des abandons : motifs, prévention, relances.',
          indicators: [12],
          source: 'formation.enrollment (statut ABANDON)',
          data: 'existant',
        },
      },
    ],
  },
  {
    id: 'rh',
    title: 'Ressources humaines',
    icon: Presentation,
    items: [
      {
        id: 'formateurs',
        title: 'Formateurs',
        icon: Presentation,
        path: '/rh/formateurs',
        spec: {
          description: 'Formateurs internes et externes : spécialités, sessions animées, dossier.',
          indicators: [21],
          source: 'formation.trainer',
          data: 'existant',
        },
      },
      {
        id: 'qualifications',
        title: 'Qualifications & habilitations',
        icon: ShieldCheck,
        path: '/rh/qualifications',
        spec: {
          description: 'Diplômes, cartes professionnelles, habilitations (SSIAP, SST, CNAPS…) et validités.',
          indicators: [21],
          source: 'formation.trainer_qualification',
          data: 'existant',
        },
      },
      {
        id: 'developpement',
        title: 'Développement des compétences',
        icon: Sprout,
        path: '/rh/developpement',
        spec: {
          description: 'Plan de développement des compétences des salariés et formateurs.',
          indicators: [22],
          source: 'formation.staff_development_action',
          data: 'existant',
        },
      },
      {
        id: 'coordination',
        title: 'Coordination des intervenants',
        icon: Network,
        path: '/rh/coordination',
        spec: {
          description: 'Réunions pédagogiques, comptes rendus, coordination des intervenants.',
          indicators: [18],
          source: 'Table des réunions / comptes rendus à créer',
          data: 'a-creer',
        },
      },
      {
        id: 'sous-traitants',
        title: 'Sous-traitants',
        icon: Handshake,
        path: '/rh/sous-traitants',
        spec: {
          description: 'Sous-traitants et portage salarial : contrats, Qualiopi, revues annuelles.',
          indicators: [27],
          source: 'formation.subcontractor',
          data: 'existant',
        },
      },
    ],
  },
  {
    id: 'qualite',
    title: 'Qualité & amélioration',
    icon: Smile,
    items: [
      {
        id: 'satisfaction',
        title: 'Satisfaction',
        icon: Smile,
        path: '/qualite/satisfaction',
        spec: {
          description: 'Enquêtes de satisfaction (apprenants, entreprises, financeurs, formateurs).',
          indicators: [30],
          source: 'formation.satisfaction_survey',
          data: 'existant',
        },
      },
      {
        id: 'reclamations',
        title: 'Réclamations & aléas',
        icon: MessageSquareWarning,
        path: '/qualite/reclamations',
        spec: {
          description: 'Réclamations, difficultés et aléas : réception, réponse, résolution.',
          indicators: [31],
          source: 'formation.complaint',
          data: 'existant',
        },
      },
      {
        id: 'veille',
        title: 'Veille',
        icon: Radar,
        path: '/qualite/veille',
        spec: {
          description: 'Veille légale, métiers et pédagogique : sources et exploitation.',
          indicators: [23, 24, 25],
          source: 'formation.watch_item',
          data: 'existant',
        },
      },
      {
        id: 'handicap',
        title: 'Handicap & accessibilité',
        icon: Accessibility,
        path: '/qualite/handicap',
        spec: {
          description: 'Référent handicap et mobilité, adaptations réalisées, réseau handicap.',
          indicators: [20, 26],
          source: 'formation.organization, formation.partner (HANDICAP)',
          data: 'existant',
        },
      },
      {
        id: 'partenaires',
        title: 'Partenaires socio-économiques',
        icon: Network,
        path: '/qualite/partenaires',
        spec: {
          description: 'Partenaires socio-économiques et réseaux professionnels.',
          indicators: [28],
          source: 'formation.partner (SOCIO_ECONOMIQUE)',
          data: 'existant',
        },
      },
      {
        id: 'documents',
        title: 'Documents & procédures',
        icon: FolderOpen,
        path: '/qualite/documents',
        spec: {
          description: 'Procédures, modèles, documents émis et signés, versions.',
          source: 'formation.document',
          data: 'existant',
        },
      },
    ],
  },
  {
    id: 'qualiopi',
    title: 'Qualiopi',
    icon: ShieldCheck,
    items: [
      {
        id: 'indicateurs',
        title: 'Indicateurs',
        icon: ListChecks,
        path: '/qualiopi/referentiel',
      },
      {
        id: 'carnet',
        title: 'Carnet d’audit',
        icon: BookOpenCheck,
        path: '/qualiopi/carnet',
      },
      {
        id: 'preuves',
        title: 'Preuves',
        icon: FileCheck2,
        path: '/qualiopi/preuves',
        spec: {
          description: 'Preuves détectées, documentées, validées ou rejetées ; rattachement aux indicateurs.',
          source: 'qualite.evidence, evidence_indicator_link, evidence_validation',
          data: 'existant',
        },
      },
      {
        id: 'evaluations',
        title: 'Évaluations',
        icon: ClipboardCheck,
        path: '/qualiopi/evaluations',
        spec: {
          description: 'Contrôles automatisés, résultats par indicateur et par session, constats.',
          source: 'qualite.evaluation_run, control_result, finding',
          data: 'existant',
        },
      },
      {
        id: 'audits',
        title: 'Audits',
        icon: ScanSearch,
        path: '/qualiopi/audits',
        spec: {
          description: 'Audits blancs et réels figés et comparables, dossier d’audit.',
          source: 'qualite.audit, audit_item',
          data: 'existant',
        },
      },
      {
        id: 'capa',
        title: 'Actions correctives',
        icon: Wrench,
        path: '/qualiopi/capa',
        spec: {
          description: 'Actions correctives et d’amélioration, vérification d’efficacité.',
          indicators: [32],
          source: 'qualite.capa_action, capa_event',
          data: 'existant',
        },
      },
    ],
  },
  {
    id: 'administration',
    title: 'Administration',
    icon: Landmark,
    items: [
      {
        id: 'organisme',
        title: 'Organisme',
        icon: Landmark,
        path: '/administration/organisme',
        spec: {
          description: 'NDA, SIRET, catégories d’actions, nouvel entrant, référents handicap et mobilité.',
          indicators: [20],
          source: 'formation.organization',
          data: 'existant',
        },
      },
      {
        id: 'utilisateurs',
        title: 'Utilisateurs & rôles',
        icon: UserRound,
        path: '/administration/utilisateurs',
        spec: {
          description: 'Comptes, rôles et permissions (admin, qualité, gestion, lecture seule).',
          source: 'iam.user',
          data: 'existant',
        },
      },
      {
        id: 'referentiels',
        title: 'Référentiels',
        icon: BookOpen,
        path: '/administration/referentiels',
        spec: {
          description: 'Versions du référentiel Qualiopi, empreintes, activation.',
          source: 'qualite.referential_version',
          data: 'existant',
        },
      },
      {
        id: 'parametres',
        title: 'Paramètres',
        icon: Settings,
        path: '/administration/parametres',
      },
      {
        id: 'journal',
        title: 'Journal d’activité',
        icon: History,
        path: '/administration/journal',
        spec: {
          description: 'Traçabilité des événements métier (qui a fait quoi, quand).',
          source: 'outbox_event',
          data: 'existant',
        },
      },
    ],
  },
];

// Pages accessibles hors de la sidebar (menu utilisateur).
export const ACCOUNT_PAGES: NavItem[] = [
  {
    id: 'profil',
    title: 'Mon profil',
    icon: UserRound,
    path: '/compte/profil',
    spec: { description: 'Nom, email, rôle.', source: 'iam.user', data: 'existant' },
  },
  {
    id: 'securite',
    title: 'Sécurité',
    icon: ShieldCheck,
    path: '/compte/securite',
    spec: {
      description: 'Changement de mot de passe.',
      source: 'iam.user (point d’API à créer)',
      data: 'a-creer',
    },
  },
];

// Entrée de menu correspondant exactement à pathname.
export function findNavItem(pathname: string) {
  for (const section of MAIN_NAV) {
    const item = section.items.find((entry) => entry.path === pathname);
    if (item) return { section, item };
  }
  const item = ACCOUNT_PAGES.find((entry) => entry.path === pathname);
  return item ? { section: undefined, item } : undefined;
}
