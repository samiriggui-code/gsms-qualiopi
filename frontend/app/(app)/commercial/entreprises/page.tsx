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
  code: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  phone: string | null;
  contact_role: string | null;
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
  search: (r) =>
    [r.name, r.code, r.siret, r.city, r.contact_name, r.contact_email].join(
      ' ',
    ),
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
      label: 'Prêtes pour un devis',
      value: rows.filter((r) => r.code && r.address && r.postal_code && r.city)
        .length,
      subtitle: 'code client et adresse renseignés',
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
      { label: 'Code client', value: r.code },
      { label: 'Ville', value: r.city },
      { label: 'SIRET', value: r.siret },
      { label: 'Email du contact', value: r.contact_email },
      { label: 'Apprenants', value: r.learners },
      { label: 'Inscriptions', value: r.enrollments },
    ],
  }),
  columns: [
    titleCol('name', 'Entreprise'),
    col('code', 'Code client', { size: 120 }),
    col('city', 'Ville', { size: 140 }),
    col('siret', 'SIRET', { size: 160 }),
    col('contact_name', 'Contact'),
    col('contact_email', 'Email du contact', { size: 220 }),
    countCol('learners', 'Apprenants'),
    countCol('enrollments', 'Inscriptions'),
  ],
  fields: [
    { name: 'name', label: 'Raison sociale', type: 'text', required: true },
    {
      name: 'code',
      label: 'Code client',
      type: 'text',
      span: 1,
      placeholder: 'SECU69',
      help: '2 à 12 lettres ou chiffres. Les devis du client sont numérotés avec ce code (DEV-SECU69-001).',
    },
    { name: 'siret', label: 'SIRET', type: 'text', span: 1 },
    { name: 'address', label: 'Adresse', type: 'text' },
    { name: 'postal_code', label: 'Code postal', type: 'text', span: 1 },
    { name: 'city', label: 'Ville', type: 'text', span: 1 },
    { name: 'phone', label: 'Téléphone', type: 'tel', span: 1 },
    { name: 'contact_name', label: 'Contact', type: 'text', span: 1 },
    {
      name: 'contact_role',
      label: 'Fonction du contact',
      type: 'text',
      span: 1,
    },
    {
      name: 'contact_email',
      label: 'Email du contact',
      type: 'email',
      span: 1,
    },
  ],
  deleteMessage: (r) =>
    `Supprimer « ${r.name} » ? Ses ${r.learners} apprenant(s) et ${r.enrollments} inscription(s) seront conservés mais détachés de l'entreprise.`,
};

export default function EntreprisesPage() {
  return <ResourcePage config={config} />;
}
