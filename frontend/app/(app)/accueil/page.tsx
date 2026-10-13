'use client';

// Accueil global (niveau 0, au-dessus des sections, comme l'accueil de GSMS School) : ce qui demande de
// l'attention, la prochaine session, puis une carte par section du menu. Chaque carte liste les modules de
// la section et dit, pour les indicateurs qu'elle alimente, ce que le moteur Qualiopi en conclut.
// La page compte et range ce que l'API renvoie ; elle ne décide d'aucun état.
import Link from 'next/link';
import {
  BellRing,
  CalendarDays,
  House,
  ListChecks,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import { MAIN_NAV } from '@/config/menu.config';
import type { NavSection } from '@/config/types';
import { formatDate, formatDateRange } from '@/lib/format';
import { useCapaActions, useOpenFindings } from '@/lib/gsms/capa';
import { useCarnet, type CarnetFiche } from '@/lib/gsms/carnet';
import { useMilestones, useQualificationDeadlines } from '@/lib/gsms/dashboard';
import { useSessions } from '@/lib/gsms/sessions';
import { useBootstrap } from '@/lib/gsms/settings';
import { useCan } from '@/lib/permissions';
import { ROLE_LABELS } from '@/lib/session';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Refusal } from '@/components/gsms/refusal';
import { Content } from '@/components/layout/components/content';
import { ContentHeader } from '@/components/layout/components/content-header';
import {
  AlertListCard,
  type AlertItem,
} from '@/components/page/alert-list-card';
import {
  EngineStates,
  sectionIndicators,
} from '@/components/page/engine-states';
import { KpiRow } from '@/components/page/kpi-row';
import { PageHero } from '@/components/page/page-hero';
import { LandingRow } from '@/components/page/section-card';
import { WelcomeCallout } from '@/components/page/welcome-callout';

const ACTIVE_SESSIONS = new Set(['PLANIFIEE', 'CONFIRMEE', 'EN_COURS']);
const OPEN_CAPA = new Set(['OUVERTE', 'EN_COURS', 'A_VERIFIER']);

// Couleur de chaque carte de section : mêmes teintes que les tuiles KPI des modèles de page.
const TINTS = [
  'bg-sky-500/15 border-sky-500/25 text-sky-700 dark:text-sky-300',
  'bg-emerald-500/15 border-emerald-500/25 text-emerald-700 dark:text-emerald-300',
  'bg-amber-500/15 border-amber-500/25 text-amber-700 dark:text-amber-300',
  'bg-violet-500/15 border-violet-500/25 text-violet-700 dark:text-violet-300',
  'bg-rose-500/15 border-rose-500/25 text-rose-700 dark:text-rose-300',
] as const;

const SECTIONS = MAIN_NAV.filter((s) => s.title);

function SectionTile({
  section,
  tint,
  fiches,
  quality,
  loading,
}: {
  section: NavSection;
  tint: string;
  fiches: CarnetFiche[];
  quality: boolean;
  loading: boolean;
}) {
  const Icon = section.icon ?? House;
  const first = section.items[0];
  const target = section.path
    ? { href: section.path, label: 'Ouvrir la section' }
    : first && { href: first.path, label: `Ouvrir ${first.title}` };

  return (
    <Card className="h-full min-w-0 rounded-xl shadow-xs">
      <CardContent className="flex h-full flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <span
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-lg border',
              tint,
            )}
          >
            <Icon className="size-5" />
          </span>
          <Badge variant="outline" className="font-bold uppercase">
            {section.items.length}{' '}
            {section.items.length > 1 ? 'modules' : 'module'}
          </Badge>
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-foreground">
            {section.title}
          </h3>
          {section.description && (
            <p className="text-sm text-muted-foreground">
              {section.description}
            </p>
          )}
        </div>
        <ul className="grid gap-1 text-sm">
          {section.items.map((item) => (
            <li key={item.id}>
              <Link
                href={item.path}
                className="flex items-center gap-2 text-secondary-foreground hover:text-primary"
              >
                {item.icon && <item.icon className="size-3.5 shrink-0" />}
                <span className="truncate">{item.title}</span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-auto space-y-2 border-t border-dashed pt-3">
          <EngineStates
            indicators={sectionIndicators(section)}
            fiches={fiches}
            quality={quality}
            loading={loading}
          />
        </div>
      </CardContent>
      {target && (
        <CardFooter className="border-t border-dashed px-5 py-3">
          <Button variant="outline" size="sm" className="w-full" asChild>
            <Link href={target.href}>{target.label}</Link>
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

export default function AccueilPage() {
  const can = useCan();
  const quality = can('read_quality');
  const staff = can('read_staff');

  const boot = useBootstrap();
  const carnet = useCarnet(undefined, quality);
  const findings = useOpenFindings(quality);
  const actions = useCapaActions(quality);
  const milestones = useMilestones(15, quality);
  const sessions = useSessions();
  const titles = useQualificationDeadlines(staff);

  const fiches = carnet.data?.fiches ?? [];
  const applicable = fiches.filter(
    (f) => f.etat !== 'NON_APPLICABLE' && f.etat !== 'A_VENIR',
  );
  const demonstrable = applicable.filter((f) => f.etat === 'DEMONTRABLE');
  const upcoming = (sessions.data ?? [])
    .filter((s) => ACTIVE_SESSIONS.has(s.status))
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const next = upcoming[0];
  const lateMilestones = (milestones.data ?? []).filter(
    (m) => m.status === 'EN_RETARD',
  );
  const lateActions = (actions.data ?? []).filter(
    (a) => OPEN_CAPA.has(a.statut) && a.en_retard,
  );

  const alerts: AlertItem[] = [
    ...lateActions.map((a) => ({
      id: `capa-${a.id}`,
      title: a.titre,
      subtitle: `${a.reference} · action corrective en retard`,
      when: formatDate(a.echeance),
      tone: 'danger' as const,
      href: '/qualiopi/capa',
    })),
    ...lateMilestones.map((m) => ({
      id: `ech-${m.session_id}-${m.key}`,
      title: m.label,
      subtitle: `${m.session} · ${m.done}/${m.total}`,
      when: formatDate(m.due_on),
      tone: 'danger' as const,
      href: `/formation/sessions/${m.session_id}`,
    })),
    ...(titles.data ?? []).map((t) => ({
      id: `rh-${t.formateur_id}-${t.type}`,
      title: `${t.formateur} · ${t.libelle}`,
      subtitle: 'Habilitation à renouveler',
      when: formatDate(t.fin),
      tone: 'warning' as const,
      href: '/rh/qualifications',
    })),
  ];

  const role = boot.data?.user.roles.map((r) => ROLE_LABELS[r] ?? r).join(', ');

  return (
    <>
      <ContentHeader>
        <h1 className="inline-flex items-center gap-2.5 text-sm font-semibold">
          <House className="size-4 text-primary" />
          Accueil
        </h1>
      </ContentHeader>
      <Content className="block">
        <div className="container-fluid space-y-5">
          <PageHero
            eyebrow="Accueil"
            icon={House}
            title="Vue d’ensemble"
            description="Ce qui demande votre attention aujourd’hui, puis l’accès à chaque section. Les états affichés sont ceux calculés par le moteur Qualiopi à partir des preuves enregistrées."
          />
          <Refusal error={sessions.error ?? carnet.error} />

          <KpiRow
            loading={sessions.isLoading || (quality && carnet.isLoading)}
            items={[
              {
                label: 'Sessions à venir',
                value: upcoming.length,
                subtitle: 'planifiées, confirmées ou en cours',
                icon: CalendarDays,
              },
              ...(quality
                ? [
                    {
                      label: 'Indicateurs démontrables',
                      value: `${demonstrable.length} / ${applicable.length}`,
                      subtitle: 'selon les preuves enregistrées',
                      icon: ListChecks,
                    },
                    {
                      label: 'Écarts ouverts',
                      value: findings.data?.length ?? 0,
                      subtitle: 'constats d’audit non clos',
                      icon: ShieldCheck,
                    },
                    {
                      label: 'Actions en retard',
                      value: lateActions.length,
                      subtitle: 'actions correctives échues',
                      icon: Wrench,
                    },
                  ]
                : []),
            ]}
          />

          <LandingRow
            side={
              <AlertListCard
                title="À surveiller"
                subtitle="Retards et habilitations à renouveler"
                icon={BellRing}
                loading={
                  (quality && (milestones.isLoading || actions.isLoading)) ||
                  (staff && titles.isLoading)
                }
                items={alerts}
                empty="Rien en retard pour l’instant."
              />
            }
            main={
              <WelcomeCallout
                icon={House}
                organization={boot.data?.organization?.name}
                person={boot.data?.user.full_name}
                role={role}
                module="GSMS Qualiopi"
                description={
                  next ? (
                    <>
                      Prochaine session :{' '}
                      <Link
                        href={`/formation/sessions/${next.id}`}
                        className="font-medium text-foreground hover:text-primary"
                      >
                        {next.program_title ?? next.reference}
                      </Link>
                      , {formatDateRange(next.start_date, next.end_date)}
                      {next.location ? ` à ${next.location}` : ''}.
                    </>
                  ) : sessions.isLoading ? (
                    'Chargement des sessions…'
                  ) : (
                    'Aucune session planifiée pour l’instant.'
                  )
                }
                footerLabel="Sessions à venir"
                footerValue={sessions.isLoading ? '…' : String(upcoming.length)}
                cta={{
                  label: 'Voir les sessions',
                  href: '/formation/sessions',
                }}
              />
            }
          />

          <div className="space-y-1 pt-2">
            <h2 className="text-lg font-semibold text-foreground">
              Accès rapide aux sections
            </h2>
            <p className="text-sm text-muted-foreground">
              Une carte par section du menu, avec ses modules et les indicateurs
              Qualiopi qu’elle alimente.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {SECTIONS.map((section, i) => (
              <SectionTile
                key={section.id}
                section={section}
                tint={TINTS[i % TINTS.length]}
                fiches={fiches}
                quality={quality}
                loading={carnet.isLoading}
              />
            ))}
          </div>
        </div>
      </Content>
    </>
  );
}
