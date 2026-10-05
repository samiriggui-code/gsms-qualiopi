'use client';

import {
  Building2,
  ClipboardCheck,
  Contact,
  FileDigit,
  Users,
} from 'lucide-react';
import type { Row } from '@/lib/resource';
import { col, countCol, titleCol } from '@/components/resource/columns';
import { initials } from '@/components/resource/record-card';
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
  labels: {
    one: "L'entreprise",
    created: 'créée',
    updated: 'modifiée',
    deleted: 'supprimée',
  },
  permission: 'write_training',
  defaultSort: { id: 'name', desc: false },
  search: (r) => [r.name, r.siret, r.contact_name, r.contact_email].join(' '),
  eyebrow: 'Clients & financement',
  description:
    'Les entreprises qui envoient des stagiaires en formation, avec leur contact et leurs inscriptions.',
  kpis: (rows) => [
    {
      label: 'Entreprises',
      value: rows.length,
      subtitle: 'clientes enregistrées',
      icon: Building2,
    },
    {
      label: 'SIRET renseigné',
      value: rows.filter((r) => r.siret).length,
      subtitle: `sur ${rows.length}`,
      icon: FileDigit,
    },
    {
      label: 'Contact renseigné',
      value: rows.filter((r) => r.contact_email).length,
      subtitle: 'avec un email de contact',
      icon: Contact,
    },
    {
      label: 'Apprenants',
      value: rows.reduce((n, r) => n + r.learners, 0),
      subtitle: 'rattachés à ces entreprises',
      icon: Users,
    },
    {
      label: 'Inscriptions',
      value: rows.reduce((n, r) => n + r.enrollments, 0),
      subtitle: 'de leurs apprenants',
      icon: ClipboardCheck,
    },
  ],
  defaultView: 'grid',
  card: (r) => ({
    title: r.name,
    subtitle: r.contact_name
      ? `Contact : ${r.contact_name}`
      : 'Aucun contact renseigné',
    monogram: initials(r.name),
    meta: [
      { label: 'SIRET', value: r.siret },
      { label: 'Email du contact', value: r.contact_email },
      { label: 'Apprenants', value: r.learners },
      { label: 'Inscriptions', value: r.enrollments },
    ],
  }),
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
