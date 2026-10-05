'use client';

// Locaux (indicateur 17) : sites, salles et plateaux techniques où se déroulent les formations. Ce qui vient
// de GSMS School arrive « à vérifier sur place » : la personne qui a vu le lieu passe son statut à « En service ».
import { Building2, CircleCheck, Warehouse } from 'lucide-react';
import {
  PLACE_STATUSES,
  PREMISES_KINDS,
  STATUS_OPTIONS,
} from '@/lib/gsms/moyens';
import type { Row } from '@/lib/resource';
import {
  badgeCol,
  col,
  countCol,
  dateCol,
  titleCol,
} from '@/components/resource/columns';
import { ResourcePage } from '@/components/resource/resource-page';
import type { ResourceConfig } from '@/components/resource/types';

interface Premises extends Row {
  code: string;
  name: string;
  kind: string;
  kind_label: string;
  parent_name: string | null;
  address: string | null;
  floor: string | null;
  capacity: number | null;
  status: string;
  checked_on: string | null;
  equipment: number;
}

const config: ResourceConfig<Premises> = {
  path: 'premises',
  title: 'Locaux',
  icon: Warehouse,
  newLabel: 'Nouveau lieu',
  labels: {
    one: 'Le lieu',
    created: 'créé',
    updated: 'modifié',
    deleted: 'supprimé',
  },
  permission: 'write_training',
  defaultSort: { id: 'name', desc: false },
  search: (r) => [r.code, r.name, r.parent_name, r.address, r.floor].join(' '),
  tabs: [
    { id: 'all', label: 'Tous', test: () => true },
    {
      id: 'check',
      label: 'À vérifier',
      test: (r) => r.status === 'A_VERIFIER',
    },
    { id: 'ok', label: 'En service', test: (r) => r.status === 'EN_SERVICE' },
  ],
  facets: [
    {
      id: 'kind',
      title: 'Type',
      icon: Building2,
      value: (r) => r.kind,
      options: PREMISES_KINDS,
    },
    {
      id: 'status',
      title: 'Statut',
      icon: CircleCheck,
      value: (r) => r.status,
      options: STATUS_OPTIONS,
    },
  ],
  columns: [
    titleCol('name', 'Lieu', undefined, 220),
    col('kind', 'Type', { value: (r) => r.kind_label, size: 160 }),
    col('parent_name', 'Site', { size: 200 }),
    col('floor', 'Emplacement', { size: 200 }),
    col('capacity', 'Capacité', {
      size: 100,
      cell: (r) =>
        r.capacity != null ? (
          <span className="tabular-nums">{r.capacity} pers.</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    }),
    countCol('equipment', 'Équipements'),
    badgeCol('status', 'Statut', PLACE_STATUSES),
    dateCol('checked_on', 'Vérifié le'),
  ],
  fields: [
    { name: 'name', label: 'Nom', type: 'text', required: true },
    {
      name: 'code',
      label: 'Code',
      type: 'text',
      required: true,
      span: 1,
      placeholder: 'Ex. SALLE-1',
    },
    {
      name: 'kind',
      label: 'Type',
      type: 'select',
      options: PREMISES_KINDS,
      span: 1,
      defaultValue: 'SALLE',
    },
    {
      name: 'parent_id',
      label: 'Site',
      type: 'select',
      optionsFrom: { path: 'premises', label: (r) => String(r.name) },
    },
    {
      name: 'address',
      label: 'Adresse',
      type: 'text',
      help: 'Pour un site : adresse postale.',
    },
    {
      name: 'floor',
      label: 'Emplacement',
      type: 'text',
      span: 1,
      placeholder: 'Ex. Niveau 1',
    },
    {
      name: 'capacity',
      label: 'Capacité (personnes)',
      type: 'number',
      span: 1,
    },
    {
      name: 'accessibility',
      label: 'Accessibilité',
      type: 'textarea',
      help: 'Accès des personnes en situation de handicap, aménagements possibles.',
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
      name: 'checked_on',
      label: 'Vérifié sur place le',
      type: 'date',
      span: 1,
    },
    { name: 'note', label: 'Remarques', type: 'textarea' },
  ],
  deleteMessage: (r) =>
    `« ${r.name} » sera supprimé. Les équipements rangés dans ce lieu n’auront plus de lieu.`,
};

export default function PremisesPage() {
  return <ResourcePage config={config} />;
}
