'use client';

// Vue d'ensemble « Clients & financement » : entreprises clientes, dossiers de financement (statut calculé
// par l'API), conventions (mêmes états que le registre). Un bloc dont le module est éteint reste à zéro.
import { useQuery } from '@tanstack/react-query';
import {
  Banknote,
  Building2,
  CircleAlert,
  FileSignature,
  HandCoins,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useFundingCases, useFundingDeadlines } from '@/lib/gsms/qualite';
import type { StepState } from '@/lib/gsms/types';
import { useCan } from '@/lib/permissions';
import { useResourceList, type Row } from '@/lib/resource';
import type { AlertItem } from '@/components/page/alert-list-card';
import { DonutCard } from '@/components/page/chart-cards';
import { LandingRow } from '@/components/page/section-card';
import {
  SectionLanding,
  type ModuleFigures,
} from '@/components/page/section-landing';

const euros = (v: number) =>
  v.toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  });

export default function CommercialSectionPage() {
  const funding = useCan()('read_funding');
  const companies = useResourceList<Row & { learners: number }>('companies');
  const cases = useFundingCases(funding);
  const deadlines = useFundingDeadlines(30, funding);
  const summary = useQuery({
    queryKey: ['registres', 'synthese'],
    queryFn: () =>
      api.get<{
        etapes: { convention: Partial<Record<StepState, number>> };
        en_retard: {
          stagiaire: string;
          session: string;
          session_id: string;
          etape: string;
          echeance: string | null;
        }[];
      }>('parcours/synthese'),
  });

  const allCompanies = companies.data ?? [];
  const allCases = cases.isError ? [] : (cases.data ?? []);
  const conv = summary.data?.etapes.convention ?? {};
  const remaining = allCases.reduce(
    (s, c) => s + Number(c.reste_a_financer),
    0,
  );
  const granted = allCases.reduce((s, c) => s + Number(c.accorde), 0);
  const toSign =
    (conv.EN_RETARD ?? 0) + (conv.A_ECHEANCE ?? 0) + (conv.A_VENIR ?? 0);

  const alerts: AlertItem[] = [
    ...(summary.data?.en_retard ?? [])
      .filter((r) => r.etape === 'convention')
      .map((r, i) => ({
        id: `conv-${r.session_id}-${i}`,
        title: `Convention à signer · ${r.stagiaire}`,
        subtitle: r.session,
        when: r.echeance ? formatDate(r.echeance) : undefined,
        tone: 'danger' as const,
        href: '/commercial/conventions',
      })),
    ...(deadlines.isError ? [] : (deadlines.data ?? [])).map((d) => ({
      id: `fin-${d.source_id}-${d.action}`,
      title: `${d.libelle} · ${d.stagiaire}`,
      subtitle: `${d.dispositif} · ${d.session}`,
      when: formatDate(d.echeance),
      tone: d.etat === 'EN_RETARD' ? ('danger' as const) : ('warning' as const),
      href: '/commercial/financeurs',
    })),
  ];

  const figures: ModuleFigures = {
    entreprises: {
      loading: companies.isLoading,
      list: [
        { label: 'Entreprises', value: allCompanies.length },
        {
          label: 'Stagiaires',
          value: allCompanies.reduce((s, c) => s + (c.learners ?? 0), 0),
        },
      ],
    },
    financeurs: {
      loading: cases.isLoading,
      list: [
        { label: 'Dossiers', value: allCases.length },
        { label: 'Reste à financer', value: euros(remaining) },
      ],
    },
    conventions: {
      loading: summary.isLoading,
      list: [
        { label: 'Signées', value: conv.FAIT ?? 0 },
        { label: 'En retard', value: conv.EN_RETARD ?? 0 },
      ],
    },
  };

  return (
    <SectionLanding
      sectionId="commercial"
      description="Les entreprises clientes, le financement de chaque inscription et les conventions à faire signer. Chaque carte ouvre le module correspondant."
      kpiLoading={companies.isLoading || summary.isLoading}
      kpis={[
        {
          label: 'Entreprises clientes',
          value: allCompanies.length,
          subtitle: 'enregistrées',
          icon: Building2,
        },
        {
          label: 'Dossiers de financement',
          value: allCases.length,
          subtitle: funding ? 'ouverts' : 'module non accessible',
          icon: Banknote,
        },
        {
          label: 'Accordé',
          value: euros(granted),
          subtitle: 'par les financeurs',
          icon: HandCoins,
        },
        {
          label: 'Reste à financer',
          value: euros(remaining),
          subtitle: 'sans accord à ce jour',
          icon: CircleAlert,
        },
        {
          label: 'Conventions à signer',
          value: toSign,
          subtitle: `dont ${conv.EN_RETARD ?? 0} en retard`,
          icon: FileSignature,
        },
      ]}
      charts={
        <LandingRow
          side={
            <DonutCard
              title="Conventions"
              subtitle="État de la signature, toutes inscriptions"
              totalLabel="conventions"
              loading={summary.isLoading}
              slices={[
                { key: 'FAIT', label: 'Signées', value: conv.FAIT ?? 0 },
                {
                  key: 'EN_RETARD',
                  label: 'En retard',
                  value: conv.EN_RETARD ?? 0,
                },
                {
                  key: 'A_ECHEANCE',
                  label: 'À échéance',
                  value: conv.A_ECHEANCE ?? 0,
                },
                { key: 'A_VENIR', label: 'À venir', value: conv.A_VENIR ?? 0 },
              ]}
              empty="Aucune convention pour l’instant."
            />
          }
          main={
            <DonutCard
              title="Financement"
              subtitle="Statut des dossiers, calculé à partir des accords"
              totalLabel="dossiers"
              loading={cases.isLoading}
              slices={[
                {
                  key: 'FUNDED',
                  label: 'Financés',
                  value: allCases.filter((c) => c.statut === 'FUNDED').length,
                },
                {
                  key: 'PARTIALLY_FUNDED',
                  label: 'En partie',
                  value: allCases.filter((c) => c.statut === 'PARTIALLY_FUNDED')
                    .length,
                },
                {
                  key: 'PENDING',
                  label: 'Accord en attente',
                  value: allCases.filter((c) => c.statut === 'PENDING').length,
                },
                {
                  key: 'UNFUNDED',
                  label: 'Non financés',
                  value: allCases.filter((c) => c.statut === 'UNFUNDED').length,
                },
              ]}
              empty={
                funding
                  ? 'Aucun dossier de financement ouvert.'
                  : 'Le module Financement n’est pas accessible à ce compte.'
              }
            />
          }
        />
      }
      alerts={{
        subtitle: 'Conventions en retard, démarches de financement',
        items: alerts,
        loading: summary.isLoading,
        empty: 'Rien à traiter côté clients et financement.',
      }}
      figures={figures}
    />
  );
}
