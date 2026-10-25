'use client';

// Vue d'ensemble « Pilotage » : la feuille de route (toutes les échéances, état décidé par l'API), les
// sessions et les communications à valider, puis une carte par module.
import { useQuery } from '@tanstack/react-query';
import {
  AlarmClock,
  CalendarClock,
  CalendarRange,
  Mail,
  Route,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useSessions } from '@/lib/gsms/sessions';
import { useCan } from '@/lib/permissions';
import type { AlertItem } from '@/components/page/alert-list-card';
import { DonutCard } from '@/components/page/chart-cards';
import { LandingRow } from '@/components/page/section-card';
import {
  SectionLanding,
  type ModuleFigures,
} from '@/components/page/section-landing';

interface RoadmapItem {
  source: 'SESSION' | 'ACTION' | 'PREUVE' | 'TITRE' | 'FINANCEMENT';
  echeance: string;
  etat: 'EN_RETARD' | 'A_ECHEANCE' | 'A_VENIR';
  titre: string;
  detail: string;
  lien: string | null;
}

const SOURCES = [
  { key: 'SESSION', label: 'Étapes de session' },
  { key: 'ACTION', label: 'Actions correctives' },
  { key: 'PREUVE', label: 'Preuves à renouveler' },
  { key: 'TITRE', label: 'Titres des formateurs' },
  { key: 'FINANCEMENT', label: 'Financement' },
] as const;

export default function PilotageSectionPage() {
  const canMessages = useCan()('manage_communications');
  const roadmap = useQuery({
    queryKey: ['pilotage', 'feuille-de-route', 6],
    queryFn: () =>
      api.get<{ elements: RoadmapItem[] }>(
        'pilotage/feuille-de-route?semaines=6',
      ),
  });
  const sessions = useSessions();
  const messages = useQuery({
    queryKey: ['communications', 'compteurs'],
    queryFn: () =>
      api.get<{ compteurs: Record<string, number> }>('communications?limite=1'),
    enabled: canMessages,
    retry: false,
  });

  const items = roadmap.data?.elements ?? [];
  const late = items.filter((i) => i.etat === 'EN_RETARD');
  const soon = items.filter((i) => i.etat === 'A_ECHEANCE');
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (sessions.data ?? []).filter(
    (s) =>
      s.end_date >= today && s.status !== 'ANNULEE' && s.status !== 'CLOTUREE',
  );
  const counts = messages.isError ? {} : (messages.data?.compteurs ?? {});

  const alerts: AlertItem[] = [...late, ...soon].map((i, n) => ({
    id: `${i.source}-${i.titre}-${n}`,
    title: i.titre,
    subtitle: i.detail,
    when: formatDate(i.echeance),
    tone: i.etat === 'EN_RETARD' ? 'danger' : 'warning',
    href: i.lien ?? undefined,
  }));

  const figures: ModuleFigures = {
    dashboard: {
      loading: roadmap.isLoading,
      list: [
        { label: 'En retard', value: late.length },
        { label: 'À échéance', value: soon.length },
      ],
    },
    agenda: {
      loading: sessions.isLoading,
      list: [
        { label: 'Sessions à venir', value: upcoming.length },
        {
          label: 'En cours',
          value: upcoming.filter((s) => s.status === 'EN_COURS').length,
        },
      ],
    },
    'feuille-de-route': {
      loading: roadmap.isLoading,
      list: [
        { label: 'Échéances', value: items.length },
        { label: 'En retard', value: late.length },
      ],
    },
    alertes: {
      loading: roadmap.isLoading,
      list: [
        { label: 'En retard', value: late.length },
        { label: 'À échéance', value: soon.length },
      ],
    },
    communications: {
      loading: messages.isLoading && canMessages,
      list: [
        { label: 'À valider', value: counts.A_VALIDER ?? 0 },
        { label: 'Échecs', value: counts.ECHEC ?? 0 },
      ],
    },
  };

  return (
    <SectionLanding
      sectionId="pilotage"
      description="Ce qui demande une décision ou une action : échéances de toutes les sources, sessions à venir et messages à valider. Chaque carte ouvre le module correspondant."
      error={roadmap.error}
      kpiLoading={roadmap.isLoading || sessions.isLoading}
      kpis={[
        {
          label: 'En retard',
          value: late.length,
          subtitle: 'toutes sources',
          icon: AlarmClock,
        },
        {
          label: 'À échéance',
          value: soon.length,
          subtitle: 'à faire maintenant',
          icon: CalendarClock,
        },
        {
          label: 'Échéances',
          value: items.length,
          subtitle: 'sur 6 semaines',
          icon: Route,
        },
        {
          label: 'Sessions à venir',
          value: upcoming.length,
          subtitle: 'ou en cours',
          icon: CalendarRange,
        },
        {
          label: 'Messages à valider',
          value: counts.A_VALIDER ?? 0,
          subtitle: `${counts.ECHEC ?? 0} en échec`,
          icon: Mail,
        },
      ]}
      charts={
        <LandingRow
          side={
            <DonutCard
              title="Échéances"
              subtitle="Par source, 6 prochaines semaines et retard"
              totalLabel="échéances"
              loading={roadmap.isLoading}
              slices={SOURCES.map((s) => ({
                key: s.key,
                label: s.label,
                value: items.filter((i) => i.source === s.key).length,
              }))}
              empty="Rien en retard ni prévu."
            />
          }
          main={
            <DonutCard
              title="Urgence"
              subtitle="État des échéances"
              totalLabel="échéances"
              loading={roadmap.isLoading}
              slices={[
                { key: 'EN_RETARD', label: 'En retard', value: late.length },
                { key: 'A_ECHEANCE', label: 'À échéance', value: soon.length },
                {
                  key: 'A_VENIR',
                  label: 'À venir',
                  value: items.length - late.length - soon.length,
                },
              ]}
              empty="Rien en retard ni prévu."
            />
          }
        />
      }
      alerts={{
        subtitle: 'En retard puis à échéance, toutes sources',
        items: alerts,
        loading: roadmap.isLoading,
        empty: 'Rien en retard ni à échéance.',
      }}
      figures={figures}
    />
  );
}
