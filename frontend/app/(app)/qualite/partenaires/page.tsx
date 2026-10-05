'use client';

import { Accessibility, Building2, Network, PhoneOff, Tag } from 'lucide-react';
import { formatDate } from '@/lib/format';
import type { Row } from '@/lib/resource';
import {
  badgeCol,
  dateCol,
  OptionBadge,
  titleCol,
  TONE,
} from '@/components/resource/columns';
import { initials } from '@/components/resource/record-card';
import { ResourcePage } from '@/components/resource/resource-page';
import type { ResourceConfig } from '@/components/resource/types';

interface Partner extends Row {
  kind: 'HANDICAP' | 'SOCIO_ECONOMIQUE';
  name: string;
  last_contact_on: string | null;
}

export const PARTNER_KINDS = [
  { value: 'SOCIO_ECONOMIQUE', label: 'Socio-économique', color: TONE.blue },
  { value: 'HANDICAP', label: 'Handicap', color: TONE.violet },
];

const config: ResourceConfig<Partner> = {
  path: 'partners',
  title: 'Partenaires',
  icon: Network,
  newLabel: 'Nouveau partenaire',
  labels: {
    one: 'Le partenaire',
    created: 'ajouté',
    updated: 'modifié',
    deleted: 'supprimé',
  },
  permission: 'write_quality',
  defaultSort: { id: 'name', desc: false },
  search: (r) => r.name,
  facets: [
    {
      id: 'kind',
      title: 'Type',
      icon: Tag,
      value: (r) => r.kind,
      options: PARTNER_KINDS,
    },
  ],
  eyebrow: 'Qualité & amélioration',
  description:
    'Le réseau de partenaires socio-économiques et handicap mobilisé pour les stagiaires.',
  kpis: (rows) => [
    {
      label: 'Partenaires',
      value: rows.length,
      subtitle: 'enregistrés',
      icon: Network,
    },
    {
      label: 'Socio-économiques',
      value: rows.filter((r) => r.kind === 'SOCIO_ECONOMIQUE').length,
      subtitle: 'emploi, entreprises, branches',
      icon: Building2,
    },
    {
      label: 'Handicap',
      value: rows.filter((r) => r.kind === 'HANDICAP').length,
      subtitle: 'accompagnement du handicap',
      icon: Accessibility,
    },
    {
      label: 'Sans contact',
      value: rows.filter((r) => !r.last_contact_on).length,
      subtitle: 'aucun contact daté',
      icon: PhoneOff,
    },
  ],
  defaultView: 'grid',
  card: (r) => ({
    title: r.name,
    monogram: initials(r.name),
    badges: <OptionBadge options={PARTNER_KINDS} value={r.kind} />,
    meta: [
      {
        label: 'Dernier contact',
        value: formatDate(r.last_contact_on) || null,
      },
    ],
  }),
  columns: [
    titleCol('name', 'Partenaire', undefined, 300),
    badgeCol('kind', 'Type', PARTNER_KINDS),
    dateCol('last_contact_on', 'Dernier contact'),
  ],
  fields: [
    { name: 'name', label: 'Nom', type: 'text', required: true },
    {
      name: 'kind',
      label: 'Type',
      type: 'select',
      required: true,
      options: PARTNER_KINDS,
      defaultValue: 'SOCIO_ECONOMIQUE',
      span: 1,
    },
    {
      name: 'last_contact_on',
      label: 'Dernier contact',
      type: 'date',
      span: 1,
    },
  ],
};

export default function PartenairesPage() {
  return <ResourcePage config={config} />;
}
