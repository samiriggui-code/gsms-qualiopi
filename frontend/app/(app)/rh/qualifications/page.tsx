'use client';

import {
  BadgeCheck,
  CalendarClock,
  InfinityIcon,
  Presentation,
  ShieldCheck,
  ShieldX,
} from 'lucide-react';
import { formatDate } from '@/lib/format';
import type { Row } from '@/lib/resource';
import { Badge } from '@/components/ui/badge';
import { col, dateCol, titleCol } from '@/components/resource/columns';
import { ResourcePage } from '@/components/resource/resource-page';
import type { ResourceConfig } from '@/components/resource/types';

interface Qualification extends Row {
  trainer_id: string;
  trainer_name: string | null;
  label: string;
  obtained_on: string | null;
  valid_until: string | null;
}

const today = () => new Date().toISOString().slice(0, 10);
const in90days = () =>
  new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

function validity(r: Qualification) {
  if (!r.valid_until) return 'PERMANENTE';
  if (r.valid_until < today()) return 'EXPIREE';
  if (r.valid_until < in90days()) return 'A_RENOUVELER';
  return 'VALIDE';
}

const VALIDITY = {
  VALIDE: { label: 'Valide', variant: 'success' as const },
  A_RENOUVELER: { label: 'À renouveler', variant: 'warning' as const },
  EXPIREE: { label: 'Expirée', variant: 'destructive' as const },
  PERMANENTE: { label: 'Sans échéance', variant: 'secondary' as const },
};

const inDays = (n: number) =>
  new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

const config: ResourceConfig<Qualification> = {
  path: 'trainer-qualifications',
  title: 'Qualifications & habilitations',
  icon: ShieldCheck,
  newLabel: 'Nouvelle qualification',
  labels: {
    one: 'La qualification',
    created: 'ajoutée',
    updated: 'modifiée',
    deleted: 'supprimée',
  },
  permission: 'write_trainers',
  defaultSort: { id: 'valid_until', desc: false },
  search: (r) => [r.label, r.trainer_name].join(' '),
  tabs: [
    { id: 'all', label: 'Toutes', test: () => true },
    {
      id: 'valid',
      label: 'Valides',
      test: (r) => !r.valid_until || r.valid_until >= inDays(60),
    },
    {
      id: 'soon',
      label: 'À renouveler sous 60 jours',
      test: (r) =>
        !!r.valid_until &&
        r.valid_until >= inDays(0) &&
        r.valid_until < inDays(60),
    },
    {
      id: 'expired',
      label: 'Expirées',
      test: (r) => !!r.valid_until && r.valid_until < inDays(0),
    },
  ],
  facets: [
    {
      id: 'trainer',
      title: 'Formateur',
      icon: Presentation,
      value: (r) => r.trainer_name,
    },
    {
      id: 'validity',
      title: 'Validité',
      icon: ShieldCheck,
      value: validity,
      options: Object.entries(VALIDITY).map(([value, v]) => ({
        value,
        label: v.label,
      })),
    },
  ],
  eyebrow: 'Ressources humaines',
  description:
    'Qualifications, cartes professionnelles et habilitations des formateurs, avec leurs échéances.',
  kpis: (rows) => [
    {
      label: 'Qualifications',
      value: rows.length,
      subtitle: 'enregistrées',
      icon: ShieldCheck,
    },
    {
      label: 'Valides',
      value: rows.filter((r) => validity(r) === 'VALIDE').length,
      subtitle: 'échéance à plus de 90 jours',
      icon: BadgeCheck,
    },
    {
      label: 'À renouveler',
      value: rows.filter((r) => validity(r) === 'A_RENOUVELER').length,
      subtitle: 'échéance sous 90 jours',
      icon: CalendarClock,
    },
    {
      label: 'Expirées',
      value: rows.filter((r) => validity(r) === 'EXPIREE').length,
      subtitle: 'date de validité passée',
      icon: ShieldX,
    },
    {
      label: 'Sans échéance',
      value: rows.filter((r) => validity(r) === 'PERMANENTE').length,
      subtitle: 'aucune date de fin',
      icon: InfinityIcon,
    },
  ],
  card: (r) => {
    const v = VALIDITY[validity(r)];
    return {
      title: r.label,
      subtitle: r.trainer_name,
      badges: (
        <Badge variant={v.variant} appearance="light">
          {v.label}
        </Badge>
      ),
      meta: [
        { label: 'Obtenue le', value: formatDate(r.obtained_on) || null },
        { label: "Valide jusqu'au", value: formatDate(r.valid_until) || null },
      ],
    };
  },
  columns: [
    titleCol('label', 'Qualification', undefined, 260),
    col('trainer', 'Formateur', { value: (r) => r.trainer_name, size: 200 }),
    dateCol('obtained_on', 'Obtenue le'),
    dateCol('valid_until', "Valide jusqu'au", {
      late: (r) => validity(r) === 'EXPIREE',
    }),
    col('validity', 'État', {
      size: 140,
      value: validity,
      cell: (r) => {
        const v = VALIDITY[validity(r)];
        return (
          <Badge variant={v.variant} appearance="light">
            {v.label}
          </Badge>
        );
      },
    }),
  ],
  fields: [
    {
      name: 'trainer_id',
      label: 'Formateur',
      type: 'select',
      required: true,
      optionsFrom: { path: 'trainers', label: (t) => String(t.full_name) },
    },
    {
      name: 'label',
      label: 'Qualification / habilitation',
      type: 'text',
      required: true,
      placeholder: 'Ex. SSIAP 3, carte professionnelle CNAPS',
    },
    { name: 'obtained_on', label: 'Obtenue le', type: 'date', span: 1 },
    {
      name: 'valid_until',
      label: "Valide jusqu'au",
      type: 'date',
      span: 1,
      help: 'Laisser vide si sans échéance.',
    },
  ],
  deleteMessage: (r) =>
    `Supprimer « ${r.label} » de ${r.trainer_name ?? 'ce formateur'} ?`,
};

export default function QualificationsPage() {
  return <ResourcePage config={config} />;
}
