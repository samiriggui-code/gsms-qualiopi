'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  DoorOpen,
  Users,
  UserX,
} from 'lucide-react';
import { SESSION_STATUS } from '@/lib/gsms/labels';
import { useSessions } from '@/lib/gsms/sessions';
import type { SessionRow } from '@/lib/gsms/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Content } from '@/components/layout/components/content';
import { ContentHeader } from '@/components/layout/components/content-header';
import { KpiRow, type KpiItem } from '@/components/page/kpi-row';
import { PageHero } from '@/components/page/page-hero';

// Agenda sur le modèle du planning pédagogique de GSMS School : une semaine (une ligne par session, une
// colonne par jour) ou un mois (calendrier), avec les cartes KPI de la période affichée. Sur téléphone,
// la période s'affiche jour par jour. Lecture seule : les sessions se créent et se modifient dans Sessions.

type View = 'week' | 'month';

const iso = (d: Date) => format(d, 'yyyy-MM-dd');
const covers = (s: SessionRow, day: string) =>
  s.start_date <= day && day <= s.end_date;

// Couleur d'une session par filière, comme les pastilles du catalogue
const TRACK_STYLE: Record<string, string> = {
  SURETE: 'border-blue-500/50 bg-blue-500/10 hover:bg-blue-500/20',
  INCENDIE: 'border-orange-500/50 bg-orange-500/10 hover:bg-orange-500/20',
  HABILITATION: 'border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/20',
  SST: 'border-emerald-500/50 bg-emerald-500/10 hover:bg-emerald-500/20',
  ENTREPRISE: 'border-slate-500/50 bg-slate-500/10 hover:bg-slate-500/20',
  AUTRES: 'border-violet-500/50 bg-violet-500/10 hover:bg-violet-500/20',
};
const TRACK_DOT: Record<string, string> = {
  SURETE: 'bg-blue-500',
  INCENDIE: 'bg-orange-500',
  HABILITATION: 'bg-amber-500',
  SST: 'bg-emerald-500',
  ENTREPRISE: 'bg-slate-500',
  AUTRES: 'bg-violet-500',
};
const trackStyle = (s: SessionRow) =>
  s.status === 'ANNULEE'
    ? 'border-border bg-muted/40 text-muted-foreground line-through hover:bg-muted/60'
    : (TRACK_STYLE[s.program_track ?? 'AUTRES'] ?? TRACK_STYLE.AUTRES);

function periodKpis(sessions: SessionRow[]): KpiItem[] {
  const live = sessions.filter((s) => s.status !== 'ANNULEE');
  const noTrainer = live.filter((s) => !s.trainer_id).length;
  const noRoom = live.filter((s) => !s.room).length;
  return [
    {
      label: 'Sessions',
      value: live.length,
      subtitle: 'sur la période affichée',
      icon: CalendarRange,
    },
    {
      label: 'Inscrits',
      value: live.reduce((n, s) => n + s.learners_count, 0),
      subtitle: 'dans ces sessions',
      icon: Users,
    },
    {
      label: 'Sans formateur',
      value: noTrainer,
      subtitle: noTrainer ? 'formateur à affecter' : 'toutes couvertes',
      icon: UserX,
    },
    {
      label: 'Sans salle',
      value: noRoom,
      subtitle: noRoom ? 'salle non renseignée' : 'toutes ont une salle',
      icon: DoorOpen,
    },
  ];
}

function SessionChip({ s, compact }: { s: SessionRow; compact?: boolean }) {
  return (
    <Link
      href={`/formation/sessions/${s.id}`}
      title={`${s.program_title ?? s.reference} · ${SESSION_STATUS[s.status].label}`}
      className={cn(
        'block rounded-md border px-2 py-1 text-[11px] leading-snug text-foreground transition-colors',
        trackStyle(s),
      )}
    >
      <span className="block truncate font-semibold">
        {s.program_code ?? s.reference}
      </span>
      {!compact && (
        <span className="block truncate text-[10px] text-secondary-foreground">
          {s.room ?? s.location ?? 'Salle non renseignée'}
        </span>
      )}
    </Link>
  );
}

function SessionMeta({ s }: { s: SessionRow }) {
  return (
    <>
      <Link
        href={`/formation/sessions/${s.id}`}
        className="line-clamp-2 text-sm font-semibold leading-tight text-foreground hover:text-primary"
      >
        {s.program_title ?? s.reference}
      </Link>
      <p className="mt-0.5 text-[11px] text-secondary-foreground">
        {s.reference} · {SESSION_STATUS[s.status].label}
      </p>
      <p className="mt-1 text-[11px] leading-snug text-secondary-foreground">
        {s.trainer_name ?? (
          <span className="text-destructive">Sans formateur</span>
        )}
        {' · '}
        {s.learners_count}
        {s.capacity ? `/${s.capacity}` : ''} inscrit
        {s.learners_count > 1 ? 's' : ''}
        {' · '}
        {s.room ?? 'Salle non renseignée'}
      </p>
    </>
  );
}

// Semaine : une ligne par session, une colonne par jour (lun.–sam., dim. si une session le couvre)
function WeekGrid({
  sessions,
  days,
}: {
  sessions: SessionRow[];
  days: Date[];
}) {
  const cols = `minmax(220px,280px) repeat(${days.length}, minmax(96px,1fr))`;
  return (
    <ScrollArea className="w-full">
      <div className="min-w-[860px]">
        <div
          className="grid border-b border-border bg-muted/30"
          style={{ gridTemplateColumns: cols }}
        >
          <div className="border-e border-border px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Formation / session
          </div>
          {days.map((d) => (
            <div
              key={iso(d)}
              className={cn(
                'border-e border-border/60 px-2 py-3 text-center last:border-e-0',
                isToday(d) && 'bg-primary/5',
              )}
            >
              <p className="text-[10px] font-bold uppercase tracking-wide text-secondary-foreground">
                {format(d, 'EEE', { locale: fr })}
              </p>
              <p
                className={cn(
                  'mt-0.5 text-sm font-bold',
                  isToday(d)
                    ? 'text-foreground underline decoration-primary decoration-2 underline-offset-4'
                    : 'text-foreground',
                )}
              >
                {format(d, 'd MMM', { locale: fr })}
              </p>
            </div>
          ))}
        </div>
        {sessions.map((s) => (
          <div
            key={s.id}
            className="grid border-b border-border/60 last:border-b-0"
            style={{ gridTemplateColumns: cols }}
          >
            <div className="sticky start-0 z-[1] border-e border-border bg-background px-4 py-3">
              <SessionMeta s={s} />
            </div>
            {days.map((d) => {
              const on = covers(s, iso(d));
              return (
                <div
                  key={iso(d)}
                  className={cn(
                    'min-h-[84px] border-e border-border/40 p-1.5 last:border-e-0',
                    isToday(d) && 'bg-primary/[0.03]',
                  )}
                >
                  {on ? (
                    <SessionChip s={s} />
                  ) : (
                    <span className="block px-1 py-2 text-[10px] text-muted-foreground">
                      —
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}

// Mois : calendrier de lundi à dimanche, sessions du jour en pastilles
function MonthGrid({
  sessions,
  anchor,
}: {
  sessions: SessionRow[];
  anchor: Date;
}) {
  const start = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 });
  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return (
    <div className="grid grid-cols-7">
      {days.slice(0, 7).map((d) => (
        <div
          key={`h-${iso(d)}`}
          className="border-b border-border bg-muted/30 px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-muted-foreground"
        >
          {format(d, 'EEE', { locale: fr })}
        </div>
      ))}
      {days.map((d) => {
        const list = sessions.filter((s) => covers(s, iso(d)));
        return (
          <div
            key={iso(d)}
            className={cn(
              'min-h-[112px] space-y-1 border-b border-e border-border/60 p-1.5 [&:nth-child(7n)]:border-e-0',
              !isSameMonth(d, anchor) && 'bg-muted/30',
              isToday(d) && 'bg-primary/5',
            )}
          >
            <p
              className={cn(
                'px-1 text-xs font-semibold',
                isToday(d)
                  ? 'text-foreground underline decoration-primary decoration-2 underline-offset-4'
                  : isSameMonth(d, anchor)
                    ? 'text-foreground'
                    : 'text-muted-foreground',
              )}
            >
              {format(d, 'd')}
            </p>
            {list.slice(0, 3).map((s) => (
              <SessionChip key={s.id} s={s} compact />
            ))}
            {list.length > 3 && (
              <p className="px-1 text-[10px] font-medium text-secondary-foreground">
                +{list.length - 3} autre(s)
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Téléphone : jour par jour, seulement les jours qui ont des sessions
function DayList({ sessions, days }: { sessions: SessionRow[]; days: Date[] }) {
  const filled = days
    .map((d) => ({ d, list: sessions.filter((s) => covers(s, iso(d))) }))
    .filter((x) => x.list.length);
  if (!filled.length)
    return (
      <p className="px-4 py-10 text-center text-sm text-muted-foreground">
        Aucune session sur cette période.
      </p>
    );
  return (
    <ul className="divide-y divide-border">
      {filled.map(({ d, list }) => (
        <li key={iso(d)} className="space-y-2 px-4 py-3">
          <p
            className={cn(
              'text-xs font-bold uppercase tracking-wide',
              isToday(d)
                ? 'text-foreground underline decoration-primary decoration-2 underline-offset-4'
                : 'text-secondary-foreground',
            )}
          >
            {format(d, 'EEEE d MMMM', { locale: fr })}
          </p>
          {list.map((s) => (
            <div
              key={s.id}
              className={cn('rounded-lg border p-3', trackStyle(s))}
            >
              <SessionMeta s={s} />
            </div>
          ))}
        </li>
      ))}
    </ul>
  );
}

export default function AgendaPage() {
  const { data: all = [], isLoading, error } = useSessions();
  const [view, setView] = useState<View>('week');
  const [anchor, setAnchor] = useState(() => new Date());

  const { from, to, days, label } = useMemo(() => {
    if (view === 'week') {
      const from = startOfWeek(anchor, { weekStartsOn: 1 });
      const to = addDays(from, 6);
      return {
        from,
        to,
        days: Array.from({ length: 7 }, (_, i) => addDays(from, i)),
        label: `Semaine du ${format(from, 'd MMMM', { locale: fr })} au ${format(to, 'd MMMM yyyy', { locale: fr })}`,
      };
    }
    const from = startOfMonth(anchor);
    const to = endOfMonth(anchor);
    const days: Date[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
    const label = format(anchor, 'MMMM yyyy', { locale: fr });
    return { from, to, days, label: label[0].toUpperCase() + label.slice(1) };
  }, [view, anchor]);

  const sessions = useMemo(
    () =>
      all
        .filter((s) => s.start_date <= iso(to) && s.end_date >= iso(from))
        .sort((a, b) => a.start_date.localeCompare(b.start_date)),
    [all, from, to],
  );
  // Dimanche affiché seulement si une session le couvre (planning GSMS School : lun.–sam.)
  const weekDays = days.filter(
    (d) => d.getDay() !== 0 || sessions.some((s) => covers(s, iso(d))),
  );
  const tracks = Array.from(
    new Map(
      sessions
        .filter((s) => s.program_track)
        .map((s) => [s.program_track!, s.program_track_label]),
    ),
  );

  const move = (dir: 1 | -1) =>
    setAnchor((a) =>
      view === 'week'
        ? dir > 0
          ? addWeeks(a, 1)
          : subWeeks(a, 1)
        : dir > 0
          ? addMonths(a, 1)
          : subMonths(a, 1),
    );

  return (
    <>
      <ContentHeader>
        <h1 className="inline-flex items-center gap-2.5 text-sm font-semibold">
          <CalendarRange className="size-4 text-primary" />
          Agenda
        </h1>
      </ContentHeader>
      <Content className="block">
        <div className="container-fluid space-y-5">
          <PageHero
            eyebrow="Pilotage"
            icon={CalendarRange}
            title="Agenda des sessions"
            description="Le planning des sessions à la semaine ou au mois, avec le formateur, la salle et les inscrits. Les sessions se créent et se modifient depuis la page Sessions."
            actions={
              <Button variant="outline" asChild>
                <Link href="/formation/sessions">
                  <CalendarDays /> Gérer les sessions
                </Link>
              </Button>
            }
          />
          <KpiRow items={periodKpis(sessions)} loading={isLoading} />
          <Card className="overflow-hidden shadow-none">
            <CardHeader className="flex-col items-stretch gap-3 space-y-0 px-4 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    Planning
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {label}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    mode="icon"
                    aria-label="Période précédente"
                    onClick={() => move(-1)}
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAnchor(new Date())}
                  >
                    Aujourd’hui
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    mode="icon"
                    aria-label="Période suivante"
                    onClick={() => move(1)}
                  >
                    <ChevronRight />
                  </Button>
                  <div className="flex h-8.5 items-center gap-1 rounded-lg border bg-muted/50 p-0.5">
                    {(
                      [
                        ['week', 'Semaine'],
                        ['month', 'Mois'],
                      ] as const
                    ).map(([v, l]) => (
                      <Button
                        key={v}
                        type="button"
                        size="sm"
                        variant={view === v ? 'secondary' : 'ghost'}
                        aria-pressed={view === v}
                        className={cn(
                          'h-7',
                          view === v && 'bg-background shadow-xs',
                        )}
                        onClick={() => setView(v)}
                      >
                        {l}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
              {tracks.length > 0 && (
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] font-semibold uppercase tracking-wide text-secondary-foreground">
                  {tracks.map(([t, l]) => (
                    <span key={t} className="inline-flex items-center gap-1.5">
                      <span
                        className={cn(
                          'size-2.5 rounded-sm',
                          TRACK_DOT[t] ?? TRACK_DOT.AUTRES,
                        )}
                      />
                      {l ?? t}
                    </span>
                  ))}
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2.5 rounded-sm border border-border bg-muted" />
                    Annulée
                  </span>
                </div>
              )}
            </CardHeader>
            <CardContent className="border-t border-border p-0">
              {isLoading ? (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  Chargement du planning…
                </p>
              ) : error ? (
                <p className="py-12 text-center text-sm text-destructive">
                  Impossible de charger les sessions : {error.message}
                </p>
              ) : (
                <>
                  <div className="md:hidden">
                    <DayList sessions={sessions} days={days} />
                  </div>
                  <div className="max-md:hidden">
                    {view === 'month' ? (
                      <MonthGrid sessions={sessions} anchor={anchor} />
                    ) : sessions.length ? (
                      <WeekGrid sessions={sessions} days={weekDays} />
                    ) : (
                      <p className="px-4 py-12 text-center text-sm text-muted-foreground">
                        Aucune session cette semaine. Changez de semaine ou
                        planifiez une session depuis la page Sessions.
                      </p>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </Content>
    </>
  );
}
