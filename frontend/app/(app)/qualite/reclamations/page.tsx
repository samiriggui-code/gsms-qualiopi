'use client';

import { CircleDot, MessageSquareWarning, Tag, Users } from 'lucide-react';
import type { Row } from '@/lib/resource';
import { Badge } from '@/components/ui/badge';
import { badgeCol, col, dateCol, TONE, titleCol } from '@/components/resource/columns';
import { ResourcePage } from '@/components/resource/resource-page';
import type { ResourceConfig } from '@/components/resource/types';

interface Complaint extends Row {
  session_id: string | null;
  session_reference: string | null;
  kind: string;
  stakeholder: string;
  received_on: string;
  description: string;
  acknowledged_on: string | null;
  answered_on: string | null;
  resolved_on: string | null;
  resolution: string | null;
}

const KINDS = [
  { value: 'RECLAMATION', label: 'Réclamation', color: TONE.red },
  { value: 'DIFFICULTE', label: 'Difficulté', color: TONE.amber },
  { value: 'ALEA', label: 'Aléa', color: TONE.gray },
];

const STAKEHOLDERS = [
  { value: 'APPRENANT', label: 'Apprenant' },
  { value: 'ENTREPRISE', label: 'Entreprise' },
  { value: 'FINANCEUR', label: 'Financeur' },
  { value: 'FORMATEUR', label: 'Formateur' },
  { value: 'AUTRE', label: 'Autre' },
];

function state(r: Complaint) {
  if (r.resolved_on) return 'RESOLUE';
  if (r.answered_on) return 'REPONDUE';
  if (r.acknowledged_on) return 'PRISE_EN_COMPTE';
  return 'NOUVELLE';
}

const STATES = [
  { value: 'NOUVELLE', label: 'Nouvelle', variant: 'destructive' as const },
  { value: 'PRISE_EN_COMPTE', label: 'Prise en compte', variant: 'warning' as const },
  { value: 'REPONDUE', label: 'Répondue', variant: 'info' as const },
  { value: 'RESOLUE', label: 'Résolue', variant: 'success' as const },
];

const config: ResourceConfig<Complaint> = {
  path: 'complaints',
  title: 'Réclamations & aléas',
  icon: MessageSquareWarning,
  newLabel: 'Nouvelle réclamation',
  labels: { one: 'La réclamation', created: 'enregistrée', updated: 'modifiée', deleted: 'supprimée' },
  permission: 'write_quality',
  defaultSort: { id: 'received_on', desc: true },
  search: (r) => [r.description, r.resolution, r.session_reference].join(' '),
  tabs: [
    { id: 'all', label: 'Toutes', test: () => true },
    { id: 'todo', label: 'À accuser réception', test: (r) => !r.acknowledged_on && !r.resolved_on },
    { id: 'open', label: 'En traitement', test: (r) => !!r.acknowledged_on && !r.resolved_on },
    { id: 'resolved', label: 'Résolues', test: (r) => !!r.resolved_on },
  ],
  facets: [
    { id: 'state', title: 'État', icon: CircleDot, value: state, options: STATES },
    { id: 'kind', title: 'Type', icon: Tag, value: (r) => r.kind, options: KINDS },
    { id: 'stakeholder', title: 'Émetteur', icon: Users, value: (r) => r.stakeholder, options: STAKEHOLDERS },
  ],
  columns: [
    dateCol('received_on', 'Reçue le'),
    titleCol('description', 'Objet', undefined, 320),
    badgeCol('kind', 'Type', KINDS),
    badgeCol('stakeholder', 'Émetteur', STAKEHOLDERS),
    col('session', 'Session', { value: (r) => r.session_reference, size: 160 }),
    col('state', 'État', {
      size: 150,
      value: state,
      cell: (r) => {
        const s = STATES.find((x) => x.value === state(r))!;
        return (
          <Badge variant={s.variant} appearance="light">
            {s.label}
          </Badge>
        );
      },
    }),
  ],
  fields: [
    { name: 'kind', label: 'Type', type: 'select', required: true, options: KINDS, defaultValue: 'RECLAMATION', span: 1 },
    { name: 'stakeholder', label: 'Émetteur', type: 'select', required: true, options: STAKEHOLDERS, defaultValue: 'APPRENANT', span: 1 },
    { name: 'received_on', label: 'Reçue le', type: 'date', required: true, span: 1 },
    {
      name: 'session_id',
      label: 'Session concernée',
      type: 'select',
      span: 1,
      optionsFrom: { path: 'sessions', label: (s) => String(s.reference) },
    },
    { name: 'description', label: 'Description', type: 'textarea', required: true },
    { name: 'acknowledged_on', label: 'Accusé de réception le', type: 'date', span: 1 },
    { name: 'answered_on', label: 'Réponse le', type: 'date', span: 1 },
    { name: 'resolved_on', label: 'Résolue le', type: 'date', span: 1 },
    { name: 'resolution', label: 'Réponse apportée / résolution', type: 'textarea' },
  ],
};

export default function ReclamationsPage() {
  return <ResourcePage config={config} />;
}
