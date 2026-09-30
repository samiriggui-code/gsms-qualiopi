'use client';

// Indicateurs : les 7 critères en sections, chaque indicateur en carte (son nom, ce qu'il demande, son
// état, ses preuves et ses écarts), quatre par rangée ; le détail s'ouvre dans un volet (mêmes onglets que
// le carnet d'audit). L'état vient du moteur ; la page n'en calcule aucun.
import * as React from 'react';
import { useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowUpRight,
  BookOpenCheck,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  FileCheck2,
  GraduationCap,
  Info,
  ListChecks,
  Megaphone,
  MessagesSquare,
  Network,
  Sparkles,
  Target,
  Users,
  Wrench,
} from 'lucide-react';
import { useCarnet, type CarnetFiche } from '@/lib/gsms/carnet';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Refusal } from '@/components/gsms/refusal';
import { Content } from '@/components/layout/components/content';
import { ContentHeader } from '@/components/layout/components/content-header';
import { STATE_BAR, stateBadge } from '../carnet/fiche';
import { IndicatorBody } from '../carnet/indicator-body';

// Nom court et pictogramme de chaque critère (repères d'interface ; le titre officiel reste affiché dessous).
const CRITERIA: Record<
  number,
  { name: string; icon: React.ElementType; tone: string }
> = {
  1: {
    name: 'Informer le public',
    icon: Megaphone,
    tone: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  },
  2: {
    name: 'Concevoir la formation',
    icon: Target,
    tone: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  },
  3: {
    name: 'Accueillir, suivre, évaluer',
    icon: Users,
    tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  },
  4: {
    name: 'Moyens et encadrement',
    icon: Wrench,
    tone: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  },
  5: {
    name: 'Compétences des équipes',
    icon: GraduationCap,
    tone: 'bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300',
  },
  6: {
    name: 'Environnement professionnel',
    icon: Network,
    tone: 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
  },
  7: {
    name: 'Appréciations et réclamations',
    icon: MessagesSquare,
    tone: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  },
};

const ACCENT: Record<string, string> = {
  DEMONTRABLE: 'border-t-emerald-500',
  A_RISQUE: 'border-t-amber-500',
  PREUVES_INSUFFISANTES: 'border-t-red-500',
  NON_EVALUABLE: 'border-t-sky-500',
  NON_EVALUE: 'border-t-zinc-400',
  NON_APPLICABLE: 'border-t-zinc-200 dark:border-t-zinc-700',
  A_VENIR: 'border-t-blue-500',
};

function IndicatorCard({
  fiche,
  onOpen,
}: {
  fiche: CarnetFiche;
  onOpen: () => void;
}) {
  const s = stateBadge(fiche.etat);
  const na = fiche.etat === 'NON_APPLICABLE';
  const text = fiche.enonce || fiche.evolution?.enonce || '';
  return (
    <button type="button" onClick={onOpen} className="text-start group">
      <Card
        className={cn(
          'h-full border-t-4 transition-shadow group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-ring',
          ACCENT[fiche.etat],
          na && 'opacity-60',
        )}
      >
        <CardContent className="flex h-full flex-col gap-2.5 p-4">
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-semibold leading-snug text-foreground">
              {fiche.titre || 'Nouvel indicateur'}
            </span>
            {fiche.evolution && fiche.evolution.ampleur !== 'REDACTION' && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Sparkles className="size-3.5 shrink-0 text-blue-500" />
                </TooltipTrigger>
                <TooltipContent>Change au 1er novembre 2026</TooltipContent>
              </Tooltip>
            )}
          </div>
          <p className="line-clamp-3 text-xs text-muted-foreground">{text}</p>
          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1 text-xs text-muted-foreground">
            <Badge size="sm" className={s.color}>
              {s.label}
            </Badge>
            {!na && fiche.etat !== 'A_VENIR' && (
              <span className="inline-flex items-center gap-1">
                <FileCheck2 className="size-3" /> {fiche.preuves.exploitables}
              </span>
            )}
            {fiche.ecarts.length > 0 && (
              <span className="inline-flex items-center gap-1 text-amber-600">
                <CircleAlert className="size-3" /> {fiche.ecarts.length}
              </span>
            )}
            <span className="ms-auto tabular-nums">
              Indicateur {fiche.numero}
            </span>
          </div>
        </CardContent>
      </Card>
    </button>
  );
}

function CriterionHeader({
  numero,
  titre,
  fiches,
}: {
  numero: number;
  titre: string | null;
  fiches: CarnetFiche[];
}) {
  const c = CRITERIA[numero] ?? {
    name: `Critère ${numero}`,
    icon: ClipboardList,
    tone: 'bg-muted text-foreground',
  };
  const applicable = fiches.filter(
    (f) => f.etat !== 'NON_APPLICABLE' && f.etat !== 'A_VENIR',
  );
  const ok = applicable.filter((f) => f.etat === 'DEMONTRABLE').length;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-lg',
          c.tone,
        )}
      >
        <c.icon className="size-5" />
      </div>
      <div className="min-w-0 grow">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h2 className="text-base font-semibold text-foreground">{c.name}</h2>
          <span className="text-xs text-muted-foreground">
            Critère {numero}
          </span>
        </div>
        {titre && (
          <p className="line-clamp-1 text-xs text-muted-foreground">{titre}</p>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <div className="flex h-1.5 w-24 gap-0.5 overflow-hidden rounded-full bg-muted">
          {STATE_BAR.map((s) => {
            const n = applicable.filter((f) => f.etat === s.key).length;
            return n ? (
              <div key={s.key} className={s.bar} style={{ flexGrow: n }} />
            ) : null;
          })}
        </div>
        <span className="tabular-nums">
          {ok}/{applicable.length}
        </span>
      </div>
    </div>
  );
}

export default function IndicateursPage() {
  const { data, isLoading, error } = useCarnet();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const selected = params.get('i') ? Number(params.get('i')) : null;
  const open = (n: number | null) =>
    router.replace(n ? `${pathname}?i=${n}` : pathname, { scroll: false });

  const fiches = useMemo(() => data?.fiches ?? [], [data]);
  const groups = useMemo(
    () =>
      Array.from(new Set(fiches.map((f) => f.critere.numero))).sort(
        (a, b) => a - b,
      ),
    [fiches],
  );
  const fiche = fiches.find((f) => f.numero === selected) ?? null;
  const order = fiches.map((f) => f.numero);
  const move = (d: number) => {
    if (!fiche) return;
    const idx = order.indexOf(fiche.numero);
    open(order[(idx + d + order.length) % order.length]);
  };
  const applicable = fiches.filter(
    (f) => f.etat !== 'NON_APPLICABLE' && f.etat !== 'A_VENIR',
  );

  return (
    <>
      <ContentHeader>
        <h1 className="inline-flex items-center gap-2.5 text-sm font-semibold">
          <ListChecks className="size-4 text-primary" />
          Indicateurs
          {data && (
            <Badge variant="primary" appearance="light" size="sm">
              Référentiel {data.referentiel.version}
            </Badge>
          )}
          {data && (
            <Tooltip>
              <TooltipTrigger>
                <Info className="size-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-sm">
                {data.referentiel.source}
              </TooltipContent>
            </Tooltip>
          )}
        </h1>
        <Button size="sm" variant="outline" asChild>
          <Link href="/qualiopi/carnet">
            <BookOpenCheck /> Carnet d’audit
          </Link>
        </Button>
      </ContentHeader>
      <Content className="block">
        <div className="container-fluid space-y-8">
          <Refusal error={error} />
          {isLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-40" />
              ))}
            </div>
          )}
          {data && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
              <span>
                <span className="text-base font-semibold text-foreground tabular-nums">
                  {applicable.filter((f) => f.etat === 'DEMONTRABLE').length}
                </span>{' '}
                démontrables sur {applicable.length} applicables
              </span>
              {STATE_BAR.map((s) => (
                <span key={s.key} className="inline-flex items-center gap-1.5">
                  <span className={cn('size-2 rounded-full', s.bar)} />
                  {s.label}
                </span>
              ))}
            </div>
          )}
          {groups.map((n) => {
            const items = fiches.filter((f) => f.critere.numero === n);
            return (
              <section key={n} className="space-y-4">
                <CriterionHeader
                  numero={n}
                  titre={items[0]?.critere.titre ?? null}
                  fiches={items}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                  {items.map((f) => (
                    <IndicatorCard
                      key={f.numero}
                      fiche={f}
                      onOpen={() => open(f.numero)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </Content>

      <Sheet open={!!fiche} onOpenChange={(o) => !o && open(null)}>
        <SheetContent className="sm:w-[680px] sm:max-w-none inset-5 start-auto max-sm:inset-2 max-sm:w-auto h-auto rounded-lg p-0 gap-0 [&_[data-slot=sheet-close]]:top-4.5 [&_[data-slot=sheet-close]]:end-5">
          {fiche && data && (
            <>
              <SheetHeader className="border-b border-border py-3.5 px-5">
                <SheetTitle className="flex items-center gap-2.5 pe-8">
                  <span className="min-w-0 truncate">
                    {CRITERIA[fiche.critere.numero]?.name}
                  </span>
                  <span className="text-xs font-normal text-muted-foreground shrink-0">
                    Indicateur {fiche.numero}
                  </span>
                  <Badge
                    className={cn('shrink-0', stateBadge(fiche.etat).color)}
                  >
                    {stateBadge(fiche.etat).label}
                  </Badge>
                </SheetTitle>
              </SheetHeader>
              <SheetBody className="p-0 grow flex flex-col min-h-0">
                <ScrollArea className="h-[calc(100dvh-11.5rem)] max-sm:h-[calc(100dvh-9.5rem)] [&_[data-radix-scroll-area-viewport]>div]:!block">
                  <IndicatorBody fiche={fiche} data={data} />
                </ScrollArea>
              </SheetBody>
              <SheetFooter className="flex flex-row items-center gap-2 border-t border-border py-3 px-5">
                <Button
                  variant="ghost"
                  mode="icon"
                  size="sm"
                  onClick={() => move(-1)}
                  aria-label="Indicateur précédent"
                >
                  <ChevronLeft />
                </Button>
                <Button
                  variant="ghost"
                  mode="icon"
                  size="sm"
                  onClick={() => move(1)}
                  aria-label="Indicateur suivant"
                >
                  <ChevronRight />
                </Button>
                <Button variant="outline" size="sm" className="ms-auto" asChild>
                  <Link href={`/qualiopi/referentiel/${fiche.numero}`}>
                    Fiche complète <ArrowUpRight />
                  </Link>
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
