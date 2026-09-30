'use client';

// Vue d'ensemble de la fiche session : reprise de crm/company (company-records-overview-*) de la démo
// Metronic — Highlights, Activity, Notes, Tasks — avec les données réelles de la session.
import * as React from 'react';
import {
  differenceInCalendarDays,
  formatDistanceToNowStrict,
  parseISO,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  Activity,
  Calendar,
  CalendarCheck,
  ChevronRight,
  Clock,
  EllipsisVertical,
  LayoutDashboard,
  ListTodo,
  MapPin,
  ShieldCheck,
  TriangleAlert,
  User,
  Users,
} from 'lucide-react';
import { formatDate } from '@/lib/format';
import { MILESTONE, OWNER, PERIOD } from '@/lib/gsms/labels';
import {
  useAttendance,
  useDossier,
  useSessionActivity,
} from '@/lib/gsms/sessions';
import type { SessionActivity } from '@/lib/gsms/sessions';
import type { SessionRow } from '@/lib/gsms/types';
import { useCan } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardToolbar,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { IndicatorName } from '@/components/qualiopi/indicator-name';

type Tab = 'journey' | 'attendance' | 'qualiopi' | 'activity';

const initials = (name: string) =>
  name
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

const ago = (iso: string) =>
  formatDistanceToNowStrict(parseISO(iso), { addSuffix: true, locale: fr });

function SectionToggle({
  icon: Icon,
  children,
}: {
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <CollapsibleTrigger asChild>
      <Button
        size="sm"
        variant="ghost"
        className="text-sm text-semibold [&:not(:hover)[data-state=open]]:bg-transparent hover:bg-accent ps-1.5"
      >
        <Icon />
        {children}
        <ChevronRight className="[[data-state=open]_&]:rotate-90" />
      </Button>
    </CollapsibleTrigger>
  );
}

function HighlightCard({
  title,
  actions,
  children,
}: {
  title: string;
  actions: { label: string; icon: React.ElementType; onSelect: () => void }[];
  children: React.ReactNode;
}) {
  return (
    <Card className="w-72 max-sm:w-full shadow-none">
      <CardHeader className="p-2.5 py-0 min-h-10 border-0">
        <CardTitle className="text-2sm font-normal">{title}</CardTitle>
        <CardToolbar>
          <DropdownMenu>
            <DropdownMenuTrigger className="cursor-pointer" asChild>
              <Button
                variant="ghost"
                size="sm"
                mode="icon"
                aria-label={`Actions : ${title}`}
              >
                <EllipsisVertical className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="bottom">
              {actions.map((a) => (
                <DropdownMenuItem key={a.label} onSelect={a.onSelect}>
                  <a.icon className="size-3.5" />
                  <span>{a.label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </CardToolbar>
      </CardHeader>
      <CardContent className="px-2.5 pb-2.5 pt-1 space-y-2">
        {children}
      </CardContent>
    </Card>
  );
}

function Highlights({
  sessionId,
  session,
  onOpenTab,
}: {
  sessionId: string;
  session?: SessionRow;
  onOpenTab: (t: Tab) => void;
}) {
  const attendance = useAttendance(sessionId);
  const quality = useCan()('read_quality');
  const dossier = useDossier(sessionId, quality);
  const today = new Date().toISOString().slice(0, 10);
  const next = attendance.data?.demi_journees.find((d) => d.jour >= today);
  const summary = dossier.data?.summary;
  const nextMilestone = dossier.data?.echeancier.find(
    (m) => m.status !== 'FAIT' && m.status !== 'SANS_OBJET',
  );

  return (
    <div className="space-y-3.5">
      <h3 className="ms-1 flex items-center gap-1.5 text-sm font-semibold">
        <LayoutDashboard className="size-3.5 opacity-60" />
        Points clés
      </h3>
      <div className="flex gap-4 max-sm:flex-col">
        <HighlightCard
          title="Prochaine demi-journée"
          actions={[
            {
              label: 'Voir l’émargement',
              icon: CalendarCheck,
              onSelect: () => onOpenTab('attendance'),
            },
          ]}
        >
          {attendance.isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : next ? (
            <>
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <Calendar className="size-3.5 text-muted-foreground shrink-0" />
                {formatDate(next.jour)} · {PERIOD[next.periode]}
              </div>
              <div className="flex items-center gap-1.5">
                <MapPin className="size-3.5 text-muted-foreground shrink-0" />
                <span className="font-medium text-foreground truncate min-w-0">
                  {session?.location ?? 'Lieu à préciser'}
                </span>
              </div>
              {next.horaires && (
                <div className="flex items-center gap-1.5">
                  <Clock className="size-3.5 text-muted-foreground shrink-0" />
                  <Badge variant="success" appearance="light" size="sm">
                    {next.horaires}
                  </Badge>
                </div>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">
              {attendance.data?.demi_journees.length
                ? 'Toutes les demi-journées sont passées.'
                : 'Aucune demi-journée planifiée.'}
            </p>
          )}
        </HighlightCard>

        {quality && (
          <HighlightCard
            title="Préparation Qualiopi"
            actions={[
              {
                label: 'Voir le dossier Qualiopi',
                icon: ShieldCheck,
                onSelect: () => onOpenTab('qualiopi'),
              },
            ]}
          >
            {!summary ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <>
                <div className="inline-flex items-center gap-1.5">
                  <span
                    className={cn(
                      'rounded-full size-2 mx-0.5',
                      (summary.indicateurs.PREUVES_INSUFFISANTES ?? 0) > 0
                        ? 'bg-destructive'
                        : (summary.indicateurs.A_RISQUE ?? 0) > 0
                          ? 'bg-yellow-500'
                          : 'bg-green-500',
                    )}
                  />
                  <span className="font-semibold text-foreground">
                    {summary.indicateurs.DEMONTRABLE ?? 0} indicateur(s)
                    démontrable(s)
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <TriangleAlert className="size-3.5 text-muted-foreground shrink-0" />
                  <span className="font-medium text-foreground">
                    {summary.preuves_manquantes} preuve(s) manquante(s),{' '}
                    {summary.preuves_a_valider} à valider
                  </span>
                </div>
              </>
            )}
          </HighlightCard>
        )}

        {quality && (
          <HighlightCard
            title="Prochaine échéance"
            actions={[
              {
                label: 'Voir le dossier Qualiopi',
                icon: ShieldCheck,
                onSelect: () => onOpenTab('qualiopi'),
              },
            ]}
          >
            {!dossier.data ? (
              <Skeleton className="h-10 w-full" />
            ) : nextMilestone ? (
              <>
                <div className="font-semibold text-foreground">
                  {nextMilestone.label}
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge
                    className={MILESTONE[nextMilestone.status]?.color}
                    size="sm"
                  >
                    {MILESTONE[nextMilestone.status]?.label ??
                      nextMilestone.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(nextMilestone.due_on)} · {nextMilestone.done}/
                    {nextMilestone.total}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">
                Toutes les échéances sont tenues.
              </p>
            )}
          </HighlightCard>
        )}
      </div>
    </div>
  );
}

const PERIODS = { today: 0, week: 7, month: 31, year: 366 } as const;

export function ActivityList({ items }: { items: SessionActivity[] }) {
  if (!items.length)
    return (
      <p className="text-sm text-muted-foreground">Rien sur cette période.</p>
    );
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((a) => (
        <li key={a.id} className="flex items-center gap-1.5 text-sm">
          <Avatar className="size-6 shrink-0">
            <AvatarFallback className="text-[10px]">
              {initials(a.qui)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-wrap items-center gap-x-1 min-w-0">
            <span className="font-medium text-foreground">{a.qui}</span>
            <span className="text-muted-foreground">{a.action}</span>
            {a.stagiaire && (
              <span className="text-mono font-medium">{a.stagiaire}</span>
            )}
            {a.en_ligne && (
              <Badge variant="secondary" appearance="light" size="xs">
                en ligne
              </Badge>
            )}
          </div>
          <span className="ms-auto shrink-0 text-xs text-muted-foreground">
            {ago(a.le)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function RecentActivity({
  sessionId,
  onOpenTab,
}: {
  sessionId: string;
  onOpenTab: (t: Tab) => void;
}) {
  const [open, setOpen] = React.useState(true);
  const [period, setPeriod] = React.useState<keyof typeof PERIODS>('month');
  const { data, isLoading } = useSessionActivity(sessionId);
  const items = (data ?? []).filter(
    (a) =>
      differenceInCalendarDays(new Date(), parseISO(a.le)) <= PERIODS[period],
  );

  return (
    <Collapsible
      className="space-y-2 relative"
      open={open}
      onOpenChange={setOpen}
    >
      <div className="flex items-center justify-between gap-2.5">
        <SectionToggle icon={Activity}>Activité</SectionToggle>
      </div>
      <CollapsibleContent>
        <Tabs
          value={period}
          onValueChange={(v) => setPeriod(v as keyof typeof PERIODS)}
          className="text-sm text-muted-foreground end-0 top-0 absolute z-1"
        >
          <TabsList
            variant="button"
            size="xs"
            className="[&_button]:text-muted-foreground"
          >
            <TabsTrigger value="today">Aujourd’hui</TabsTrigger>
            <TabsTrigger value="week">Semaine</TabsTrigger>
            <TabsTrigger value="month">Mois</TabsTrigger>
            <TabsTrigger value="year">Année</TabsTrigger>
          </TabsList>
        </Tabs>
        <Card className="shadow-none">
          <CardContent className="space-y-3 p-3.5">
            {isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <ActivityList items={items.slice(0, 5)} />
            )}
            {items.length > 5 && (
              <div className="flex justify-start">
                <Button
                  mode="link"
                  underline="solid"
                  onClick={() => onOpenTab('activity')}
                >
                  Tout voir ({items.length})
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
}

function OpenFindings({
  sessionId,
  onOpenTab,
}: {
  sessionId: string;
  onOpenTab: (t: Tab) => void;
}) {
  const [open, setOpen] = React.useState(true);
  const { data } = useDossier(sessionId);
  const findings = (data?.findings ?? []).filter((f) => f.status !== 'CLOS');

  return (
    <Collapsible className="space-y-2" open={open} onOpenChange={setOpen}>
      <div className="flex items-center justify-between gap-2.5">
        <SectionToggle icon={TriangleAlert}>Écarts ouverts</SectionToggle>
      </div>
      <CollapsibleContent>
        <Card className="shadow-none">
          <CardContent className="space-y-3 p-3.5">
            {!data ? (
              <Skeleton className="h-16 w-full" />
            ) : findings.length ? (
              <ul className="flex flex-col gap-2.5">
                {findings.slice(0, 5).map((f) => (
                  <li key={f.id} className="flex items-center gap-2.5 text-sm">
                    <span className="text-muted-foreground shrink-0 max-lg:hidden">
                      <IndicatorName number={f.indicator} />
                    </span>
                    <span className="font-medium text-foreground truncate min-w-0">
                      {f.title.replace(/^I\d+ — /, '')}
                    </span>
                    <span className="text-muted-foreground truncate min-w-0 max-lg:hidden">
                      {f.explanation}
                    </span>
                    <Badge
                      variant={
                        f.severity === 'majeure' ? 'destructive' : 'warning'
                      }
                      appearance="light"
                      size="sm"
                      className="ms-auto shrink-0"
                    >
                      {f.severity}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Aucun écart ouvert sur cette session.
              </p>
            )}
            {findings.length > 0 && (
              <div className="flex justify-start">
                <Button
                  mode="link"
                  underline="solid"
                  onClick={() => onOpenTab('qualiopi')}
                >
                  Voir le dossier Qualiopi
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
}

function Milestones({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = React.useState(true);
  const { data } = useDossier(sessionId);
  const milestones = (data?.echeancier ?? []).filter(
    (m) => m.status !== 'SANS_OBJET',
  );

  return (
    <Collapsible className="space-y-2 mb-5" open={open} onOpenChange={setOpen}>
      <div className="flex items-center justify-between gap-2.5">
        <SectionToggle icon={ListTodo}>Échéancier</SectionToggle>
      </div>
      <CollapsibleContent>
        <Card className="shadow-none">
          <CardContent className="space-y-4 p-3.5">
            {!data ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <ul className="flex flex-col gap-2.5">
                {milestones.map((m) => (
                  <li
                    key={m.key}
                    className="flex flex-wrap items-center gap-1 text-sm"
                  >
                    <Checkbox
                      size="sm"
                      className="mt-[1px] me-1"
                      checked={m.status === 'FAIT'}
                      disabled
                      aria-label={m.label}
                    />
                    <span
                      className={cn(
                        'font-medium',
                        m.status === 'FAIT' &&
                          'text-muted-foreground line-through',
                      )}
                    >
                      {m.label}
                    </span>
                    <span className="text-muted-foreground">
                      {m.done}/{m.total}
                    </span>
                    <div className="ms-auto flex items-center gap-2">
                      <Badge variant="secondary" size="sm">
                        {m.owner === 'formateur' ? (
                          <User className="size-3.5" />
                        ) : (
                          <Users className="size-3.5" />
                        )}
                        {OWNER[m.owner] ?? m.owner}
                      </Badge>
                      <Badge
                        variant={
                          m.status === 'EN_RETARD'
                            ? 'destructive'
                            : m.status === 'A_ECHEANCE'
                              ? 'warning'
                              : 'secondary'
                        }
                        appearance={
                          m.status === 'EN_RETARD' || m.status === 'A_ECHEANCE'
                            ? 'light'
                            : undefined
                        }
                        size="sm"
                      >
                        <Calendar className="size-3.5" />
                        {formatDate(m.due_on)}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function SessionOverview({
  sessionId,
  session,
  onOpenTab,
}: {
  sessionId: string;
  session?: SessionRow;
  onOpenTab: (t: Tab) => void;
}) {
  const quality = useCan()('read_quality');
  return (
    <div className="space-y-6">
      <Highlights
        sessionId={sessionId}
        session={session}
        onOpenTab={onOpenTab}
      />
      <RecentActivity sessionId={sessionId} onOpenTab={onOpenTab} />
      {quality && <OpenFindings sessionId={sessionId} onOpenTab={onOpenTab} />}
      {quality && <Milestones sessionId={sessionId} />}
    </div>
  );
}

export function SessionActivityTab({ sessionId }: { sessionId: string }) {
  const { data, isLoading } = useSessionActivity(sessionId);
  return (
    <Card className="shadow-none">
      <CardContent className="p-3.5">
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <ActivityList items={data ?? []} />
        )}
      </CardContent>
    </Card>
  );
}
