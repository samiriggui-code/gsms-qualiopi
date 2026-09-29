'use client';

import { Building2 } from 'lucide-react';
import type { Row } from '@/lib/resource';
import { col, countCol, titleCol } from '@/components/resource/columns';
import { ResourcePage } from '@/components/resource/resource-page';
import type { ResourceConfig } from '@/components/resource/types';

interface Company extends Row {
  name: string;
  siret: string | null;
  contact_name: string | null;
  contact_email: string | null;
  learners: number;
  enrollments: number;
}

const config: ResourceConfig<Company> = {
  path: 'companies',
  title: 'Entreprises clientes',
  icon: Building2,
  newLabel: 'Nouvelle entreprise',
  labels: { one: "L'entreprise", created: 'créée', updated: 'modifiée', deleted: 'supprimée' },
  permission: 'write_training',
  defaultSort: { id: 'name', desc: false },
  search: (r) => [r.name, r.siret, r.contact_name, r.contact_email].join(' '),
  columns: [
    titleCol('name', 'Entreprise'),
    col('siret', 'SIRET', { size: 160 }),
    col('contact_name', 'Contact'),
    col('contact_email', 'Email du contact', { size: 220 }),
    countCol('learners', 'Apprenants'),
    countCol('enrollments', 'Inscriptions'),
  ],
  fields: [
    { name: 'name', label: 'Raison sociale', type: 'text', required: true },
    { name: 'siret', label: 'SIRET', type: 'text', span: 1 },
    { name: 'contact_name', label: 'Contact', type: 'text', span: 1 },
    { name: 'contact_email', label: 'Email du contact', type: 'email' },
  ],
  deleteMessage: (r) =>
    `Supprimer « ${r.name} » ? Ses ${r.learners} apprenant(s) et ${r.enrollments} inscription(s) seront conservés mais détachés de l'entreprise.`,
};

export default function EntreprisesPage() {
  return <ResourcePage config={config} />;
}
