import type { ColumnDef } from '@tanstack/react-table';
import type { LucideIcon } from 'lucide-react';
import type { Permission } from '@/lib/permissions';
import type { ResourceLabels, Row } from '@/lib/resource';

export interface Option {
  value: string;
  label: string;
}

// Champ de formulaire généré par ResourceFormSheet.
export interface FieldDef {
  name: string;
  label: string;
  type: 'text' | 'email' | 'tel' | 'textarea' | 'date' | 'number' | 'boolean' | 'select' | 'tags';
  required?: boolean;
  placeholder?: string;
  help?: string;
  // Largeur sur une grille de 2 colonnes
  span?: 1 | 2;
  // select : options fixes…
  options?: Option[];
  // …ou chargées depuis une autre ressource
  optionsFrom?: { path: string; label: (row: Row) => string };
  // Valeur par défaut à la création
  defaultValue?: string | boolean;
}

export interface FacetDef<T> {
  id: string;
  title: string;
  icon: LucideIcon;
  value: (row: T) => string | null | undefined;
  // Libellés des valeurs ; sinon la valeur brute est affichée
  options?: Option[];
}

export interface ResourceConfig<T extends Row> {
  path: string;
  title: string;
  icon: LucideIcon;
  newLabel: string;
  labels: ResourceLabels;
  permission: Permission;
  columns: ColumnDef<T>[];
  fields: FieldDef[];
  search: (row: T) => string;
  facets?: FacetDef<T>[];
  // Onglets comptés au-dessus du tableau (motif store-inventory/order-list de la démo)
  tabs?: { id: string; label: string; test: (row: T) => boolean }[];
  // Lien vers la fiche détail (sinon la ligne ouvre le formulaire de modification)
  detailHref?: (row: T) => string;
  // Phrase de confirmation de suppression
  deleteMessage?: (row: T) => string;
  defaultSort?: { id: string; desc: boolean };
}
