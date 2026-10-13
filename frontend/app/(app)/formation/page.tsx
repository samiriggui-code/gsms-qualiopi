'use client';

// Page de la section « Offre de formation » (niveau 1, entre l'accueil global et les modules, comme les pages
// d'atterrissage de GSMS School) : chiffres de l'offre, sessions par statut et par mois, points à traiter,
// ce que le moteur Qualiopi conclut des indicateurs de la section, puis une carte par module.
// Tout vient de l'API (catalogue, sessions, résultats, lieux, équipements, carnet) ; la page compte et range.
import Link from 'next/link';
import { addMonths, format, startOfMonth } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  BellRing,
  BookOpen,
  CalendarDays,
  FileCheck2,
  GraduationCap,
  Library,
  ListChecks,
  Scale,
} from 'lucide-react';
import { MAIN_NAV } from '@/config/menu.config';
import { formatDate } from '@/lib/format';
import { useCarnet, type CarnetFiche } from '@/lib/gsms/carnet';
import { useCatalogue } from '@/lib/gsms/catalogue';
import { useEstablishment } from '@/lib/gsms/edof';
import { READINESS, SESSION_STATUS } from '@/lib/gsms/labels';
import { useResults } from '@/lib/gsms/offre';
import { useSessions } from '@/lib/gsms/sessions';
import type { SessionStatus } from '@/lib/gsms/types';
import { useCan } from '@/lib/permissions';
import { useResourceList, type Row } from '@/lib/resource';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Refusal } from '@/components/gsms/refusal';
import { Content } from '@/components/layout/components/content';
import { ContentHeader } from '@/components/layout/components/content-header';
import {
  AlertListCard,
  type AlertItem,
} from '@/components/page/alert-list-card';
import { DonutCard, EvolutionCard } from '@/components/page/chart-cards';
import { sectionIndicators } from '@/components/page/engine-states';
import { KpiRow } from '@/components/page/kpi-row';
import { ModuleCard, type ModuleFigure } from '@/components/page/module-card';
import { PageHero } from '@/components/page/page-hero';
import {
  LandingRow,
  SectionCard,
  SectionEmpty,
} from '@/components/page/section-card';

const SECTION = MAIN_NAV.find((s) => s.id === 'formation')!;
const INDICATORS = sectionIndicators(SECTION);

// Mêmes teintes que les cartes de l'accueil global.
const TINTS = [
  'bg-sky-500/15 border-sky-500/25 text-sky-700 dark:text-sky-300',
  'bg-emerald-500/15 border-emerald-500/25 text-emerald-700 dark:text-emerald-300',
  'bg-amber-500/15 border-amber-500/25 text-amber-700 dark:text-amber-300',
  'bg-violet-500/15 border-violet-500/25 text-violet-700 dark:text-violet-300',
  'bg-rose-500/15 border-rose-500/25 text-rose-700 dark:text-rose-300',
] as const;

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

function EngineCard({
  fiches,
  quality,
  loading,
}: {
  fiches: CarnetFiche[];
  quality: boolean;
  loading: boolean;
}) {
  const rows = INDICATORS.map((n) => ({
    n,
    fiche: fiches.find((f) => f.numero === n),
  }));
  return (
    <SectionCard
      title="Moteur Qualiopi"
      subtitle="Indicateurs alimentés par cette section, état calculé à partir des preuves"
      icon={ListChecks}
      count={INDICATORS.length}
      contentClassName="p-0"
    >
      {!quality ? (
        <SectionEmpty icon={ListChecks}>
          Les états du moteur sont réservés aux personnes qui ont accès à la
          qualité.
        </SectionEmpty>
      ) : loading ? (
        <div className="space-y-2 p-5">
          {INDICATORS.map((n) => (
            <Skeleton key={n} className="h-9 w-full" />
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-dashed">
          {rows.map(({ n, fiche }) => {
            const etat =
              fiche && fiche.etat !== 'A_VENIR' ? READINESS[fiche.etat] : null;
            return (
              <li key={n}>
                <Link
                  href={`/qualiopi/carnet?i=${n}`}
                  className="flex items-center gap-3 px-5 py-2.5 hover:bg-muted/40"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-xs font-bold tabular-nums">
                    {n}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {fiche?.nom ?? `Indicateur ${n}`}
                    </span>
                    {fiche && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {plural(
                          fiche.preuves.exploitables,
                          'preuve exploitable',
                          'preuves exploitables',
                        )}{' '}
                        sur {fiche.preuves.total}
                      </span>
                    )}
                  </span>
                  {etat ? (
                    <Badge size="sm" className={etat.color}>
                      {etat.label}
                    </Badge>
                  ) : (
                    <Badge size="sm" variant="outline">
                      À venir
                    </Badge>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

export default function OffreFormationPage() {
  const can = useCan();
  const quality = can('read_quality');
  const edof = can('read_edof');

  const catalogue = useCatalogue();
  const sessions = useSessions();
  const results = useResults(12);
  const premises = useResourceList<Premises>('premises');
  const equipment = useResourceList<Equipment>('equipment');
  const establishment = useEstablishment(edof);
  const carnet = useCarnet(undefined, quality);

  const fiches = carnet.data?.fiches ?? [];
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
  const first = addMonths(startOfMonth(new Date()), -5);
  const months = Array.from({ length: 12 }, (_, i) => addMonths(first, i));
  const points = months.map((m) => {
    const key = format(m, 'yyyy-MM');
    const inMonth = allSessions.filter(
      (s) => s.status !== 'ANNULEE' && s.start_date.startsWith(key),
    );
    return {
      period: format(m, 'MMM yy', { locale: fr }),
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

  const figures: Record<string, { loading: boolean; list: ModuleFigure[] }> = {
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
    <>
      <ContentHeader>
        <h1 className="inline-flex items-center gap-2.5 text-sm font-semibold">
          <GraduationCap className="size-4 text-primary" />
          Offre de formation
        </h1>
      </ContentHeader>
      <Content className="block">
        <div className="container-fluid space-y-5">
          <PageHero
            eyebrow="Section"
            icon={GraduationCap}
            title="Offre de formation"
            description="Les formations du catalogue, leurs sessions, leurs résultats et les moyens qui servent à les dispenser. Chaque carte ouvre le module correspondant."
          />
          <Refusal error={catalogue.error ?? sessions.error} />

          <KpiRow
            loading={catalogue.isLoading}
            items={[
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
                subtitle:
                  'relues et validées depuis leur dernière modification',
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
          />

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

          <LandingRow
            side={
              <AlertListCard
                title="À traiter"
                subtitle="Fiches, arbitrages, lieux et matériel"
                icon={BellRing}
                loading={
                  catalogue.isLoading ||
                  premises.isLoading ||
                  equipment.isLoading
                }
                items={alerts}
                max={5}
                empty="Rien à traiter dans l’offre pour l’instant."
              />
            }
            main={
              <EngineCard
                fiches={fiches}
                quality={quality}
                loading={carnet.isLoading}
              />
            }
          />

          <div className="space-y-1 pt-2">
            <h2 className="text-lg font-semibold text-foreground">
              Modules de la section
            </h2>
            <p className="text-sm text-muted-foreground">
              Une carte par module, avec ses chiffres et les indicateurs
              Qualiopi qu’il alimente.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {SECTION.items.map((item, i) => (
              <ModuleCard
                key={item.id}
                item={item}
                tint={TINTS[i % TINTS.length]}
                description={DESCRIPTIONS[item.id]}
                figures={figures[item.id]?.list ?? []}
                loading={figures[item.id]?.loading}
                fiches={fiches}
                quality={quality}
                carnetLoading={carnet.isLoading}
              />
            ))}
          </div>
        </div>
      </Content>
    </>
  );
}
