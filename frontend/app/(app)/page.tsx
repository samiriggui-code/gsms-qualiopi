'use client';

// Tableau de bord : préparation Qualiopi par critère, écarts et actions correctives, sessions à venir,
// échéances des sessions et habilitations des formateurs. Tous les états viennent de l'API ; la page
// ne fait que les compter et les ranger.
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowUpRight,
  BookOpenCheck,
  CalendarDays,
  ClipboardList,
  Home,
  ListChecks,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { formatDate, formatDateRange, percent } from '@/lib/format';
import { useCapaActions, useOpenFindings } from '@/lib/gsms/capa';
import { useCarnet, type CarnetFiche } from '@/lib/gsms/carnet';
import { useMilestones, useQualificationDeadlines } from '@/lib/gsms/dashboard';
import {
  MILESTONE,
  QUALIFICATION_DEADLINE,
  SESSION_STATUS,
} from '@/lib/gsms/labels';
import { useSessions } from '@/lib/gsms/sessions';
import { useCan } from '@/lib/permissions';
import { CRITERION_ICONS } from '@/lib/qualiopi/criteres';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardHeading,
  CardTitle,
  CardToolbar,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Refusal } from '@/components/gsms/refusal';
import { Content } from '@/components/layout/components/content';
import { ContentHeader } from '@/components/layout/components/content-header';

const ACTIVE_SESSIONS = new Set(['PLANIFIEE', 'CONFIRMEE', 'EN_COURS']);
const OPEN_CAPA = new Set(['OUVERTE', 'EN_COURS', 'A_VERIFIER']);
const counted = (f: CarnetFiche) =>
  f.etat !== 'NON_APPLICABLE' && f.etat !== 'A_VENIR';

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  href,
  loading,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number | undefined;
  hint?: string;
  href: string;
  loading: boolean;
}) {
  return (
    <Card className="shadow-none">
      <Link
        href={href}
        className="flex items-center gap-3.5 p-4 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl transition-colors"
      >
        <div className="flex items-center justify-center size-10 shrink-0 bg-gray-100 dark:bg-gray-800 rounded-lg">
          <Icon className="size-5 text-gray-700 dark:text-white" />
        </div>
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-xs text-muted-foreground">{label}</span>
          {loading ? (
            <Skeleton className="h-6 w-16" />
          ) : (
            <span className="text-xl font-semibold text-foreground leading-none">
              {value ?? '—'}
            </span>
          )}
          {hint && !loading && (
            <span className="text-xs text-muted-foreground truncate">
              {hint}
            </span>
          )}
        </div>
      </Link>
    </Card>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground py-2">{children}</p>;
}

function CriteriaCard({ fiches }: { fiches: CarnetFiche[] }) {
  const numbers = Array.from(new Set(fiches.map((f) => f.critere.numero))).sort(
    (a, b) => a - b,
  );
  return (
    <div className="flex flex-col gap-4">
      {numbers.map((n) => {
        const items = fiches.filter((f) => f.critere.numero === n);
        const applicable = items.filter(counted);
        const ok = applicable.filter((f) => f.etat === 'DEMONTRABLE').length;
        const ecarts = items.reduce((sum, f) => sum + f.ecarts.length, 0);
        const Icon = CRITERION_ICONS[n] ?? ClipboardList;
        return (
          <Link
            key={n}
            href="/qualiopi/referentiel"
            className="flex items-center gap-3 group"
          >
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <div className="flex flex-col gap-1.5 grow min-w-0">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium text-foreground truncate group-hover:text-primary">
                  {items[0]?.critere.nom ?? `Critère ${n}`}
                </span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {ok}/{applicable.length}
                  {ecarts > 0 && ` · ${ecarts} écart${ecarts > 1 ? 's' : ''}`}
                </span>
              </div>
              <Progress
                value={percent(ok, applicable.length)}
                indicatorClassName={
                  ok === applicable.length ? 'bg-green-500' : 'bg-primary'
                }
              />
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export default function TableauDeBordPage() {
  const can = useCan();
  const quality = can('read_quality');
  const staff = can('read_staff');

  const carnet = useCarnet(undefined, quality);
  const findings = useOpenFindings(quality);
  const actions = useCapaActions(quality);
  const milestones = useMilestones(15, quality);
  const sessions = useSessions();
  const titles = useQualificationDeadlines(staff);

  const fiches = carnet.data?.fiches ?? [];
  const applicable = fiches.filter(counted);
  const demonstrable = applicable.filter((f) => f.etat === 'DEMONTRABLE');
  const majors = (findings.data ?? []).filter((f) => f.gravite === 'majeure');
  const openActions = (actions.data ?? []).filter((a) =>
    OPEN_CAPA.has(a.statut),
  );
  const lateActions = openActions.filter((a) => a.en_retard);
  const upcoming = (sessions.data ?? [])
    .filter((s) => ACTIVE_SESSIONS.has(s.status))
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const late = (milestones.data ?? []).filter((m) => m.status === 'EN_RETARD');

  return (
    <>
      <ContentHeader>
        <h1 className="inline-flex items-center gap-2.5 text-sm font-semibold">
          <Home className="size-4 text-primary" />
          Tableau de bord
        </h1>
        {quality && (
          <Button size="sm" variant="outline" asChild>
            <Link href="/qualiopi/carnet">
              <BookOpenCheck /> Carnet d’audit
            </Link>
          </Button>
        )}
      </ContentHeader>
      <Content className="block">
        <div className="container-fluid space-y-5">
          <Refusal error={carnet.error ?? sessions.error} />

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {quality && (
              <StatCard
                icon={ListChecks}
                label="Indicateurs démontrables"
                value={
                  carnet.data
                    ? `${demonstrable.length}/${applicable.length}`
                    : undefined
                }
                hint={
                  carnet.data
                    ? `${percent(demonstrable.length, applicable.length)} % des indicateurs applicables`
                    : undefined
                }
                href="/qualiopi/referentiel"
                loading={carnet.isLoading}
              />
            )}
            {quality && (
              <StatCard
                icon={AlertTriangle}
                label="Écarts ouverts"
                value={findings.data?.length}
                hint={
                  findings.data
                    ? `dont ${majors.length} majeur${majors.length > 1 ? 's' : ''}`
                    : undefined
                }
                href="/qualiopi/capa"
                loading={findings.isLoading}
              />
            )}
            {quality && (
              <StatCard
                icon={Wrench}
                label="Actions correctives en retard"
                value={actions.data ? lateActions.length : undefined}
                hint={
                  actions.data
                    ? `${openActions.length} action${openActions.length > 1 ? 's' : ''} en cours`
                    : undefined
                }
                href="/qualiopi/capa"
                loading={actions.isLoading}
              />
            )}
            <StatCard
              icon={CalendarDays}
              label="Sessions à venir ou en cours"
              value={sessions.data ? upcoming.length : undefined}
              hint={
                sessions.data
                  ? `${upcoming.filter((s) => s.status === 'EN_COURS').length} en cours`
                  : undefined
              }
              href="/formation/sessions"
              loading={sessions.isLoading}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {quality && (
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardHeading>
                    <CardTitle>Préparation par critère</CardTitle>
                  </CardHeading>
                  <CardToolbar>
                    <Button size="sm" variant="ghost" asChild>
                      <Link href="/qualiopi/referentiel">
                        Indicateurs <ArrowUpRight />
                      </Link>
                    </Button>
                  </CardToolbar>
                </CardHeader>
                <CardContent className="space-y-4">
                  {carnet.isLoading ? (
                    Array.from({ length: 7 }).map((_, i) => (
                      <Skeleton key={i} className="h-8" />
                    ))
                  ) : (
                    <CriteriaCard fiches={fiches} />
                  )}
                  {carnet.data && (
                    <p className="text-xs text-muted-foreground">
                      {carnet.data.avertissement}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            <Card className={quality ? '' : 'lg:col-span-3'}>
              <CardHeader>
                <CardHeading>
                  <CardTitle>Sessions à venir</CardTitle>
                </CardHeading>
                <CardToolbar>
                  <Button size="sm" variant="ghost" asChild>
                    <Link href="/formation/sessions">
                      Toutes <ArrowUpRight />
                    </Link>
                  </Button>
                </CardToolbar>
              </CardHeader>
              <CardContent className="flex flex-col gap-1">
                {sessions.isLoading &&
                  Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-12" />
                  ))}
                {sessions.data && upcoming.length === 0 && (
                  <EmptyLine>Aucune session planifiée.</EmptyLine>
                )}
                {upcoming.slice(0, 6).map((s) => (
                  <Link
                    key={s.id}
                    href={`/formation/sessions/${s.id}`}
                    className="flex items-center justify-between gap-3 rounded-md px-2 py-2 -mx-2 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium text-foreground truncate">
                        {s.reference}
                      </span>
                      <span className="text-xs text-muted-foreground truncate">
                        {formatDateRange(s.start_date, s.end_date)}
                        {s.location && ` · ${s.location}`} · {s.learners_count}
                        {s.capacity ? `/${s.capacity}` : ''} inscrits
                      </span>
                    </div>
                    <Badge className={SESSION_STATUS[s.status].color}>
                      {SESSION_STATUS[s.status].label}
                    </Badge>
                  </Link>
                ))}
              </CardContent>
            </Card>

            {quality && (
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardHeading>
                    <CardTitle>
                      Échéances des sessions{' '}
                      <span className="text-sm font-normal text-muted-foreground">
                        · 15 prochains jours et retards
                      </span>
                    </CardTitle>
                  </CardHeading>
                  {milestones.data && late.length > 0 && (
                    <CardToolbar>
                      <Badge className={MILESTONE.EN_RETARD.color}>
                        {late.length} en retard
                      </Badge>
                    </CardToolbar>
                  )}
                </CardHeader>
                <CardContent className="flex flex-col gap-1">
                  <Refusal error={milestones.error} />
                  {milestones.isLoading &&
                    Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-12" />
                    ))}
                  {milestones.data?.length === 0 && (
                    <EmptyLine>Aucune échéance dans les 15 jours.</EmptyLine>
                  )}
                  {milestones.data?.slice(0, 8).map((m) => (
                    <Link
                      key={`${m.session_id}-${m.key}`}
                      href={`/formation/sessions/${m.session_id}`}
                      className="flex items-center justify-between gap-3 rounded-md px-2 py-2 -mx-2 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-medium text-foreground truncate">
                          {m.label}
                          <span className="font-normal text-muted-foreground">
                            {' '}
                            · {m.session}
                          </span>
                        </span>
                        <span className="text-xs text-muted-foreground truncate">
                          {formatDate(m.due_on)} · {m.done}/{m.total}
                          {m.missing.length > 0 &&
                            ` · manque ${m.missing.map((x) => x.who).join(', ')}`}
                        </span>
                      </div>
                      <Badge className={MILESTONE[m.status]?.color}>
                        {MILESTONE[m.status]?.label ?? m.status}
                      </Badge>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            )}

            {staff && (
              <Card className={quality ? '' : 'lg:col-span-3'}>
                <CardHeader>
                  <CardHeading>
                    <CardTitle>Habilitations à renouveler</CardTitle>
                  </CardHeading>
                  <CardToolbar>
                    <Button size="sm" variant="ghost" asChild>
                      <Link href="/rh/qualifications">
                        <ShieldCheck /> Toutes
                      </Link>
                    </Button>
                  </CardToolbar>
                </CardHeader>
                <CardContent className="flex flex-col gap-1">
                  <Refusal error={titles.error} />
                  {titles.isLoading &&
                    Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-12" />
                    ))}
                  {titles.data?.length === 0 && (
                    <EmptyLine>
                      Aucun titre n’expire dans les 90 jours.
                    </EmptyLine>
                  )}
                  {titles.data?.map((q) => (
                    <div
                      key={`${q.formateur_id}-${q.libelle}-${q.fin}`}
                      className="flex items-center justify-between gap-3 py-2"
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-medium text-foreground truncate">
                          {q.libelle}
                        </span>
                        <span className="text-xs text-muted-foreground truncate">
                          {q.formateur} · fin le {formatDate(q.fin)}
                        </span>
                      </div>
                      <Badge className={QUALIFICATION_DEADLINE[q.etat]?.color}>
                        {QUALIFICATION_DEADLINE[q.etat]?.label ?? q.etat}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </Content>
    </>
  );
}
