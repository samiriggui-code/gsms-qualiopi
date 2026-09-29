'use client';

import { BadgeCheck, Handshake } from 'lucide-react';
import type { Row } from '@/lib/resource';
import { boolCol, col, dateCol, titleCol } from '@/components/resource/columns';
import { ResourcePage } from '@/components/resource/resource-page';
import type { ResourceConfig } from '@/components/resource/types';

interface Subcontractor extends Row {
  name: string;
  siret: string | null;
  qualiopi_certified: boolean;
  contract_signed_on: string | null;
  last_review_on: string | null;
}

const yearAgo = () => new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);

const config: ResourceConfig<Subcontractor> = {
  path: 'subcontractors',
  title: 'Sous-traitants',
  icon: Handshake,
  newLabel: 'Nouveau sous-traitant',
  labels: { one: 'Le sous-traitant', created: 'créé', updated: 'modifié', deleted: 'supprimé' },
  permission: 'write_quality',
  defaultSort: { id: 'name', desc: false },
  search: (r) => [r.name, r.siret].join(' '),
  facets: [
    {
      id: 'qualiopi',
      title: 'Qualiopi',
      icon: BadgeCheck,
      value: (r) => (r.qualiopi_certified ? 'OUI' : 'NON'),
      options: [
        { value: 'OUI', label: 'Certifié Qualiopi' },
        { value: 'NON', label: 'Non certifié' },
      ],
    },
  ],
  columns: [
    titleCol('name', 'Sous-traitant'),
    col('siret', 'SIRET', { size: 160 }),
    boolCol('qualiopi_certified', 'Qualiopi', 'Certifié', 'Non'),
    dateCol('contract_signed_on', 'Contrat signé le'),
    dateCol('last_review_on', 'Dernière revue', {
      late: (r) => !r.last_review_on || r.last_review_on < yearAgo(),
    }),
  ],
  fields: [
    { name: 'name', label: 'Raison sociale', type: 'text', required: true },
    { name: 'siret', label: 'SIRET', type: 'text' },
    { name: 'contract_signed_on', label: 'Contrat signé le', type: 'date', span: 1 },
    { name: 'last_review_on', label: 'Dernière revue', type: 'date', span: 1, help: 'Revue au moins annuelle (indicateur 27).' },
    { name: 'qualiopi_certified', label: 'Certifié Qualiopi', type: 'boolean' },
  ],
};

export default function SousTraitantsPage() {
  return <ResourcePage config={config} />;
}
