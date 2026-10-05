'use client';

import {
  CalendarDays,
  Hourglass,
  MailCheck,
  Smile,
  Star,
  Users,
} from 'lucide-react';
import { formatDate } from '@/lib/format';
import type { Row } from '@/lib/resource';
import { cn } from '@/lib/utils';
import {
  badgeCol,
  col,
  dateCol,
  OptionBadge,
} from '@/components/resource/columns';
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
  labels: {
    one: "L'enquête",
    created: 'enregistrée',
    updated: 'modifiée',
    deleted: 'supprimée',
  },
  permission: 'write_quality',
  defaultSort: { id: 'sent_on', desc: true },
  search: (r) => [r.session_reference, r.learner_name, r.comment].join(' '),
  tabs: [
    { id: 'all', label: 'Toutes', test: () => true },
    {
      id: 'waiting',
      label: 'En attente de réponse',
      test: (r) => !r.answered_on,
    },
    { id: 'answered', label: 'Répondues', test: (r) => !!r.answered_on },
  ],
  facets: [
    {
      id: 'audience',
      title: 'Public',
      icon: Users,
      value: (r) => r.audience,
      options: AUDIENCES,
    },
    {
      id: 'session',
      title: 'Session',
      icon: CalendarDays,
      value: (r) => r.session_reference,
    },
  ],
  eyebrow: 'Qualité & amélioration',
  description:
    'Les enquêtes de satisfaction envoyées aux stagiaires, entreprises, financeurs et formateurs, et leurs réponses.',
  kpis: (rows) => {
    const scored = rows.filter((r) => r.score != null);
    const mean = scored.length
      ? scored.reduce((n, r) => n + (r.score ?? 0), 0) / scored.length
      : null;
    return [
      {
        label: 'Enquêtes',
        value: rows.length,
        subtitle: 'enregistrées',
        icon: Smile,
      },
      {
        label: 'En attente',
        value: rows.filter((r) => !r.answered_on).length,
        subtitle: 'sans réponse',
        icon: Hourglass,
      },
      {
        label: 'Répondues',
        value: rows.filter((r) => r.answered_on).length,
        subtitle: 'avec une date de réponse',
        icon: MailCheck,
      },
      {
        label: 'Note moyenne',
        value: mean == null ? '—' : `${mean.toFixed(1).replace('.', ',')} / 5`,
        subtitle: `sur ${scored.length} réponse${scored.length > 1 ? 's' : ''} notée${scored.length > 1 ? 's' : ''}`,
        icon: Star,
      },
      {
        label: 'Sessions',
        value: new Set(rows.map((r) => r.session_id)).size,
        subtitle: 'couvertes par une enquête',
        icon: CalendarDays,
      },
    ];
  },
  card: (r) => ({
    title: r.session_reference ?? 'Session',
    subtitle: r.comment,
    badges: <OptionBadge options={AUDIENCES} value={r.audience} />,
    meta: [
      { label: 'Répondant', value: r.learner_name },
      {
        label: 'Note /5',
        value: r.score == null ? null : r.score.toFixed(1).replace('.', ','),
      },
      { label: 'Envoyée le', value: formatDate(r.sent_on) || null },
      { label: 'Répondue le', value: formatDate(r.answered_on) || null },
    ],
  }),
  columns: [
    col('session', 'Session', {
      value: (r) => r.session_reference,
      first: true,
      size: 170,
      cell: (r) => (
        <span className="font-medium text-foreground">
          {r.session_reference}
        </span>
      ),
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
          <span
            className={cn(
              'font-semibold tabular-nums',
              r.score >= 4
                ? 'text-green-600'
                : r.score >= 3
                  ? 'text-yellow-600'
                  : 'text-destructive',
            )}
          >
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
    {
      name: 'audience',
      label: 'Public',
      type: 'select',
      required: true,
      options: AUDIENCES,
      defaultValue: 'APPRENANT_CHAUD',
    },
    { name: 'sent_on', label: 'Envoyée le', type: 'date', span: 1 },
    { name: 'answered_on', label: 'Répondue le', type: 'date', span: 1 },
    { name: 'score', label: 'Note sur 5', type: 'number', span: 1 },
    { name: 'comment', label: 'Commentaire', type: 'textarea' },
  ],
};

export default function SatisfactionPage() {
  return <ResourcePage config={config} />;
}
