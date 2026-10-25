'use client';

// Page de la section « Qualiopi » : état du moteur sur les 32 indicateurs, preuves, constats, audits internes et
// actions correctives. Les états sont ceux calculés par le moteur (/qualiopi/evaluations) ; la page les compte.
import {
  ClipboardCheck,
  FileCheck2,
  ListChecks,
  ShieldAlert,
  Wrench,
} from 'lucide-react';
import { formatDate } from '@/lib/format';
import { useAudits } from '@/lib/gsms/audits';
import { useCapaActions, useOpenFindings } from '@/lib/gsms/capa';
import { useCarnet } from '@/lib/gsms/carnet';
import { useEvaluations, useFindings } from '@/lib/gsms/evaluations';
import { READINESS } from '@/lib/gsms/labels';
import { useEvidenceList } from '@/lib/gsms/preuves';
import type { ReadinessStatus } from '@/lib/gsms/types';
import { countIn, monthWindow } from '@/lib/months';
import { useCan } from '@/lib/permissions';
import type { AlertItem } from '@/components/page/alert-list-card';
import { DonutCard, EvolutionCard } from '@/components/page/chart-cards';
import { EngineCard } from '@/components/page/engine-card';
import { LandingRow } from '@/components/page/section-card';
import {
  SectionLanding,
  type ModuleFigures,
} from '@/components/page/section-landing';

const OPEN_CAPA = new Set(['OUVERTE', 'EN_COURS', 'A_VERIFIER']);

// Couleur de chaque état dans le donut, dans l'ordre « ce qui demande une action d'abord ».
const STATES: { etat: ReadinessStatus; color: string }[] = [
  { etat: 'PREUVES_INSUFFISANTES', color: 'var(--color-rose-500)' },
  { etat: 'A_RISQUE', color: 'var(--color-amber-500)' },
  { etat: 'NON_EVALUABLE', color: 'var(--color-sky-500)' },
  { etat: 'NON_EVALUE', color: 'var(--color-slate-400)' },
  { etat: 'DEMONTRABLE', color: 'var(--color-emerald-500)' },
  { etat: 'NON_APPLICABLE', color: 'var(--color-slate-300)' },
];

const TO_ACT: ReadinessStatus[] = [
  'PREUVES_INSUFFISANTES',
  'A_RISQUE',
  'NON_EVALUABLE',
];

export default function QualiopiSectionPage() {
  const quality = useCan()('read_quality');
  const evaluations = useEvaluations();
  const findings = useFindings();
  const open = useOpenFindings(quality);
  const actions = useCapaActions(quality);
  const audits = useAudits();
  const evidence = useEvidenceList({ statut: [] });
  const carnet = useCarnet(undefined, quality);

  const indicateurs = evaluations.data?.indicateurs ?? [];
  const count = (etat: ReadinessStatus) =>
    indicateurs.filter((i) => i.etat === etat).length;
  const applicable = indicateurs.length - count('NON_APPLICABLE');
  const demonstrable = count('DEMONTRABLE');
  const toAct = indicateurs
    .filter((i) => TO_ACT.includes(i.etat))
    .sort(
      (a, b) =>
        TO_ACT.indexOf(a.etat) - TO_ACT.indexOf(b.etat) || a.numero - b.numero,
    )
    .map((i) => i.numero);

  const parStatut = evidence.data?.par_statut ?? [];
  const usable = parStatut
    .filter((s) => s.statut === 'EXPLOITABLE' || s.statut === 'VALIDEE')
    .reduce((sum, s) => sum + s.nombre, 0);
  const evidenceTotal = parStatut
    .filter((s) => s.statut !== 'RETIREE')
    .reduce((sum, s) => sum + s.nombre, 0);

  const allActions = actions.data ?? [];
  const openActions = allActions.filter((a) => OPEN_CAPA.has(a.statut));
  const late = openActions.filter((a) => a.en_retard);
  const allAudits = audits.data?.audits ?? [];
  const running = allAudits.filter((a) => a.statut === 'EN_COURS').length;

  const allFindings = findings.data ?? [];
  const points = monthWindow(-11, 12).map(({ key, period }) => ({
    period,
    releves: countIn(
      allFindings.map((f) => f.constate_le),
      key,
    ),
    resolus: countIn(
      allFindings.map((f) => f.resolu_le),
      key,
    ),
  }));

  const alerts: AlertItem[] = [
    ...late.map((a) => ({
      id: `capa-${a.id}`,
      title: a.titre,
      subtitle: `${a.reference} · action corrective en retard`,
      when: formatDate(a.echeance),
      tone: 'danger' as const,
      href: '/qualiopi/capa',
    })),
    ...(open.data ?? []).map((f) => ({
      id: `ecart-${f.id}`,
      title: f.titre,
      subtitle: [`Indicateur ${f.indicateur}`, f.session, 'écart ouvert']
        .filter(Boolean)
        .join(' · '),
      when: formatDate(f.constate_le),
      tone: 'warning' as const,
      href: '/qualiopi/capa',
    })),
  ];

  const last = evaluations.data?.derniere;
  const figures: ModuleFigures = {
    indicateurs: {
      loading: evaluations.isLoading,
      list: [
        { label: 'Indicateurs', value: indicateurs.length },
        { label: 'Sans objet', value: count('NON_APPLICABLE') },
      ],
    },
    carnet: {
      loading: evaluations.isLoading,
      list: [
        { label: 'Démontrables', value: demonstrable },
        { label: 'À traiter', value: toAct.length },
      ],
    },
    preuves: {
      loading: evidence.isLoading,
      list: [
        { label: 'Preuves', value: evidenceTotal },
        { label: 'Exploitables', value: usable },
      ],
    },
    evaluations: {
      loading: evaluations.isLoading,
      list: [
        { label: 'Contrôles', value: last?.resultats ?? '—' },
        {
          label: 'Dernière passe',
          value: last?.fin ? formatDate(last.fin, 'd MMM') : '—',
        },
      ],
    },
    audits: {
      loading: audits.isLoading,
      list: [
        { label: 'En cours', value: running },
        { label: 'Clos', value: allAudits.length - running },
      ],
    },
    capa: {
      loading: actions.isLoading,
      list: [
        { label: 'Ouvertes', value: openActions.length },
        { label: 'En retard', value: late.length },
      ],
    },
  };

  return (
    <SectionLanding
      sectionId="qualiopi"
      description="Ce que le moteur conclut des preuves enregistrées, indicateur par indicateur, avec les écarts, les audits internes et les actions correctives. Seul l’organisme certificateur décide de la conformité."
      error={evaluations.error}
      kpiLoading={evaluations.isLoading}
      kpis={[
        {
          label: 'Indicateurs démontrables',
          value: `${demonstrable} / ${applicable}`,
          subtitle: 'selon les preuves enregistrées',
          icon: ListChecks,
        },
        {
          label: 'Preuves exploitables',
          value: usable,
          subtitle: `sur ${evidenceTotal} preuve${evidenceTotal > 1 ? 's' : ''}`,
          icon: FileCheck2,
        },
        {
          label: 'Écarts ouverts',
          value: open.data?.length ?? 0,
          subtitle: 'constats non clos',
          icon: ShieldAlert,
        },
        {
          label: 'Actions en retard',
          value: late.length,
          subtitle: `sur ${openActions.length} action${openActions.length > 1 ? 's' : ''} ouverte${openActions.length > 1 ? 's' : ''}`,
          icon: Wrench,
        },
        {
          label: 'Audits en cours',
          value: running,
          subtitle: `${allAudits.length} audit${allAudits.length > 1 ? 's' : ''} interne${allAudits.length > 1 ? 's' : ''} au total`,
          icon: ClipboardCheck,
        },
      ]}
      charts={
        <LandingRow
          side={
            <DonutCard
              title="Indicateurs par état"
              subtitle="État calculé par le moteur"
              totalLabel="indicateurs"
              loading={evaluations.isLoading}
              slices={STATES.map((s) => ({
                key: s.etat,
                label: READINESS[s.etat].label,
                value: count(s.etat),
                color: s.color,
              }))}
              empty="Aucune évaluation pour l’instant."
            />
          }
          main={
            <EvolutionCard
              title="Constats par mois"
              subtitle="Écarts relevés et résolus, 12 derniers mois"
              series={[
                { key: 'releves', label: 'Relevés' },
                { key: 'resolus', label: 'Résolus' },
              ]}
              points={points}
              loading={findings.isLoading}
              empty="Aucun constat sur les douze derniers mois."
            />
          }
        />
      }
      alerts={{
        subtitle: 'Actions en retard et écarts ouverts',
        items: alerts,
        loading: open.isLoading || actions.isLoading,
        empty: 'Aucun écart ouvert ni action en retard.',
      }}
      engine={
        <EngineCard
          indicators={toAct}
          subtitle="Indicateurs qui demandent une action, le plus urgent d’abord"
          fiches={carnet.data?.fiches ?? []}
          quality={quality}
          loading={carnet.isLoading || evaluations.isLoading}
        />
      }
      figures={figures}
    />
  );
}
