import {
  RESOURCE_KINDS,
  RESOURCE_ORIGINS,
  RESOURCE_RIGHTS,
  RESOURCE_STATUS,
} from '@/components/edof/labels';
import type { FieldDef } from '@/components/resource/types';

// Formulaire d'un contenu pédagogique : fiche formation et page Ressources pédagogiques.
export const RESOURCE_FIELDS: FieldDef[] = [
  { name: 'title', label: 'Titre', type: 'text', required: true },
  {
    name: 'kind',
    label: 'Type',
    type: 'select',
    options: RESOURCE_KINDS,
    span: 1,
    defaultValue: 'SUPPORT',
  },
  {
    name: 'module_code',
    label: 'Module (code)',
    type: 'text',
    span: 1,
    placeholder: 'UV1',
  },
  {
    name: 'origin',
    label: 'Origine',
    type: 'select',
    options: RESOURCE_ORIGINS,
    span: 1,
    defaultValue: 'INTERNE',
  },
  {
    name: 'rights',
    label: 'Droits de réutilisation',
    type: 'select',
    options: RESOURCE_RIGHTS,
    span: 1,
    defaultValue: 'A_VERIFIER',
  },
  {
    name: 'source_ref',
    label: 'Référence de la source',
    type: 'text',
    help: 'Éditeur, licence, identifiant du cours…',
  },
  {
    name: 'rights_note',
    label: 'Justification des droits',
    type: 'textarea',
    help: 'Contrat, licence, auteur : un contenu acheté n’accorde aucune habilitation.',
  },
  {
    name: 'status',
    label: 'État',
    type: 'select',
    options: RESOURCE_STATUS,
    span: 1,
    defaultValue: 'BROUILLON',
  },
  { name: 'note', label: 'Remarques', type: 'textarea' },
];
