import { type LucideIcon } from 'lucide-react';

// Fiche de cadrage d'une page : ce qu'elle gère, ce qu'elle apporte au moteur Qualiopi,
// d'où viennent ses données. Affichée tant que l'écran n'est pas construit.
export interface PageSpec {
  description: string;
  // Indicateurs Qualiopi alimentés (numéros du référentiel V9)
  indicators?: number[];
  // Tables ou calcul à l'origine des données
  source: string;
  // existant : tables backend prêtes · a-creer : modèle à ajouter · calcule : agrégat, pas de saisie
  data: 'existant' | 'a-creer' | 'calcule';
}

export interface NavItem {
  id: string;
  title: string;
  icon?: LucideIcon;
  path: string;
  badge?: string;
  // Raccourci « + » affiché au survol de l'entrée
  new?: {
    tooltip: string;
    path: string;
  };
  spec?: PageSpec;
}

// Section de la sidebar. Sans titre : entrées affichées à plat en tête de menu.
// Avec titre : groupe repliable (même rendu que la section Favoris du CRM Metronic).
export interface NavSection {
  id: string;
  title?: string;
  icon?: LucideIcon;
  items: NavItem[];
}

export type NavConfig = NavSection[];
