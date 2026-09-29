'use client';

import { Award, BookOpen } from 'lucide-react';
import type { Row } from '@/lib/resource';
import { Badge } from '@/components/ui/badge';
import { boolCol, col, countCol, dateCol, titleCol } from '@/components/resource/columns';
import { ResourcePage } from '@/components/resource/resource-page';
import type { ResourceConfig } from '@/components/resource/types';

interface Program extends Row {
  code: string;
  title: string;
  is_certifying: boolean;
  rncp_code: string | null;
  duration_hours: number | null;
  price_eur: number | null;
  public_info_reviewed_on: string | null;
  sessions: number;
}

const yearAgo = () => new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);

const config: ResourceConfig<Program> = {
  path: 'programs',
  title: 'Programmes',
  icon: BookOpen,
  newLabel: 'Nouveau programme',
  labels: { one: 'Le programme', created: 'créé', updated: 'modifié', deleted: 'supprimé' },
  permission: 'write_training',
  defaultSort: { id: 'title', desc: false },
  search: (r) => [r.code, r.title, r.rncp_code].join(' '),
  facets: [
    {
      id: 'certifying',
      title: 'Certifiante',
      icon: Award,
      value: (r) => (r.is_certifying ? 'OUI' : 'NON'),
      options: [
        { value: 'OUI', label: 'Certifiante' },
        { value: 'NON', label: 'Non certifiante' },
      ],
    },
  ],
  columns: [
    col('code', 'Code', {
      first: true,
      size: 120,
      cell: (r) => <Badge variant="outline">{r.code}</Badge>,
    }),
    titleCol('title', 'Intitulé', undefined, 320),
    boolCol('is_certifying', 'Certifiante'),
    col('rncp_code', 'RNCP / RS', { size: 120 }),
    col('duration_hours', 'Durée', { size: 90, cell: (r) => (r.duration_hours ? `${r.duration_hours} h` : '—') }),
    col('price_eur', 'Tarif', {
      size: 110,
      cell: (r) => (r.price_eur != null ? `${r.price_eur.toLocaleString('fr-FR')} €` : '—'),
    }),
    dateCol('public_info_reviewed_on', 'Fiche relue le', {
      late: (r) => !r.public_info_reviewed_on || r.public_info_reviewed_on < yearAgo(),
    }),
    countCol('sessions', 'Sessions'),
  ],
  fields: [
    { name: 'code', label: 'Code', type: 'text', required: true, span: 1, placeholder: 'Ex. SST' },
    { name: 'rncp_code', label: 'Code RNCP / RS', type: 'text', span: 1 },
    { name: 'title', label: 'Intitulé', type: 'text', required: true },
    { name: 'duration_hours', label: 'Durée (heures)', type: 'number', span: 1 },
    { name: 'price_eur', label: 'Tarif (€ HT)', type: 'number', span: 1 },
    { name: 'is_certifying', label: 'Formation certifiante', type: 'boolean' },
    { name: 'objectives', label: 'Objectifs opérationnels', type: 'tags', help: 'Séparés par des virgules (indicateur 5).' },
    { name: 'prerequisites', label: 'Prérequis', type: 'tags' },
    { name: 'content', label: 'Contenu', type: 'textarea' },
    { name: 'teaching_methods', label: 'Modalités pédagogiques', type: 'textarea' },
    { name: 'evaluation_methods', label: "Modalités d'évaluation", type: 'textarea' },
    { name: 'access_delay', label: "Délai d'accès", type: 'text', span: 1 },
    { name: 'public_info_reviewed_on', label: 'Fiche relue le', type: 'date', span: 1 },
    { name: 'accessibility_info', label: 'Accessibilité (handicap)', type: 'textarea' },
    { name: 'certification_alignment', label: 'Adéquation à la certification', type: 'textarea', help: 'Indicateur 7, formations certifiantes.' },
  ],
  deleteMessage: (r) =>
    r.sessions
      ? `Supprimer « ${r.title} » ? Ses ${r.sessions} session(s) et tous leurs dossiers seront supprimés.`
      : `Supprimer « ${r.title} » ?`,
};

export default function ProgrammesPage() {
  return <ResourcePage config={config} />;
}
