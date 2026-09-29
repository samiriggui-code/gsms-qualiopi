import {
  BookOpen,
  Building2,
  CalendarDays,
  ClipboardCheck,
  FileCheck2,
  GraduationCap,
  Home,
  Landmark,
  ListChecks,
  Presentation,
  Settings,
  ShieldCheck,
  SearchCheck,
  UserRound,
  Users,
  Wrench,
} from 'lucide-react';
import { type NavConfig, type NavItem } from './types';

export const MAIN_NAV: NavConfig = [
  {
    id: 'pilotage',
    items: [
      { id: 'dashboard', title: 'Tableau de bord', icon: Home, path: '/' },
    ],
  },
  {
    id: 'formation',
    title: 'Formation',
    icon: GraduationCap,
    items: [
      {
        id: 'sessions',
        title: 'Sessions',
        icon: CalendarDays,
        path: '/formation/sessions',
        new: { tooltip: 'Nouvelle session', path: '/formation/sessions?nouveau=1' },
      },
      {
        id: 'programmes',
        title: 'Programmes',
        icon: BookOpen,
        path: '/formation/programmes',
      },
      {
        id: 'apprenants',
        title: 'Apprenants',
        icon: Users,
        path: '/formation/apprenants',
        new: { tooltip: 'Nouvel apprenant', path: '/formation/apprenants' },
      },
      {
        id: 'entreprises',
        title: 'Entreprises',
        icon: Building2,
        path: '/formation/entreprises',
      },
      {
        id: 'formateurs',
        title: 'Formateurs',
        icon: Presentation,
        path: '/formation/formateurs',
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
        id: 'preuves',
        title: 'Preuves',
        icon: FileCheck2,
        path: '/qualiopi/preuves',
      },
      {
        id: 'evaluations',
        title: 'Évaluations',
        icon: ClipboardCheck,
        path: '/qualiopi/evaluations',
      },
      {
        id: 'audits',
        title: 'Audits',
        icon: SearchCheck,
        path: '/qualiopi/audits',
      },
      {
        id: 'capa',
        title: 'Actions correctives',
        icon: Wrench,
        path: '/qualiopi/capa',
      },
    ],
  },
  {
    id: 'administration',
    title: 'Administration',
    icon: Settings,
    items: [
      {
        id: 'organisme',
        title: 'Organisme',
        icon: Landmark,
        path: '/administration/organisme',
      },
      {
        id: 'utilisateurs',
        title: 'Utilisateurs',
        icon: UserRound,
        path: '/administration/utilisateurs',
      },
    ],
  },
];

// Pages accessibles hors de la sidebar (menu utilisateur).
export const ACCOUNT_PAGES: NavItem[] = [
  { id: 'profil', title: 'Mon profil', icon: UserRound, path: '/compte/profil' },
  { id: 'securite', title: 'Sécurité', icon: ShieldCheck, path: '/compte/securite' },
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
