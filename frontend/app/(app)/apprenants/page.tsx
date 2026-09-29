'use client';

import { Building2, Users } from 'lucide-react';
import type { Row } from '@/lib/resource';
import { col, countCol, titleCol } from '@/components/resource/columns';
import { ResourcePage } from '@/components/resource/resource-page';
import type { ResourceConfig } from '@/components/resource/types';

interface Learner extends Row {
  first_name: string;
  last_name: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  company_id: string | null;
  company_name: string | null;
  enrollments: number;
}

const config: ResourceConfig<Learner> = {
  path: 'learners',
  title: 'Apprenants',
  icon: Users,
  newLabel: 'Nouvel apprenant',
  labels: { one: "L'apprenant", created: 'créé', updated: 'modifié', deleted: 'supprimé' },
  permission: 'write_training',
  defaultSort: { id: 'last_name', desc: false },
  search: (r) => [r.full_name, r.email, r.phone, r.company_name].join(' '),
  facets: [{ id: 'company', title: 'Entreprise', icon: Building2, value: (r) => r.company_name ?? 'Particulier' }],
  columns: [
    titleCol('last_name', 'Nom', (r) => `${r.last_name} ${r.first_name}`),
    col('email', 'Email', { size: 240 }),
    col('phone', 'Téléphone', { size: 150 }),
    col('company', 'Entreprise', { value: (r) => r.company_name, size: 220 }),
    countCol('enrollments', 'Inscriptions'),
  ],
  fields: [
    { name: 'first_name', label: 'Prénom', type: 'text', required: true, span: 1 },
    { name: 'last_name', label: 'Nom', type: 'text', required: true, span: 1 },
    { name: 'email', label: 'Email', type: 'email', span: 1 },
    { name: 'phone', label: 'Téléphone', type: 'tel', span: 1 },
    {
      name: 'company_id',
      label: 'Entreprise',
      type: 'select',
      placeholder: 'Particulier',
      optionsFrom: { path: 'companies', label: (c) => String(c.name) },
    },
  ],
  deleteMessage: (r) =>
    r.enrollments
      ? `Supprimer ${r.full_name} ? Ses ${r.enrollments} inscription(s) et tout leur dossier (émargements, évaluations, attestations) seront supprimés.`
      : `Supprimer ${r.full_name} ?`,
};

export default function ApprenantsPage() {
  return <ResourcePage config={config} />;
}
