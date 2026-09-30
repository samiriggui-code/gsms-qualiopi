'use client';

import { CircleDot, Sprout } from 'lucide-react';
import type { Row } from '@/lib/resource';
import { Badge } from '@/components/ui/badge';
import { col, dateCol, titleCol } from '@/components/resource/columns';
import { ResourcePage } from '@/components/resource/resource-page';
import type { ResourceConfig } from '@/components/resource/types';

interface Action extends Row {
  trainer_id: string | null;
  trainer_name: string | null;
  label: string;
  planned_on: string | null;
  completed_on: string | null;
}

const state = (r: Action) => (r.completed_on ? 'REALISEE' : 'PREVUE');

const config: ResourceConfig<Action> = {
  path: 'staff-development',
  title: 'Développement des compétences',
  icon: Sprout,
  newLabel: 'Nouvelle action',
  labels: { one: "L'action", created: 'ajoutée', updated: 'modifiée', deleted: 'supprimée' },
  permission: 'write_trainers',
  defaultSort: { id: 'planned_on', desc: true },
  search: (r) => [r.label, r.trainer_name].join(' '),
  facets: [
    {
      id: 'state',
      title: 'État',
      icon: CircleDot,
      value: state,
      options: [
        { value: 'PREVUE', label: 'Prévue' },
        { value: 'REALISEE', label: 'Réalisée' },
      ],
    },
  ],
  columns: [
    titleCol('label', 'Action', undefined, 320),
    col('trainer', 'Bénéficiaire', { value: (r) => r.trainer_name ?? 'Équipe', size: 200 }),
    dateCol('planned_on', 'Prévue le'),
    dateCol('completed_on', 'Réalisée le'),
    col('state', 'État', {
      size: 120,
      value: state,
      cell: (r) =>
        r.completed_on ? (
          <Badge variant="success" appearance="light">Réalisée</Badge>
        ) : (
          <Badge variant="outline">Prévue</Badge>
        ),
    }),
  ],
  fields: [
    { name: 'label', label: 'Action de formation / développement', type: 'text', required: true },
    {
      name: 'trainer_id',
      label: 'Bénéficiaire',
      type: 'select',
      placeholder: "Toute l'équipe",
      optionsFrom: { path: 'trainers', label: (t) => String(t.full_name) },
    },
    { name: 'planned_on', label: 'Prévue le', type: 'date', span: 1 },
    { name: 'completed_on', label: 'Réalisée le', type: 'date', span: 1 },
  ],
};

export default function DeveloppementPage() {
  return <ResourcePage config={config} />;
}
