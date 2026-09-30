'use client';

// Carnet d'audit : liste des indicateurs à gauche (groupés par critère, état en un coup d'œil), détail à
// droite en onglets (preuves réunies, écarts et actions, textes du guide, changements de la version
// suivante). Périmètre : l'organisme entier, ou l'audit d'une session (ses éléments et ceux hérités de sa
// formation, de son formateur et de l'organisme). L'impression reprend toutes les fiches en entier.
import { useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  BookOpenCheck,
  ChevronLeft,
  ChevronRight,
  Info,
  Printer,
  Sparkles,
  Target,
} from 'lucide-react';
import { formatDate } from '@/lib/format';
import { useCarnet, type Carnet, type CarnetFiche } from '@/lib/gsms/carnet';
import { useSessions } from '@/lib/gsms/sessions';
import { cn } from '@/lib/utils';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertIcon,
  AlertTitle,
} from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Refusal } from '@/components/gsms/refusal';
import { Content } from '@/components/layout/components/content';
import { ContentHeader } from '@/components/layout/components/content-header';
import { Fiche, STATE_BAR, stateBadge } from './fiche';
import { IndicatorBody } from './indicator-body';

const PANE =
  'lg:h-[calc(100vh-var(--header-height)-var(--content-header-height))]';
const SCROLL_FIX = '[&_[data-radix-scroll-area-viewport]>div]:!block';
const ORG = 'organisme';
const DOT: Record<string, string> = {
  DEMONTRABLE: 'bg-green-500',
  A_RISQUE: 'bg-yellow-500',
  PREUVES_INSUFFISANTES: 'bg-destructive',
  NON_EVALUABLE: 'bg-sky-500',
  NON_EVALUE: 'bg-zinc-400',
  NON_APPLICABLE: 'bg-zinc-200 dark:bg-zinc-700',
  A_VENIR: 'bg-primary',
};

type Filter = 'tous' | 'a_traiter' | 'v10';

const toTreat = (f: CarnetFiche) =>
  f.etat === 'A_RISQUE' ||
  f.etat === 'PREUVES_INSUFFISANTES' ||
  f.etat === 'NON_EVALUE' ||
  f.ecarts.length > 0;
const changes = (f: CarnetFiche) =>
  !!f.evolution && f.evolution.ampleur !== 'REDACTION';

function Summary({ data }: { data: Carnet }) {
  const applicable = data.fiches.filter(
    (f) => f.etat !== 'NON_APPLICABLE' && f.etat !== 'A_VENIR',
  );
  const counts = Object.fromEntries(
    STATE_BAR.map((s) => [
      s.key,
      applicable.filter((f) => f.etat === s.key).length,
    ]),
  );
  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-semibold text-foreground tabular-nums">
          {counts.DEMONTRABLE}
        </span>
        <span className="text-xs text-muted-foreground">
          démontrables sur {applicable.length} applicables
        </span>
      </div>
      <div className="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted">
        {STATE_BAR.filter((s) => counts[s.key]).map((s) => (
          <div
            key={s.key}
            className={cn('h-full', s.bar)}
            style={{ flexGrow: counts[s.key] }}
          />
        ))}
      </div>
    </div>
  );
}

function Rail({
  data,
  filter,
  onFilter,
  selected,
  onSelect,
}: {
  data: Carnet;
  filter: Filter;
  onFilter: (f: Filter) => void;
  selected: number | null;
  onSelect: (n: number) => void;
}) {
  const visible = data.fiches.filter((f) =>
    filter === 'a_traiter' ? toTreat(f) : filter === 'v10' ? changes(f) : true,
  );
  const groups = Array.from(new Set(visible.map((f) => f.critere.numero))).sort(
    (a, b) => a - b,
  );
  const filters: { id: Filter; label: string; count: number }[] = [
    { id: 'tous', label: 'Tous', count: data.fiches.length },
    {
      id: 'a_traiter',
      label: 'À traiter',
      count: data.fiches.filter(toTreat).length,
    },
    ...(data.prochaine_version
      ? [
          {
            id: 'v10' as Filter,
            label: data.prochaine_version.version,
            count: data.fiches.filter(changes).length,
          },
        ]
      : []),
  ];

  return (
    <div
      className={cn(
        'flex flex-col lg:w-[330px] shrink-0 lg:border-e border-border min-w-0',
        PANE,
      )}
    >
      <div className="space-y-3 border-b border-border p-4">
        <Summary data={data} />
        <div className="flex gap-1 rounded-lg bg-muted/70 p-1">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onFilter(f.id)}
              className={cn(
                'flex-1 rounded-md px-2 py-1 text-xs',
                filter === f.id
                  ? 'bg-background shadow-xs font-medium text-foreground'
                  : 'text-muted-foreground',
              )}
            >
              {f.label}{' '}
              <span className="tabular-nums opacity-70">{f.count}</span>
            </button>
          ))}
        </div>
      </div>
      <ScrollArea className={cn('lg:flex-1 lg:min-h-0', SCROLL_FIX)}>
        <div className="p-2.5 space-y-3">
          {groups.map((n) => (
            <div key={n} className="space-y-0.5">
              <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Critère {n}
              </div>
              {visible
                .filter((f) => f.critere.numero === n)
                .map((f) => (
                  <button
                    key={f.numero}
                    type="button"
                    onClick={() => onSelect(f.numero)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-start hover:bg-accent',
                      selected === f.numero && 'bg-accent',
                      f.etat === 'NON_APPLICABLE' && 'opacity-60',
                    )}
                  >
                    <span
                      className={cn(
                        'size-2 rounded-full shrink-0',
                        DOT[f.etat],
                      )}
                    />
                    <span className="w-8 shrink-0 text-xs font-semibold tabular-nums text-foreground">
                      {f.code}
                    </span>
                    <span className="min-w-0 grow truncate text-sm text-secondary-foreground">
                      {f.titre || f.evolution?.enonce}
                    </span>
                    {f.ecarts.length > 0 && (
                      <Badge
                        size="xs"
                        variant="warning"
                        appearance="light"
                        className="shrink-0"
                      >
                        {f.ecarts.length}
                      </Badge>
                    )}
                    {changes(f) && (
                      <Sparkles
                        className="size-3 shrink-0 text-primary"
                        aria-label="Change à la prochaine version"
                      />
                    )}
                  </button>
                ))}
            </div>
          ))}
          {groups.length === 0 && (
            <p className="p-4 text-center text-sm text-muted-foreground">
              Rien à traiter ici.
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function Welcome({ data }: { data: Carnet }) {
  const deep = data.fiches.filter(
    (f) => f.evolution?.ampleur === 'FOND',
  ).length;
  const created = data.fiches.filter(
    (f) => f.evolution?.type === 'NOUVEAU',
  ).length;
  return (
    <div className="flex grow flex-col items-center justify-center gap-5 p-8 text-center max-lg:hidden">
      <div className="flex size-20 items-center justify-center rounded-full bg-primary/10">
        <Target className="size-9 text-primary" />
      </div>
      <div className="space-y-1.5">
        <h2 className="text-xl font-semibold text-foreground">
          {data.session
            ? `Audit de la session ${data.session.reference}`
            : 'Préparez votre audit Qualiopi'}
        </h2>
        <p className="text-sm text-muted-foreground">
          {data.session
            ? `${data.session.formation ?? ''} · du ${formatDate(data.session.debut)} au ${formatDate(data.session.fin)}. `
            : ''}
          Choisissez un indicateur dans la liste pour voir ses preuves.
        </p>
      </div>
      {data.prochaine_version && (
        <Alert
          variant="info"
          appearance="light"
          size="sm"
          className="max-w-lg text-start"
        >
          <AlertIcon>
            <Info />
          </AlertIcon>
          <AlertContent>
            <AlertTitle>{data.prochaine_version.version}</AlertTitle>
            <AlertDescription>
              Au {formatDate(data.prochaine_version.en_vigueur_le)} : {deep}{' '}
              exigence{deep > 1 ? 's' : ''} modifiée
              {deep > 1 ? 's' : ''} sur le fond
              {created ? `, ${created} indicateur créé` : ''}. Filtre «{' '}
              {data.prochaine_version.version} » pour les voir.
            </AlertDescription>
          </AlertContent>
        </Alert>
      )}
      <p className="flex max-w-lg items-start gap-2 text-start text-xs text-muted-foreground">
        <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />{' '}
        {data.avertissement}
      </p>
    </div>
  );
}

function Detail({
  fiche,
  data,
  onBack,
  onMove,
}: {
  fiche: CarnetFiche;
  data: Carnet;
  onBack: () => void;
  onMove: (delta: number) => void;
}) {
  const s = stateBadge(fiche.etat);
  return (
    <div className={cn('flex grow flex-col min-w-0', PANE)}>
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 lg:px-5">
        <Button
          variant="ghost"
          mode="icon"
          size="sm"
          className="lg:hidden"
          onClick={onBack}
          aria-label="Retour à la liste"
        >
          <ChevronLeft />
        </Button>
        <span className="text-lg font-semibold tabular-nums text-foreground">
          {fiche.code}
        </span>
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          Critère {fiche.critere.numero}
        </span>
        <div className="ms-auto flex items-center gap-1">
          <Badge className={s.color}>{s.label}</Badge>
          <Button
            variant="ghost"
            mode="icon"
            size="sm"
            onClick={() => onMove(-1)}
            aria-label="Indicateur précédent"
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="ghost"
            mode="icon"
            size="sm"
            onClick={() => onMove(1)}
            aria-label="Indicateur suivant"
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
      <ScrollArea className={cn('lg:flex-1 lg:min-h-0', SCROLL_FIX)}>
        <IndicatorBody fiche={fiche} data={data} />
      </ScrollArea>
    </div>
  );
}

export default function CarnetPage() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const sessionId = params.get('session') ?? '';
  const selected = params.get('i') ? Number(params.get('i')) : null;
  const filter = (params.get('filtre') as Filter) || 'tous';
  const { data, isLoading, error } = useCarnet(sessionId || undefined);
  const { data: sessions = [] } = useSessions();

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const fiche = data?.fiches.find((f) => f.numero === selected) ?? null;
  const order = useMemo(
    () => (data?.fiches ?? []).map((f) => f.numero),
    [data],
  );
  const sortedSessions = [...sessions].sort((a, b) =>
    b.start_date.localeCompare(a.start_date),
  );

  return (
    <>
      <ContentHeader className="print:hidden">
        <h1 className="inline-flex items-center gap-2.5 text-sm font-semibold">
          <BookOpenCheck className="size-4 text-primary" />
          Carnet d’audit
        </h1>
        <div className="flex items-center gap-2 min-w-0">
          <Select
            value={sessionId || ORG}
            onValueChange={(v) =>
              set({ session: v === ORG ? null : v, i: null })
            }
          >
            <SelectTrigger
              size="sm"
              className="w-60 max-sm:w-48"
              aria-label="Périmètre du carnet"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ORG}>
                Organisme (toutes les sessions)
              </SelectItem>
              {sortedSessions.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  Session {s.reference}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.print()}
            disabled={!data}
          >
            <Printer /> <span className="max-sm:sr-only">Imprimer ou PDF</span>
          </Button>
        </div>
      </ContentHeader>

      <Content className="grid py-0 print:hidden">
        {error && (
          <div className="p-5">
            <Refusal error={error} />
          </div>
        )}
        {isLoading && (
          <div className="p-5">
            <Skeleton className="h-64 w-full" />
          </div>
        )}
        {data && (
          <div className="flex max-lg:flex-col grow min-w-0">
            {data.session && (
              <div className="lg:hidden border-b border-border px-4 py-2 text-xs text-muted-foreground">
                Audit de la session{' '}
                <span className="font-medium text-foreground">
                  {data.session.reference}
                </span>
                {data.session.formation ? ` · ${data.session.formation}` : ''}
              </div>
            )}
            <div className={cn('contents', fiche && 'max-lg:hidden')}>
              <Rail
                data={data}
                filter={filter}
                onFilter={(f) => set({ filtre: f === 'tous' ? null : f })}
                selected={selected}
                onSelect={(n) => set({ i: String(n) })}
              />
            </div>
            {fiche ? (
              <Detail
                fiche={fiche}
                data={data}
                onBack={() => set({ i: null })}
                onMove={(d) => {
                  const idx = order.indexOf(fiche.numero);
                  set({
                    i: String(order[(idx + d + order.length) % order.length]),
                  });
                }}
              />
            ) : (
              <Welcome data={data} />
            )}
          </div>
        )}
      </Content>

      {data && (
        <div className="hidden print:block space-y-5">
          <div className="space-y-1">
            <div className="text-xl font-semibold">
              Carnet d’audit — {data.organisme?.nom}
            </div>
            <div className="text-sm text-muted-foreground">
              {data.session
                ? `Session ${data.session.reference} · ${data.session.formation ?? ''} · `
                : 'Organisme · '}
              Référentiel {data.referentiel.version} · édité le{' '}
              {formatDate(data.edite_le)}
              {data.organisme?.nda ? ` · NDA ${data.organisme.nda}` : ''}
            </div>
            <p className="text-xs text-muted-foreground">
              {data.avertissement}
            </p>
          </div>
          {data.fiches
            .filter((f) => f.etat !== 'NON_APPLICABLE')
            .map((f) => (
              <Fiche key={f.numero} fiche={f} next={data.prochaine_version} />
            ))}
        </div>
      )}
    </>
  );
}
