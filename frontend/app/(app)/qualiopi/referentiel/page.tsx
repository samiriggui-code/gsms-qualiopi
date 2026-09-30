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
  ClipboardList,
  GraduationCap,
  Info,
  ListChecks,
  Megaphone,
  MessagesSquare,
  Network,
  Target,
  Users,
  Wrench,
} from 'lucide-react';
import { useCarnet, type CarnetFiche } from '@/lib/gsms/carnet';
import { cn } from '@/lib/utils';
import { Badge, BadgeDot } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardHeading,
  CardTitle,
  CardToolbar,
} from '@/components/ui/card';
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
import { stateBadge } from '../carnet/fiche';
import { IndicatorBody } from '../carnet/indicator-body';

// Nom court et pictogramme de chaque critère (repères d'interface ; le titre officiel reste affiché dessous).
// Nom court et pictogramme de chaque critère (repères d'interface ; le titre officiel reste affiché dessous).
const CRITERIA: Record<number, { name: string; icon: React.ElementType }> = {
  1: { name: 'Informer le public', icon: Megaphone },
  2: { name: 'Concevoir la formation', icon: Target },
  3: { name: 'Accueillir, suivre, évaluer', icon: Users },
  4: { name: 'Moyens et encadrement', icon: Wrench },
  5: { name: 'Compétences des équipes', icon: GraduationCap },
  6: { name: 'Environnement professionnel', icon: Network },
  7: { name: 'Appréciations et réclamations', icon: MessagesSquare },
};

const DOT: Record<string, string> = {
  DEMONTRABLE: 'bg-green-500',
  A_RISQUE: 'bg-yellow-500',
  PREUVES_INSUFFISANTES: 'bg-destructive',
  NON_EVALUABLE: 'bg-violet-500',
  NON_EVALUE: 'bg-muted-foreground',
  NON_APPLICABLE: 'bg-muted-foreground/40',
  A_VENIR: 'bg-primary',
};

// Carte compacte de la démo (app/ai/components/chat-starter-actions.tsx), quatre par rangée.
function IndicatorCard({
  fiche,
  onOpen,
}: {
  fiche: CarnetFiche;
  onOpen: () => void;
}) {
  const s = stateBadge(fiche.etat);
  const Icon = CRITERIA[fiche.critere.numero]?.icon ?? ClipboardList;
  const meta = [
    `Indicateur ${fiche.numero}`,
    fiche.etat !== 'NON_APPLICABLE' && fiche.etat !== 'A_VENIR'
      ? `${fiche.preuves.exploitables} preuves`
      : s.label,
    fiche.ecarts.length
      ? `${fiche.ecarts.length} écart${fiche.ecarts.length > 1 ? 's' : ''}`
      : null,
  ].filter(Boolean);
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      className={cn(
        'flex flex-row items-center gap-3 p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shadow-none',
        fiche.etat === 'NON_APPLICABLE' && 'opacity-60',
      )}
    >
      <div className="flex items-center justify-center size-9 shrink-0 bg-gray-100 dark:bg-gray-800 rounded-lg">
        <Icon className="size-4 text-gray-700 dark:text-white" />
      </div>
      <div className="flex flex-col gap-0.5 min-w-0 grow">
        <h3 className="font-semibold text-sm text-gray-900 dark:text-white truncate">
          {fiche.titre || 'Nouvel indicateur'}
        </h3>
        <p className="text-xs text-muted-foreground truncate">
          {meta.join(' · ')}
        </p>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <BadgeDot className={cn('size-2 shrink-0', DOT[fiche.etat])} />
        </TooltipTrigger>
        <TooltipContent>{s.label}</TooltipContent>
      </Tooltip>
    </Card>
  );
}

function CriterionCard({
  numero,
  titre,
  fiches,
  onOpen,
}: {
  numero: number;
  titre: string | null;
  fiches: CarnetFiche[];
  onOpen: (n: number) => void;
}) {
  const applicable = fiches.filter(
    (f) => f.etat !== 'NON_APPLICABLE' && f.etat !== 'A_VENIR',
  );
  const ok = applicable.filter((f) => f.etat === 'DEMONTRABLE').length;
  return (
    <Card>
      <CardHeader>
        <CardHeading>
          <CardTitle>
            {CRITERIA[numero]?.name ?? `Critère ${numero}`}{' '}
            <span className="text-sm font-normal text-muted-foreground">
              · Critère {numero}
            </span>
          </CardTitle>
          {titre && (
            <CardDescription className="line-clamp-1">{titre}</CardDescription>
          )}
        </CardHeading>
        <CardToolbar>
          <Badge
            variant={ok === applicable.length ? 'success' : 'secondary'}
            appearance="light"
          >
            {ok}/{applicable.length} démontrables
          </Badge>
        </CardToolbar>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {fiches.map((f) => (
            <IndicatorCard
              key={f.numero}
              fiche={f}
              onOpen={() => onOpen(f.numero)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
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
            <span className="text-xs font-normal text-muted-foreground">
              {applicable.filter((f) => f.etat === 'DEMONTRABLE').length}{' '}
              démontrables sur {applicable.length}
            </span>
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
        <div className="container-fluid space-y-5">
          <Refusal error={error} />
          {isLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          )}
          {groups.map((n) => {
            const items = fiches.filter((f) => f.critere.numero === n);
            return (
              <CriterionCard
                key={n}
                numero={n}
                titre={items[0]?.critere.titre ?? null}
                fiches={items}
                onOpen={open}
              />
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
