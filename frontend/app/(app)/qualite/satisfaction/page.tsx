'use client';

import { CalendarDays, Smile, Users } from 'lucide-react';
import type { Row } from '@/lib/resource';
import { cn } from '@/lib/utils';
import { badgeCol, col, dateCol } from '@/components/resource/columns';
import { ResourcePage } from '@/components/resource/resource-page';
import type { ResourceConfig } from '@/components/resource/types';

interface Survey extends Row {
  session_id: string;
  session_reference: string | null;
  enrollment_id: string | null;
  learner_name: string | null;
  audience: string;
  sent_on: string | null;
  answered_on: string | null;
  score: number | null;
  comment: string | null;
}

const AUDIENCES = [
  { value: 'APPRENANT_CHAUD', label: 'Apprenant (à chaud)' },
  { value: 'APPRENANT_FROID', label: 'Apprenant (à froid)' },
  { value: 'ENTREPRISE', label: 'Entreprise' },
  { value: 'FINANCEUR', label: 'Financeur' },
  { value: 'FORMATEUR', label: 'Formateur' },
];

const config: ResourceConfig<Survey> = {
  path: 'surveys',
  title: 'Satisfaction',
  icon: Smile,
  newLabel: 'Nouvelle enquête',
  labels: { one: "L'enquête", created: 'enregistrée', updated: 'modifiée', deleted: 'supprimée' },
  permission: 'write_quality',
  defaultSort: { id: 'sent_on', desc: true },
  search: (r) => [r.session_reference, r.learner_name, r.comment].join(' '),
  facets: [
    { id: 'audience', title: 'Public', icon: Users, value: (r) => r.audience, options: AUDIENCES },
    { id: 'session', title: 'Session', icon: CalendarDays, value: (r) => r.session_reference },
  ],
  columns: [
    col('session', 'Session', {
      value: (r) => r.session_reference,
      first: true,
      size: 170,
      cell: (r) => <span className="font-medium text-foreground">{r.session_reference}</span>,
    }),
    badgeCol('audience', 'Public', AUDIENCES),
    col('learner', 'Répondant', { value: (r) => r.learner_name, size: 190 }),
    dateCol('sent_on', 'Envoyée le'),
    dateCol('answered_on', 'Répondue le'),
    col('score', 'Note /5', {
      size: 100,
      cell: (r) =>
        r.score == null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className={cn('font-semibold tabular-nums', r.score >= 4 ? 'text-emerald-600' : r.score >= 3 ? 'text-amber-600' : 'text-destructive')}>
            {r.score.toFixed(1)}
          </span>
        ),
    }),
    col('comment', 'Commentaire', { size: 280 }),
  ],
  fields: [
    {
      name: 'session_id',
      label: 'Session',
      type: 'select',
      required: true,
      optionsFrom: { path: 'sessions', label: (s) => String(s.reference) },
    },
    { name: 'audience', label: 'Public', type: 'select', required: true, options: AUDIENCES, defaultValue: 'APPRENANT_CHAUD' },
    { name: 'sent_on', label: 'Envoyée le', type: 'date', span: 1 },
    { name: 'answered_on', label: 'Répondue le', type: 'date', span: 1 },
    { name: 'score', label: 'Note sur 5', type: 'number', span: 1 },
    { name: 'comment', label: 'Commentaire', type: 'textarea' },
  ],
};

export default function SatisfactionPage() {
  return <ResourcePage config={config} />;
}
