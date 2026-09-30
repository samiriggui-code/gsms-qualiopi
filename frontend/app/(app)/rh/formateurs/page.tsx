'use client';

import { Presentation, UserCog } from 'lucide-react';
import type { Row } from '@/lib/resource';
import { Badge } from '@/components/ui/badge';
import { col, countCol, titleCol } from '@/components/resource/columns';
import { ResourcePage } from '@/components/resource/resource-page';
import type { ResourceConfig } from '@/components/resource/types';

interface Trainer extends Row {
  first_name: string;
  last_name: string;
  full_name: string;
  email: string | null;
  is_external: boolean;
  specialties: string[];
  sessions: number;
  qualifications: number;
}

const config: ResourceConfig<Trainer> = {
  path: 'trainers',
  title: 'Formateurs',
  icon: Presentation,
  newLabel: 'Nouveau formateur',
  labels: { one: 'Le formateur', created: 'créé', updated: 'modifié', deleted: 'supprimé' },
  permission: 'write_trainers',
  defaultSort: { id: 'last_name', desc: false },
  search: (r) => [r.full_name, r.email, ...(r.specialties ?? [])].join(' '),
  facets: [
    {
      id: 'status',
      title: 'Statut',
      icon: UserCog,
      value: (r) => (r.is_external ? 'EXTERNE' : 'INTERNE'),
      options: [
        { value: 'INTERNE', label: 'Interne' },
        { value: 'EXTERNE', label: 'Externe' },
      ],
    },
  ],
  columns: [
    titleCol('last_name', 'Nom', (r) => `${r.last_name} ${r.first_name}`),
    col('email', 'Email', { size: 240 }),
    col('status', 'Statut', {
      size: 110,
      cell: (r) => <Badge variant="outline">{r.is_external ? 'Externe' : 'Interne'}</Badge>,
    }),
    col('specialties', 'Spécialités', {
      size: 260,
      value: (r) => r.specialties?.join(', '),
      cell: (r) => (
        <div className="flex gap-1.5 truncate overflow-hidden">
          {r.specialties?.map((s) => (
            <Badge key={s} variant="secondary" className="shrink-0">
              {s}
            </Badge>
          ))}
        </div>
      ),
    }),
    countCol('sessions', 'Sessions'),
    countCol('qualifications', 'Qualifications'),
  ],
  fields: [
    { name: 'first_name', label: 'Prénom', type: 'text', required: true, span: 1 },
    { name: 'last_name', label: 'Nom', type: 'text', required: true, span: 1 },
    { name: 'email', label: 'Email', type: 'email' },
    { name: 'specialties', label: 'Spécialités', type: 'tags', placeholder: 'SSIAP, SST, Évacuation…' },
    { name: 'is_external', label: 'Formateur externe (vacataire, sous-traitant)', type: 'boolean' },
  ],
  deleteMessage: (r) =>
    `Supprimer ${r.full_name} ? Ses qualifications seront supprimées et ses ${r.sessions} session(s) repasseront « à affecter ».`,
};

export default function FormateursPage() {
  return <ResourcePage config={config} />;
}
