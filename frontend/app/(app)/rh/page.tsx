'use client';

// Page de la section « Ressources humaines » : formateurs, habilitations, développement des compétences et
// sous-traitants. Les échéances d'habilitation viennent de l'API (/qualiopi/echeances) ; le reste est compté
// sur les listes renvoyées par l'API.
import {
  BadgeCheck,
  CalendarClock,
  Handshake,
  Sprout,
  UserRound,
} from 'lucide-react';
import { formatDate } from '@/lib/format';
import { useQualificationDeadlines } from '@/lib/gsms/dashboard';
import { QUALIFICATION_DEADLINE } from '@/lib/gsms/labels';
import { countIn, monthWindow } from '@/lib/months';
import { useCan } from '@/lib/permissions';
import { useResourceList, type Row } from '@/lib/resource';
import type { AlertItem } from '@/components/page/alert-list-card';
import { DonutCard, EvolutionCard } from '@/components/page/chart-cards';
import { LandingRow } from '@/components/page/section-card';
import {
  SectionLanding,
  type ModuleFigures,
} from '@/components/page/section-landing';

interface Trainer extends Row {
  is_external: boolean;
}

interface Action extends Row {
  label: string;
  trainer_name: string | null;
  planned_on: string | null;
  completed_on: string | null;
}

interface Subcontractor extends Row {
  name: string;
  qualiopi_certified: boolean;
  contract_signed_on: string | null;
}

export default function RhSectionPage() {
  const staff = useCan()('read_staff');
  const trainers = useResourceList<Trainer>('trainers');
  const qualifications = useResourceList<Row>('trainer-qualifications');
  const actions = useResourceList<Action>('staff-development');
  const subcontractors = useResourceList<Subcontractor>('subcontractors');
  const deadlines = useQualificationDeadlines(staff);

  const allTrainers = trainers.data ?? [];
  const external = allTrainers.filter((t) => t.is_external).length;
  const allActions = actions.data ?? [];
  const planned = allActions.filter((a) => !a.completed_on);
  const subs = subcontractors.data ?? [];
  const certified = subs.filter((s) => s.qualiopi_certified).length;
  const due = deadlines.data ?? [];

  const points = monthWindow(-11, 12).map(({ key, period }) => ({
    period,
    prevues: countIn(
      allActions.map((a) => a.planned_on),
      key,
    ),
    realisees: countIn(
      allActions.map((a) => a.completed_on),
      key,
    ),
  }));

  const alerts: AlertItem[] = [
    ...due.map((d) => ({
      id: `hab-${d.formateur_id}-${d.type}`,
      title: `${d.formateur} · ${d.libelle}`,
      subtitle: QUALIFICATION_DEADLINE[d.etat]?.label ?? 'Habilitation',
      when: formatDate(d.fin),
      tone: d.etat === 'EXPIRE' ? ('danger' as const) : ('warning' as const),
      href: '/rh/qualifications',
    })),
    ...subs
      .filter((s) => !s.contract_signed_on)
      .map((s) => ({
        id: `st-${s.id}`,
        title: s.name,
        subtitle: 'Aucune date de contrat enregistrée',
        tone: 'warning' as const,
        href: '/rh/sous-traitants',
      })),
  ];

  const figures: ModuleFigures = {
    formateurs: {
      loading: trainers.isLoading,
      list: [
        { label: 'Formateurs', value: allTrainers.length },
        { label: 'Externes', value: external },
      ],
    },
    qualifications: {
      loading: qualifications.isLoading || (staff && deadlines.isLoading),
      list: [
        { label: 'Habilitations', value: qualifications.data?.length ?? 0 },
        { label: 'À renouveler', value: staff ? due.length : '—' },
      ],
    },
    developpement: {
      loading: actions.isLoading,
      list: [
        { label: 'Prévues', value: planned.length },
        { label: 'Réalisées', value: allActions.length - planned.length },
      ],
    },
    'sous-traitants': {
      loading: subcontractors.isLoading,
      list: [
        { label: 'Sous-traitants', value: subs.length },
        { label: 'Certifiés Qualiopi', value: certified },
      ],
    },
  };

  return (
    <SectionLanding
      sectionId="rh"
      description="Les formateurs et leurs habilitations, le développement de leurs compétences et les sous-traitants. Chaque carte ouvre le module correspondant."
      error={trainers.error ?? actions.error}
      kpiLoading={trainers.isLoading || subcontractors.isLoading}
      kpis={[
        {
          label: 'Formateurs',
          value: allTrainers.length,
          subtitle: `dont ${external} externe${external > 1 ? 's' : ''}`,
          icon: UserRound,
        },
        {
          label: 'Habilitations',
          value: qualifications.data?.length ?? 0,
          subtitle: 'titres et cartes enregistrés',
          icon: BadgeCheck,
        },
        {
          label: 'À renouveler',
          value: staff ? due.length : '—',
          subtitle: 'habilitations expirées ou proches de l’échéance',
          icon: CalendarClock,
        },
        {
          label: 'Actions prévues',
          value: planned.length,
          subtitle: 'développement des compétences non réalisé',
          icon: Sprout,
        },
        {
          label: 'Sous-traitants',
          value: subs.length,
          subtitle: `dont ${certified} certifié${certified > 1 ? 's' : ''} Qualiopi`,
          icon: Handshake,
        },
      ]}
      charts={
        <LandingRow
          side={
            <DonutCard
              title="Formateurs"
              subtitle="Salariés de l’organisme ou intervenants externes"
              totalLabel="formateurs"
              loading={trainers.isLoading}
              slices={[
                {
                  key: 'internes',
                  label: 'Internes',
                  value: allTrainers.length - external,
                },
                { key: 'externes', label: 'Externes', value: external },
              ]}
              empty="Aucun formateur enregistré pour l’instant."
            />
          }
          main={
            <EvolutionCard
              title="Développement des compétences"
              subtitle="Actions prévues et réalisées par mois, 12 derniers mois"
              series={[
                { key: 'prevues', label: 'Prévues' },
                { key: 'realisees', label: 'Réalisées' },
              ]}
              points={points}
              loading={actions.isLoading}
              empty="Aucune action datée sur les douze derniers mois."
            />
          }
        />
      }
      alerts={{
        subtitle: 'Habilitations et contrats de sous-traitance',
        items: alerts,
        loading: subcontractors.isLoading || (staff && deadlines.isLoading),
        empty: 'Rien à traiter côté ressources humaines pour l’instant.',
      }}
      figures={figures}
    />
  );
}
