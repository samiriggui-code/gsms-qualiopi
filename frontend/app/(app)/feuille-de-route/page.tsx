'use client';

// Feuille de route : les échéances de toutes les sources sur une même ligne de temps, le retard
// d'abord puis semaine par semaine (idée reprise du plan sur 30 jours du SEO Tool). L'API décide
// des états ; l'écran range et relie chaque ligne à l'écran où on agit.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { addDays, format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  AlarmClock,
  Banknote,
  CalendarClock,
  ChevronRight,
  FileCheck2,
  GraduationCap,
  Route,
  Wrench,
} from 'lucide-react';
import { api } from '@/lib/api';
import { TONE } from '@/lib/gsms/labels';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Refusal } from '@/components/gsms/refusal';
import { Content } from '@/components/layout/components/content';
import { ContentHeader } from '@/components/layout/components/content-header';
import { KpiRow } from '@/components/page/kpi-row';
import { PageHero } from '@/components/page/page-hero';

interface Item {
  source: 'SESSION' | 'ACTION' | 'PREUVE' | 'TITRE' | 'FINANCEMENT';
  echeance: string;
  semaine: string;
  etat: 'EN_RETARD' | 'A_ECHEANCE' | 'A_VENIR';
  titre: string;
  detail: string;
  lien: string | null;
  indicateurs: number[];
}

const SOURCE = {
  SESSION: { label: 'Session', icon: CalendarClock },
  ACTION: { label: 'Action corrective', icon: Wrench },
  PREUVE: { label: 'Preuve', icon: FileCheck2 },
  TITRE: { label: 'Formateur', icon: GraduationCap },
  FINANCEMENT: { label: 'Financement', icon: Banknote },
} as const;

const STATE = {
  EN_RETARD: { label: 'En retard', color: TONE.danger },
  A_ECHEANCE: { label: 'À échéance', color: TONE.warn },
  A_VENIR: { label: 'À venir', color: TONE.neutral },
} as const;

const HORIZONS = [4, 6, 12] as const;

function Line({ item }: { item: Item }) {
  const s = SOURCE[item.source];
  const Icon = s.icon;
  const body = (
    <>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40">
        <Icon className="size-4 text-primary" />
      </span>
      <span className="min-w-0 grow">
        <span className="block truncate text-sm font-medium">{item.titre}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {s.label} ·{' '}
          {format(parseISO(item.echeance), 'EEE d MMM', { locale: fr })} ·{' '}
          {item.detail}
          {item.indicateurs.length ? ` · I${item.indicateurs.join(', I')}` : ''}
        </span>
      </span>
      <Badge size="sm" className={cn('shrink-0', STATE[item.etat].color)}>
        {STATE[item.etat].label}
      </Badge>
      {item.lien && (
        <ChevronRight className="size-4 shrink-0 text-muted-foreground/60 max-sm:hidden" />
      )}
    </>
  );
  return (
    <li>
      {item.lien ? (
        <Link
          href={item.lien}
          className="flex min-w-0 items-center gap-3 px-4 py-3 hover:bg-muted/40"
        >
          {body}
        </Link>
      ) : (
        <div className="flex min-w-0 items-center gap-3 px-4 py-3">{body}</div>
      )}
    </li>
  );
}

export default function RoadmapPage() {
  const [weeks, setWeeks] = useState<(typeof HORIZONS)[number]>(6);
  const { data, isLoading, error } = useQuery({
    queryKey: ['pilotage', 'feuille-de-route', weeks],
    queryFn: () =>
      api.get<{
        aujourd_hui: string;
        jusqu_au: string;
        sources: string[];
        elements: Item[];
      }>(`pilotage/feuille-de-route?semaines=${weeks}`),
  });
  const items = useMemo(() => data?.elements ?? [], [data]);

  // Le retard d'abord, puis une section par semaine (lundi), dans l'ordre
  const groups = useMemo(() => {
    const late = items.filter((i) => i.etat === 'EN_RETARD');
    const byWeek = new Map<string, Item[]>();
    for (const i of items
      .filter((x) => x.etat !== 'EN_RETARD')
      .sort((a, b) => a.echeance.localeCompare(b.echeance))) {
      byWeek.set(i.semaine, [...(byWeek.get(i.semaine) ?? []), i]);
    }
    return {
      late,
      weeks: Array.from(byWeek.entries()).sort(([a], [b]) =>
        a.localeCompare(b),
      ),
    };
  }, [items]);

  const thisWeek = data
    ? format(
        addDays(
          parseISO(data.aujourd_hui),
          -((parseISO(data.aujourd_hui).getDay() + 6) % 7),
        ),
        'yyyy-MM-dd',
      )
    : '';
  const weekTitle = (monday: string) => {
    const start = parseISO(monday);
    const label = `Semaine du ${format(start, 'd MMMM', { locale: fr })} au ${format(addDays(start, 6), 'd MMMM', { locale: fr })}`;
    return monday === thisWeek
      ? `Cette semaine · ${label.toLowerCase()}`
      : label;
  };

  return (
    <>
      <ContentHeader>
        <h1 className="inline-flex items-center gap-2.5 text-sm font-semibold">
          <Route className="size-4 text-primary" /> Feuille de route
        </h1>
      </ContentHeader>
      <Content className="block">
        <div className="container-fluid space-y-5">
          <PageHero
            eyebrow="Pilotage"
            icon={Route}
            title="Feuille de route"
            description="Tout ce qui a une échéance, d'un seul coup d'œil : le retard d'abord, puis semaine par semaine. Chaque ligne mène à l'écran où on agit."
            actions={
              <div
                className="inline-flex rounded-lg border border-border p-0.5"
                role="group"
                aria-label="Horizon"
              >
                {HORIZONS.map((w) => (
                  <Button
                    key={w}
                    size="sm"
                    variant={w === weeks ? 'primary' : 'ghost'}
                    onClick={() => setWeeks(w)}
                    aria-pressed={w === weeks}
                  >
                    {w} sem.
                  </Button>
                ))}
              </div>
            }
          />
          {error ? (
            <Refusal error={error} />
          ) : (
            <>
              <KpiRow
                loading={isLoading}
                items={[
                  {
                    label: 'En retard',
                    value: groups.late.length,
                    subtitle: 'échéance dépassée',
                    icon: AlarmClock,
                  },
                  {
                    label: 'À échéance',
                    value: items.filter((i) => i.etat === 'A_ECHEANCE').length,
                    subtitle: 'à faire maintenant',
                    icon: CalendarClock,
                  },
                  {
                    label: 'À venir',
                    value: items.filter((i) => i.etat === 'A_VENIR').length,
                    subtitle: `d’ici ${weeks} semaines`,
                    icon: Route,
                  },
                  {
                    label: 'Actions correctives',
                    value: items.filter((i) => i.source === 'ACTION').length,
                    subtitle: 'ouvertes à échéance',
                    icon: Wrench,
                  },
                ]}
              />
              {isLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : items.length === 0 ? (
                <Card className="shadow-none">
                  <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                    Rien en retard ni prévu d’ici {weeks} semaines.
                  </p>
                </Card>
              ) : (
                <div className="space-y-5">
                  {groups.late.length > 0 && (
                    <Card className="shadow-none overflow-hidden border-destructive/30 [contain:inline-size]">
                      <h2 className="flex items-center gap-2 border-b border-border bg-destructive/5 px-4 py-2.5 text-sm font-semibold text-destructive">
                        <AlarmClock className="size-4" /> En retard (
                        {groups.late.length})
                      </h2>
                      <ul className="divide-y divide-border">
                        {groups.late.map((i) => (
                          <Line
                            key={`${i.source}-${i.titre}-${i.echeance}`}
                            item={i}
                          />
                        ))}
                      </ul>
                    </Card>
                  )}
                  {groups.weeks.map(([monday, list]) => (
                    <Card
                      key={monday}
                      className="shadow-none overflow-hidden [contain:inline-size]"
                    >
                      <h2 className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5 text-sm font-semibold">
                        <span className="first-letter:uppercase">
                          {weekTitle(monday)}
                        </span>
                        <span className="text-xs font-normal text-muted-foreground tabular-nums">
                          {list.length}
                        </span>
                      </h2>
                      <ul className="divide-y divide-border">
                        {list.map((i) => (
                          <Line
                            key={`${i.source}-${i.titre}-${i.echeance}`}
                            item={i}
                          />
                        ))}
                      </ul>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </Content>
    </>
  );
}
