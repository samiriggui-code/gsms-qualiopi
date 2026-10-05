'use client';

// Moyens techniques (indicateur 17) : matériel pédagogique par article, avec sa quantité, son lieu et ses
// vérifications. L'inventaire repris de GSMS School arrive « à vérifier sur place » : à compter et à confirmer.
import {
  CalendarClock,
  CircleCheck,
  Package,
  Tags,
  TriangleAlert,
  Wrench,
} from 'lucide-react';
import { formatDate } from '@/lib/format';
import {
  EQUIPMENT_CATEGORIES,
  PLACE_STATUSES,
  STATUS_OPTIONS,
} from '@/lib/gsms/moyens';
import type { Row } from '@/lib/resource';
import { cn } from '@/lib/utils';
import {
  badgeCol,
  col,
  dateCol,
  OptionBadge,
  titleCol,
} from '@/components/resource/columns';
import { ResourcePage } from '@/components/resource/resource-page';
import type { ResourceConfig } from '@/components/resource/types';

interface Equipment extends Row {
  code: string;
  label: string;
  category: string;
  category_label: string;
  quantity: number;
  premises_name: string | null;
  regulatory_ref: string | null;
  status: string;
  last_check_on: string | null;
  next_check_on: string | null;
  check_overdue: boolean;
}

const config: ResourceConfig<Equipment> = {
  path: 'equipment',
  title: 'Moyens techniques',
  icon: Wrench,
  newLabel: 'Nouvel équipement',
  labels: {
    one: 'L’équipement',
    created: 'ajouté',
    updated: 'modifié',
    deleted: 'supprimé',
  },
  permission: 'write_training',
  defaultSort: { id: 'label', desc: false },
  search: (r) =>
    [r.label, r.code, r.premises_name, r.category_label, r.regulatory_ref].join(
      ' ',
    ),
  tabs: [
    { id: 'all', label: 'Tous', test: () => true },
    {
      id: 'check',
      label: 'À vérifier',
      test: (r) => r.status === 'A_VERIFIER',
    },
    {
      id: 'late',
      label: 'Vérification dépassée',
      test: (r) => r.check_overdue,
    },
  ],
  facets: [
    {
      id: 'category',
      title: 'Catégorie',
      icon: Tags,
      value: (r) => r.category,
      options: EQUIPMENT_CATEGORIES,
    },
    {
      id: 'status',
      title: 'Statut',
      icon: CircleCheck,
      value: (r) => r.status,
      options: STATUS_OPTIONS,
    },
  ],
  eyebrow: 'Offre de formation',
  description:
    'Le matériel pédagogique par article : quantité, lieu de rangement et vérifications.',
  kpis: (rows) => [
    {
      label: 'Articles',
      value: rows.length,
      subtitle: 'dans l’inventaire',
      icon: Wrench,
    },
    {
      label: 'Unités',
      value: rows.reduce((n, r) => n + r.quantity, 0),
      subtitle: 'quantité totale',
      icon: Package,
    },
    {
      label: 'En service',
      value: rows.filter((r) => r.status === 'EN_SERVICE').length,
      subtitle: 'articles vérifiés',
      icon: CircleCheck,
    },
    {
      label: 'À vérifier',
      value: rows.filter((r) => r.status === 'A_VERIFIER').length,
      subtitle: 'à compter et confirmer',
      icon: TriangleAlert,
    },
    {
      label: 'Vérification dépassée',
      value: rows.filter((r) => r.check_overdue).length,
      subtitle: 'date de vérification passée',
      icon: CalendarClock,
    },
  ],
  defaultView: 'grid',
  card: (r) => ({
    title: r.label,
    subtitle: r.category_label,
    badges: <OptionBadge options={PLACE_STATUSES} value={r.status} />,
    meta: [
      { label: 'Quantité', value: r.quantity },
      { label: 'Lieu', value: r.premises_name },
      {
        label: 'Prochaine vérification',
        value: r.next_check_on ? (
          <span className={cn(r.check_overdue && 'text-destructive')}>
            {formatDate(r.next_check_on)}
          </span>
        ) : null,
      },
      { label: 'Référence', value: r.regulatory_ref },
    ],
  }),
  columns: [
    titleCol('label', 'Équipement', undefined, 280),
    col('category', 'Catégorie', { value: (r) => r.category_label, size: 170 }),
    col('quantity', 'Quantité', {
      size: 100,
      cell: (r) => <span className="tabular-nums">{r.quantity}</span>,
    }),
    col('premises_name', 'Lieu', { size: 180 }),
    badgeCol('status', 'Statut', PLACE_STATUSES),
    dateCol('last_check_on', 'Vérifié le'),
    dateCol('next_check_on', 'Prochaine vérification', {
      late: (r) => r.check_overdue,
    }),
    col('regulatory_ref', 'Référence', { size: 200 }),
  ],
  fields: [
    { name: 'label', label: 'Équipement', type: 'text', required: true },
    {
      name: 'code',
      label: 'Code',
      type: 'text',
      required: true,
      span: 1,
      placeholder: 'Ex. secourisme.dae',
    },
    {
      name: 'category',
      label: 'Catégorie',
      type: 'select',
      options: EQUIPMENT_CATEGORIES,
      span: 1,
      defaultValue: 'AUTRE',
    },
    {
      name: 'quantity',
      label: 'Quantité',
      type: 'number',
      span: 1,
      defaultValue: '1',
    },
    {
      name: 'premises_id',
      label: 'Lieu',
      type: 'select',
      span: 1,
      optionsFrom: { path: 'premises', label: (r) => String(r.name) },
    },
    {
      name: 'status',
      label: 'Statut',
      type: 'select',
      options: STATUS_OPTIONS,
      span: 1,
      defaultValue: 'A_VERIFIER',
    },
    {
      name: 'regulatory_ref',
      label: 'Référence (norme, texte)',
      type: 'text',
      span: 1,
    },
    {
      name: 'last_check_on',
      label: 'Dernière vérification',
      type: 'date',
      span: 1,
    },
    {
      name: 'next_check_on',
      label: 'Prochaine vérification',
      type: 'date',
      span: 1,
    },
    { name: 'note', label: 'Remarques', type: 'textarea' },
  ],
  deleteMessage: (r) => `« ${r.label} » sera supprimé de l’inventaire.`,
};

export default function EquipmentPage() {
  return <ResourcePage config={config} />;
}
