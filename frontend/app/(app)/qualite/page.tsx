'use client';

// Page de la section « Qualité & amélioration » : satisfaction, réclamations et aléas, veille, partenaires.
// Tout est compté sur les listes renvoyées par l'API ; aucun taux n'est calculé ici.
import {
  CircleAlert,
  Handshake,
  MessageSquareWarning,
  Radar,
  Send,
} from 'lucide-react';
import { formatDate } from '@/lib/format';
import { countIn, monthWindow } from '@/lib/months';
import { useResourceList, type Row } from '@/lib/resource';
import type { AlertItem } from '@/components/page/alert-list-card';
import { DonutCard, EvolutionCard } from '@/components/page/chart-cards';
import { LandingRow } from '@/components/page/section-card';
import {
  SectionLanding,
  type ModuleFigures,
} from '@/components/page/section-landing';

interface Survey extends Row {
  sent_on: string | null;
  answered_on: string | null;
}

interface Complaint extends Row {
  kind: string;
  description: string;
  session_reference: string | null;
  received_on: string;
  resolved_on: string | null;
}

interface WatchItem extends Row {
  title: string;
  domain: string;
  noted_on: string | null;
  exploited_on: string | null;
}

interface Partner extends Row {
  kind: 'HANDICAP' | 'SOCIO_ECONOMIQUE';
}

const KINDS = [
  { value: 'RECLAMATION', label: 'Réclamations', one: 'Réclamation' },
  { value: 'DIFFICULTE', label: 'Difficultés', one: 'Difficulté' },
  { value: 'ALEA', label: 'Aléas', one: 'Aléa' },
];

export default function QualiteSectionPage() {
  const surveys = useResourceList<Survey>('surveys');
  const complaints = useResourceList<Complaint>('complaints');
  const watch = useResourceList<WatchItem>('watch-items');
  const partners = useResourceList<Partner>('partners');

  const allSurveys = surveys.data ?? [];
  const answered = allSurveys.filter((s) => s.answered_on).length;
  const allComplaints = complaints.data ?? [];
  const open = allComplaints.filter((c) => !c.resolved_on);
  const items = watch.data ?? [];
  const toExploit = items.filter((w) => !w.exploited_on);
  const allPartners = partners.data ?? [];
  const handicap = allPartners.filter((p) => p.kind === 'HANDICAP').length;

  const points = monthWindow(-11, 12).map(({ key, period }) => ({
    period,
    reponses: countIn(
      allSurveys.map((s) => s.answered_on),
      key,
    ),
    reclamations: countIn(
      allComplaints.map((c) => c.received_on),
      key,
    ),
  }));

  const alerts: AlertItem[] = [
    ...open.map((c) => ({
      id: `rec-${c.id}`,
      title: c.description,
      subtitle: [
        KINDS.find((k) => k.value === c.kind)?.one ?? c.kind,
        c.session_reference,
        'non résolue',
      ]
        .filter(Boolean)
        .join(' · '),
      when: formatDate(c.received_on),
      tone: 'danger' as const,
      href: '/qualite/reclamations',
    })),
    ...toExploit.map((w) => ({
      id: `veille-${w.id}`,
      title: w.title,
      subtitle: 'Veille notée, exploitation à décrire',
      when: formatDate(w.noted_on),
      tone: 'warning' as const,
      href: '/qualite/veille',
    })),
  ];

  const figures: ModuleFigures = {
    satisfaction: {
      loading: surveys.isLoading,
      list: [
        { label: 'Enquêtes', value: allSurveys.length },
        { label: 'Répondues', value: answered },
      ],
    },
    reclamations: {
      loading: complaints.isLoading,
      list: [
        { label: 'Reçues', value: allComplaints.length },
        { label: 'Non résolues', value: open.length },
      ],
    },
    veille: {
      loading: watch.isLoading,
      list: [
        { label: 'Notes de veille', value: items.length },
        { label: 'À exploiter', value: toExploit.length },
      ],
    },
    partenaires: {
      loading: partners.isLoading,
      list: [
        { label: 'Handicap', value: handicap },
        {
          label: 'Socio-économiques',
          value: allPartners.length - handicap,
        },
      ],
    },
  };

  return (
    <SectionLanding
      sectionId="qualite"
      description="Ce que disent les stagiaires et les clients, les réclamations et aléas, la veille et les partenaires. Chaque carte ouvre le module correspondant."
      error={surveys.error ?? complaints.error}
      kpiLoading={surveys.isLoading || complaints.isLoading}
      kpis={[
        {
          label: 'Enquêtes envoyées',
          value: allSurveys.filter((s) => s.sent_on).length,
          subtitle: `${answered} réponse${answered > 1 ? 's' : ''} reçue${answered > 1 ? 's' : ''}`,
          icon: Send,
        },
        {
          label: 'Réclamations et aléas',
          value: allComplaints.length,
          subtitle: 'enregistrés',
          icon: MessageSquareWarning,
        },
        {
          label: 'Non résolus',
          value: open.length,
          subtitle: 'sans date de résolution',
          icon: CircleAlert,
        },
        {
          label: 'Veille à exploiter',
          value: toExploit.length,
          subtitle: `sur ${items.length} note${items.length > 1 ? 's' : ''}`,
          icon: Radar,
        },
        {
          label: 'Partenaires',
          value: allPartners.length,
          subtitle: `dont ${handicap} sur le handicap`,
          icon: Handshake,
        },
      ]}
      charts={
        <LandingRow
          side={
            <DonutCard
              title="Réclamations et aléas"
              subtitle="Par type, depuis le début"
              totalLabel="enregistrés"
              loading={complaints.isLoading}
              slices={KINDS.map((k) => ({
                key: k.value,
                label: k.label,
                value: allComplaints.filter((c) => c.kind === k.value).length,
              }))}
              empty="Aucune réclamation ni aléa enregistré."
            />
          }
          main={
            <EvolutionCard
              title="Retours par mois"
              subtitle="Réponses aux enquêtes et réclamations reçues, 12 derniers mois"
              series={[
                { key: 'reponses', label: 'Réponses aux enquêtes' },
                { key: 'reclamations', label: 'Réclamations et aléas' },
              ]}
              points={points}
              loading={surveys.isLoading || complaints.isLoading}
              empty="Aucun retour sur les douze derniers mois."
            />
          }
        />
      }
      alerts={{
        subtitle: 'Réclamations non résolues, veille à exploiter',
        items: alerts,
        loading: complaints.isLoading || watch.isLoading,
        empty: 'Rien à traiter côté qualité pour l’instant.',
      }}
      figures={figures}
    />
  );
}
