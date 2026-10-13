'use client';

// Page de la section « Offre de formation » (niveau 1, entre l'accueil global et les modules, comme les pages
// d'atterrissage de GSMS School) : chiffres de l'offre, sessions par statut et par mois, points à traiter,
// ce que le moteur Qualiopi conclut des indicateurs de la section, puis une carte par module.
// Tout vient de l'API (catalogue, sessions, résultats, lieux, équipements, carnet) ; la page compte et range.
import {
  BookOpen,
  CalendarDays,
  FileCheck2,
  Library,
  Scale,
} from 'lucide-react';
import { formatDate } from '@/lib/format';
import { useCatalogue } from '@/lib/gsms/catalogue';
import { useEstablishment } from '@/lib/gsms/edof';
import { SESSION_STATUS } from '@/lib/gsms/labels';
import { useResults } from '@/lib/gsms/offre';
import { useSessions } from '@/lib/gsms/sessions';
import type { SessionStatus } from '@/lib/gsms/types';
import { monthWindow } from '@/lib/months';
import { useCan } from '@/lib/permissions';
import { useResourceList, type Row } from '@/lib/resource';
import { type AlertItem } from '@/components/page/alert-list-card';
import { DonutCard, EvolutionCard } from '@/components/page/chart-cards';
import { LandingRow } from '@/components/page/section-card';
import {
  SectionLanding,
  type ModuleFigures,
} from '@/components/page/section-landing';

// Rôle des modules qui n'ont pas de fiche de cadrage dans le menu.
const DESCRIPTIONS: Record<string, string> = {
  edof: 'Dossiers de référencement CPF de l’établissement et de chaque formation : pièces, anomalies, dépôt.',
  sessions:
    'Sessions planifiées et passées : dates, lieu, formateur, inscrits, dossier de session.',
};

interface Premises extends Row {
  status: string;
  name: string;
}

interface Equipment extends Row {
  label: string;
  status: string;
  check_overdue: boolean;
  next_check_on: string | null;
}

const FICHE_LABEL = {
  JAMAIS_VALIDEE: 'Fiche jamais validée',
  MODIFIEE: 'Fiche modifiée depuis sa validation',
} as const;

const plural = (n: number, one: string, many: string) =>
  `${n} ${n > 1 ? many : one}`;

export default function OffreFormationPage() {
  const edof = useCan()('read_edof');

  const catalogue = useCatalogue();
  const sessions = useSessions();
  const results = useResults(12);
  const premises = useResourceList<Premises>('premises');
  const equipment = useResourceList<Equipment>('equipment');
  const establishment = useEstablishment(edof);

  const totaux = catalogue.data?.totaux;
  const formations = catalogue.data?.formations ?? [];
  const resources = formations.reduce(
    (acc, f) => ({
      total: acc.total + f.ressources.total,
      todo: acc.todo + f.ressources.a_rediger,
    }),
    { total: 0, todo: 0 },
  );
  const allSessions = sessions.data ?? [];
  const running = allSessions.filter((s) => s.status === 'EN_COURS');
  const places = premises.data ?? [];
  const items = equipment.data ?? [];
  const placesToCheck = places.filter((p) => p.status === 'A_VERIFIER');
  const overdue = items.filter((e) => e.check_overdue);
  const dossiers = (establishment.data?.formations ?? []).filter(
    (f) => f.dossier,
  );
  const blocking = dossiers.reduce(
    (sum, f) => sum + (f.dossier?.blocking ?? 0),
    0,
  );

  // Sessions par mois de début : les 6 derniers mois et les 6 prochains.
  const points = monthWindow(-5, 12).map(({ key, period }) => {
    const inMonth = allSessions.filter(
      (s) => s.status !== 'ANNULEE' && s.start_date.startsWith(key),
    );
    return {
      period,
      sessions: inMonth.length,
      stagiaires: inMonth.reduce((sum, s) => sum + s.learners_count, 0),
    };
  });

  const byStatus = (Object.keys(SESSION_STATUS) as SessionStatus[]).map(
    (status) => ({
      key: status,
      label: SESSION_STATUS[status].label,
      value: allSessions.filter((s) => s.status === status).length,
    }),
  );

  const alerts: AlertItem[] = [
    ...overdue.map((e) => ({
      id: `eq-${e.id}`,
      title: e.label,
      subtitle: 'Vérification du matériel dépassée',
      when: formatDate(e.next_check_on),
      tone: 'danger' as const,
      href: '/formation/moyens',
    })),
    ...formations
      .filter((f) => f.fiche !== 'VALIDEE' || f.points_a_arbitrer > 0)
      .map((f) => ({
        id: `fo-${f.id}`,
        title: f.title,
        subtitle: [
          f.fiche !== 'VALIDEE' && FICHE_LABEL[f.fiche],
          f.points_a_arbitrer > 0 &&
            plural(
              f.points_a_arbitrer,
              'point à arbitrer',
              'points à arbitrer',
            ),
        ]
          .filter(Boolean)
          .join(' · '),
        tone: 'warning' as const,
        href: `/formation/edof/${f.id}`,
      })),
    ...placesToCheck.map((p) => ({
      id: `pl-${p.id}`,
      title: p.name,
      subtitle: 'Lieu à vérifier sur place',
      tone: 'warning' as const,
      href: '/formation/locaux',
    })),
  ];

  const figures: ModuleFigures = {
    programmes: {
      loading: catalogue.isLoading,
      list: [
        { label: 'Formations', value: totaux?.formations ?? '—' },
        { label: 'Fiches validées', value: totaux?.fiches_validees ?? '—' },
      ],
    },
    edof: {
      loading: edof && establishment.isLoading,
      list: edof
        ? [
            { label: 'Dossiers ouverts', value: dossiers.length },
            { label: 'Anomalies bloquantes', value: blocking },
          ]
        : [],
    },
    sessions: {
      loading: sessions.isLoading,
      list: [
        { label: 'À venir', value: totaux?.sessions_a_venir ?? '—' },
        { label: 'En cours', value: running.length },
      ],
    },
    resultats: {
      loading: results.isLoading,
      list: [
        {
          label: 'Formations mesurées',
          value: results.data?.formations_mesurees ?? '—',
        },
        {
          label: 'Stagiaires',
          value: results.data?.totaux.stagiaires ?? '—',
        },
      ],
    },
    ressources: {
      loading: catalogue.isLoading,
      list: [
        { label: 'Ressources', value: resources.total },
        { label: 'À rédiger', value: resources.todo },
      ],
    },
    locaux: {
      loading: premises.isLoading,
      list: [
        { label: 'Lieux', value: places.length },
        { label: 'À vérifier', value: placesToCheck.length },
      ],
    },
    moyens: {
      loading: equipment.isLoading,
      list: [
        { label: 'Équipements', value: items.length },
        { label: 'Vérif. dépassée', value: overdue.length },
      ],
    },
  };

  return (
    <SectionLanding
      sectionId="formation"
      description="Les formations du catalogue, leurs sessions, leurs résultats et les moyens qui servent à les dispenser. Chaque carte ouvre le module correspondant."
      error={catalogue.error ?? sessions.error}
      kpiLoading={catalogue.isLoading}
      kpis={[
        {
          label: 'Formations',
          value: totaux?.formations ?? 0,
          subtitle: `dont ${totaux?.certification_identifiee ?? 0} avec certification identifiée`,
          icon: BookOpen,
        },
        {
          label: 'Sessions à venir',
          value: totaux?.sessions_a_venir ?? 0,
          subtitle: 'toutes formations confondues',
          icon: CalendarDays,
        },
        {
          label: 'Fiches validées',
          value: `${totaux?.fiches_validees ?? 0} / ${totaux?.formations ?? 0}`,
          subtitle: 'relues et validées depuis leur dernière modification',
          icon: FileCheck2,
        },
        {
          label: 'Points à arbitrer',
          value: totaux?.points_a_arbitrer ?? 0,
          subtitle: `sur ${plural(totaux?.formations_a_arbitrer ?? 0, 'formation', 'formations')}`,
          icon: Scale,
        },
        {
          label: 'Ressources à rédiger',
          value: resources.todo,
          subtitle: `sur ${plural(resources.total, 'ressource', 'ressources')}`,
          icon: Library,
        },
      ]}
      charts={
        <LandingRow
          side={
            <DonutCard
              title="Sessions par statut"
              subtitle="Toutes les sessions enregistrées"
              totalLabel="sessions"
              slices={byStatus}
              loading={sessions.isLoading}
              empty="Aucune session enregistrée pour l’instant."
            />
          }
          main={
            <EvolutionCard
              title="Sessions par mois"
              subtitle="Mois de début, 6 derniers et 6 prochains mois, sessions annulées exclues"
              series={[
                { key: 'sessions', label: 'Sessions' },
                { key: 'stagiaires', label: 'Stagiaires inscrits' },
              ]}
              points={points}
              loading={sessions.isLoading}
              empty="Aucune session sur ces douze mois."
            />
          }
        />
      }
      alerts={{
        subtitle: 'Fiches, arbitrages, lieux et matériel',
        items: alerts,
        loading:
          catalogue.isLoading || premises.isLoading || equipment.isLoading,
        empty: 'Rien à traiter dans l’offre pour l’instant.',
      }}
      figures={figures}
      descriptions={DESCRIPTIONS}
    />
  );
}
