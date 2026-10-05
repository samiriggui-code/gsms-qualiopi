'use client';

import {
  BookOpen,
  Briefcase,
  CircleDot,
  Lightbulb,
  Radar,
  Scale,
  Tag,
} from 'lucide-react';
import { formatDate } from '@/lib/format';
import type { Row } from '@/lib/resource';
import { Badge } from '@/components/ui/badge';
import {
  badgeCol,
  col,
  dateCol,
  OptionBadge,
  titleCol,
  TONE,
} from '@/components/resource/columns';
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
  {
    value: 'PEDAGOGIQUE',
    label: 'Innovations pédagogiques (I25)',
    color: TONE.violet,
  },
];

const exploited = (r: WatchItem) =>
  r.exploited_on ? 'EXPLOITEE' : 'A_EXPLOITER';

const config: ResourceConfig<WatchItem> = {
  path: 'watch-items',
  title: 'Veille',
  icon: Radar,
  newLabel: 'Nouvelle veille',
  labels: {
    one: 'La veille',
    created: 'ajoutée',
    updated: 'modifiée',
    deleted: 'supprimée',
  },
  permission: 'write_quality',
  defaultSort: { id: 'noted_on', desc: true },
  search: (r) => [r.title, r.source, r.exploitation].join(' '),
  tabs: [
    { id: 'all', label: 'Toutes', test: () => true },
    { id: 'todo', label: 'À exploiter', test: (r) => !r.exploited_on },
    { id: 'done', label: 'Exploitées', test: (r) => !!r.exploited_on },
  ],
  facets: [
    {
      id: 'domain',
      title: 'Domaine',
      icon: Tag,
      value: (r) => r.domain,
      options: DOMAINS,
    },
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
  eyebrow: 'Qualité & amélioration',
  description:
    'Les informations relevées en veille légale, métiers et pédagogique, et ce qui en a été fait.',
  kpis: (rows) => [
    { label: 'Veilles', value: rows.length, subtitle: 'relevées', icon: Radar },
    {
      label: 'Légale',
      value: rows.filter((r) => r.domain === 'LEGALE').length,
      subtitle: 'réglementaire (I23)',
      icon: Scale,
    },
    {
      label: 'Métiers',
      value: rows.filter((r) => r.domain === 'METIERS').length,
      subtitle: 'emplois et métiers (I24)',
      icon: Briefcase,
    },
    {
      label: 'Pédagogique',
      value: rows.filter((r) => r.domain === 'PEDAGOGIQUE').length,
      subtitle: 'innovations (I25)',
      icon: Lightbulb,
    },
    {
      label: 'À exploiter',
      value: rows.filter((r) => !r.exploited_on).length,
      subtitle: 'sans exploitation datée',
      icon: BookOpen,
    },
  ],
  card: (r) => ({
    title: r.title,
    subtitle: r.source,
    badges: (
      <>
        <OptionBadge options={DOMAINS} value={r.domain} />
        {r.exploited_on ? (
          <Badge variant="success" appearance="light">
            Exploitée
          </Badge>
        ) : (
          <Badge variant="warning" appearance="light">
            À exploiter
          </Badge>
        )}
      </>
    ),
    meta: [
      { label: 'Relevée le', value: formatDate(r.noted_on) || null },
      { label: 'Exploitée le', value: formatDate(r.exploited_on) || null },
    ],
  }),
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
          <Badge variant="success" appearance="light">
            Exploitée
          </Badge>
        ) : (
          <Badge variant="warning" appearance="light">
            À exploiter
          </Badge>
        ),
    }),
  ],
  fields: [
    { name: 'title', label: 'Sujet', type: 'text', required: true },
    {
      name: 'domain',
      label: 'Domaine',
      type: 'select',
      required: true,
      options: DOMAINS,
      defaultValue: 'LEGALE',
    },
    {
      name: 'source',
      label: 'Source',
      type: 'text',
      placeholder: 'Légifrance, Centre Inffo, OPCO…',
    },
    { name: 'noted_on', label: 'Relevée le', type: 'date', span: 1 },
    { name: 'exploited_on', label: 'Exploitée le', type: 'date', span: 1 },
    {
      name: 'exploitation',
      label: 'Exploitation (impact et actions menées)',
      type: 'textarea',
    },
  ],
};

export default function VeillePage() {
  return <ResourcePage config={config} />;
}
