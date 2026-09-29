'use client';

import { CircleDot, Radar, Tag } from 'lucide-react';
import type { Row } from '@/lib/resource';
import { Badge } from '@/components/ui/badge';
import { badgeCol, col, dateCol, TONE, titleCol } from '@/components/resource/columns';
import { ResourcePage } from '@/components/resource/resource-page';
import type { ResourceConfig } from '@/components/resource/types';

interface WatchItem extends Row {
  domain: string;
  title: string;
  source: string | null;
  noted_on: string | null;
  exploitation: string | null;
  exploited_on: string | null;
}

const DOMAINS = [
  { value: 'LEGALE', label: 'Légale & réglementaire (I23)', color: TONE.blue },
  { value: 'METIERS', label: 'Emplois & métiers (I24)', color: TONE.green },
  { value: 'PEDAGOGIQUE', label: 'Innovations pédagogiques (I25)', color: TONE.violet },
];

const exploited = (r: WatchItem) => (r.exploited_on ? 'EXPLOITEE' : 'A_EXPLOITER');

const config: ResourceConfig<WatchItem> = {
  path: 'watch-items',
  title: 'Veille',
  icon: Radar,
  newLabel: 'Nouvelle veille',
  labels: { one: 'La veille', created: 'ajoutée', updated: 'modifiée', deleted: 'supprimée' },
  permission: 'write_quality',
  defaultSort: { id: 'noted_on', desc: true },
  search: (r) => [r.title, r.source, r.exploitation].join(' '),
  facets: [
    { id: 'domain', title: 'Domaine', icon: Tag, value: (r) => r.domain, options: DOMAINS },
    {
      id: 'exploited',
      title: 'Exploitation',
      icon: CircleDot,
      value: exploited,
      options: [
        { value: 'EXPLOITEE', label: 'Exploitée' },
        { value: 'A_EXPLOITER', label: 'À exploiter' },
      ],
    },
  ],
  columns: [
    titleCol('title', 'Sujet', undefined, 320),
    badgeCol('domain', 'Domaine', DOMAINS),
    col('source', 'Source', { size: 200 }),
    dateCol('noted_on', 'Relevée le'),
    col('exploited', 'Exploitation', {
      size: 150,
      value: exploited,
      cell: (r) =>
        r.exploited_on ? (
          <Badge variant="success" appearance="light">Exploitée</Badge>
        ) : (
          <Badge variant="warning" appearance="light">À exploiter</Badge>
        ),
    }),
  ],
  fields: [
    { name: 'title', label: 'Sujet', type: 'text', required: true },
    { name: 'domain', label: 'Domaine', type: 'select', required: true, options: DOMAINS, defaultValue: 'LEGALE' },
    { name: 'source', label: 'Source', type: 'text', placeholder: 'Légifrance, Centre Inffo, OPCO…' },
    { name: 'noted_on', label: 'Relevée le', type: 'date', span: 1 },
    { name: 'exploited_on', label: 'Exploitée le', type: 'date', span: 1 },
    { name: 'exploitation', label: 'Exploitation (impact et actions menées)', type: 'textarea' },
  ],
};

export default function VeillePage() {
  return <ResourcePage config={config} />;
}
