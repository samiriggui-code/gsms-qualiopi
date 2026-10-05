'use client';

// Évaluations : ce que le moteur a contrôlé, quand, et ce qu'il a trouvé. État par indicateur, résultat de
// chaque contrôle sur chaque cible, constats (écarts) et dernières passes. Rien n'est recalculé ici.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ClipboardCheck,
  History,
  ListChecks,
  LoaderCircleIcon,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/format';
import {
  useControlResults,
  useEvaluations,
  useFindings,
  useReevaluate,
  type ControlResultRow,
  type EvaluationsOverview,
  type FindingRow,
} from '@/lib/gsms/evaluations';
import { READINESS } from '@/lib/gsms/labels';
import type { ReadinessStatus } from '@/lib/gsms/types';
import { useIndicators } from '@/lib/qualiopi/referentiel';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Refusal } from '@/components/gsms/refusal';
import { Content } from '@/components/layout/components/content';
import { ContentHeader } from '@/components/layout/components/content-header';
import { IndicatorName } from '@/components/qualiopi/indicator-name';

const ALL = 'tous';
// Du pire au meilleur, comme le moteur trie ses résultats.
const STATES: ReadinessStatus[] = [
  'PREUVES_INSUFFISANTES',
  'A_RISQUE',
  'NON_EVALUABLE',
  'NON_EVALUE',
  'DEMONTRABLE',
  'NON_APPLICABLE',
];

function StateBadge({ etat }: { etat: ReadinessStatus }) {
  const s = READINESS[etat] ?? { label: etat, color: '' };
  return <Badge className={cn('shrink-0', s.color)}>{s.label}</Badge>;
}

function counts(r: EvaluationsOverview['indicateurs'][number]) {
  const ko = r.resultats.PREUVES_INSUFFISANTES ?? 0;
  const warn = r.resultats.A_RISQUE ?? 0;
  const parts = [`${r.controles} résultat${r.controles > 1 ? 's' : ''}`];
  if (ko) parts.push(`${ko} insuffisant${ko > 1 ? 's' : ''}`);
  if (warn) parts.push(`${warn} à risque`);
  if (r.ecarts_ouverts)
    parts.push(`${r.ecarts_ouverts} écart${r.ecarts_ouverts > 1 ? 's' : ''}`);
  return parts.join(' · ');
}

function ByIndicator({
  data,
  onPick,
}: {
  data: EvaluationsOverview;
  onPick: (n: number) => void;
}) {
  const criteria = Array.from(
    new Set(data.indicateurs.map((i) => i.critere ?? 0)),
  ).sort((a, b) => a - b);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {criteria.map((c) => (
        <Card key={c} className="min-w-0">
          <CardHeader className="min-h-12">
            <CardTitle className="text-sm">
              {data.indicateurs.find((i) => i.critere === c)?.critere_nom ??
                `Critère ${c}`}{' '}
              <span className="font-normal text-muted-foreground">
                · Critère {c}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {data.indicateurs
                .filter((i) => (i.critere ?? 0) === c)
                .map((i) => (
                  <li key={i.numero}>
                    <button
                      type="button"
                      onClick={() => onPick(i.numero)}
                      className="w-full text-start flex items-center gap-3 px-5 py-2.5 hover:bg-muted/40 outline-none focus-visible:bg-muted/40"
                    >
                      <div className="min-w-0 grow">
                        <div className="text-sm font-medium text-foreground truncate">
                          <IndicatorName number={i.numero} />
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          Indicateur {i.numero} · {counts(i)}
                        </div>
                      </div>
                      <StateBadge etat={i.etat} />
                    </button>
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Missing({ items }: { items: Record<string, unknown>[] }) {
  if (!items.length) return null;
  const shown = items.slice(0, 6);
  return (
    <ul className="text-xs text-muted-foreground list-disc ps-4 space-y-0.5">
      {shown.map((m, i) => (
        <li key={i}>
          {[m.who, m.reason].filter(Boolean).join(' : ') ||
            Object.values(m)
              .filter((v) => typeof v === 'string')
              .join(' · ')}
        </li>
      ))}
      {items.length > shown.length && (
        <li>et {items.length - shown.length} autre(s)</li>
      )}
    </ul>
  );
}

function ResultLine({ r }: { r: ControlResultRow }) {
  return (
    <li className="px-4 py-3 space-y-1.5">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
        <div className="min-w-0 grow basis-64">
          <p className="text-sm font-medium text-foreground">{r.libelle}</p>
          <p className="text-xs text-muted-foreground">
            <IndicatorName number={r.indicateur} /> · {r.cible} · évalué le{' '}
            {formatDate(r.evalue_le, 'd MMM yyyy HH:mm')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {r.revue_humaine && (
            <Badge variant="primary" appearance="light" size="sm">
              Relecture demandée
            </Badge>
          )}
          <StateBadge etat={r.etat} />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{r.explication}</p>
      <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
        <div>
          <dt className="inline text-muted-foreground">Attendu : </dt>
          <dd className="inline text-foreground">{r.attendu}</dd>
        </div>
        <div>
          <dt className="inline text-muted-foreground">Constaté : </dt>
          <dd className="inline text-foreground">{r.constate}</dd>
        </div>
        {r.preuves.length > 0 && (
          <div className="min-w-0">
            <dt className="inline text-muted-foreground">Preuves : </dt>
            <dd className="inline text-foreground break-words">
              {r.preuves.slice(0, 5).join(', ')}
              {r.preuves.length > 5 && ` + ${r.preuves.length - 5}`}
            </dd>
          </div>
        )}
      </dl>
      <Missing items={r.manquants} />
    </li>
  );
}

function Results({
  indicateur,
  setIndicateur,
}: {
  indicateur: string;
  setIndicateur: (v: string) => void;
}) {
  const [etat, setEtat] = useState<string>(ALL);
  const indicators = useIndicators();
  const { data, isLoading, error, isFetching } = useControlResults(
    indicateur === ALL ? undefined : Number(indicateur),
    etat === ALL ? undefined : etat,
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,18rem)_minmax(0,16rem)] gap-3">
        <Select value={indicateur} onValueChange={setIndicateur}>
          <SelectTrigger size="sm" aria-label="Indicateur">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tous les indicateurs</SelectItem>
            {indicators.data?.map((i) => (
              <SelectItem key={i.number} value={String(i.number)}>
                {i.number}. {i.short_title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={etat} onValueChange={setEtat}>
          <SelectTrigger size="sm" aria-label="État">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tous les états</SelectItem>
            {STATES.map((s) => (
              <SelectItem key={s} value={s}>
                {READINESS[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Refusal error={error} />
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : (
            <ul
              className={cn(
                'divide-y divide-border',
                isFetching && 'opacity-70',
              )}
            >
              {data?.resultats.map((r) => (
                <ResultLine key={r.id} r={r} />
              ))}
            </ul>
          )}
          {data && data.resultats.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Aucun résultat de contrôle pour ces filtres.
            </p>
          )}
          {data && data.resultats.length < data.total && (
            <p className="text-xs text-muted-foreground text-center py-3 border-t border-border">
              {data.resultats.length} résultats affichés sur {data.total} :
              choisissez un indicateur pour les voir tous.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const OPEN = new Set(['OUVERT', 'EN_TRAITEMENT']);

function FindingLine({ f }: { f: FindingRow }) {
  return (
    <li className="px-4 py-3 space-y-1">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
        <div className="min-w-0 grow basis-64">
          <p className="text-sm font-medium text-foreground">
            <span className="text-xs text-muted-foreground tabular-nums">
              {f.reference}
            </span>{' '}
            {f.titre}
          </p>
          <p className="text-xs text-muted-foreground">
            <IndicatorName number={f.indicateur} /> · {f.cible} · constaté le{' '}
            {formatDate(f.constate_le)}
            {f.resolu_le && ` · résolu le ${formatDate(f.resolu_le)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={f.gravite === 'majeure' ? 'destructive' : 'warning'}
            appearance="light"
            size="sm"
          >
            Écart {f.gravite}
          </Badge>
          <Badge
            variant={OPEN.has(f.statut) ? 'primary' : 'secondary'}
            appearance="light"
          >
            {f.statut_libelle}
          </Badge>
        </div>
      </div>
      {f.explication && (
        <p className="text-sm text-muted-foreground">{f.explication}</p>
      )}
      {OPEN.has(f.statut) && f.a_faire && (
        <p className="text-xs text-foreground">À faire : {f.a_faire}</p>
      )}
    </li>
  );
}

function Findings() {
  const { data, isLoading, error } = useFindings();
  const [all, setAll] = useState(false);
  const rows = useMemo(
    () => (data ?? []).filter((f) => all || OPEN.has(f.statut)),
    [data, all],
  );
  const open = (data ?? []).filter((f) => OPEN.has(f.statut)).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={!all ? 'primary' : 'outline'}
          onClick={() => setAll(false)}
        >
          À traiter <span className="tabular-nums">{open}</span>
        </Button>
        <Button
          size="sm"
          variant={all ? 'primary' : 'outline'}
          onClick={() => setAll(true)}
        >
          Tous <span className="tabular-nums">{data?.length ?? 0}</span>
        </Button>
        <Button size="sm" variant="ghost" className="ms-auto" asChild>
          <Link href="/qualiopi/capa">Actions correctives</Link>
        </Button>
      </div>
      <Refusal error={error} />
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((f) => (
                <FindingLine key={f.id} f={f} />
              ))}
            </ul>
          )}
          {data && rows.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              {all ? 'Aucun constat.' : 'Aucun écart à traiter.'}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Runs({ data }: { data: EvaluationsOverview }) {
  return (
    <Card>
      <CardContent className="p-0">
        <ul className="divide-y divide-border">
          {data.evaluations.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm"
            >
              <span className="tabular-nums text-foreground whitespace-nowrap">
                {formatDate(r.debut, 'd MMM yyyy HH:mm')}
              </span>
              <span className="text-muted-foreground min-w-0 grow">
                {r.declencheur} · {r.cible}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {r.resultats} résultat{r.resultats > 1 ? 's' : ''}
              </span>
            </li>
          ))}
        </ul>
        {data.evaluations.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            Aucune évaluation pour l’instant.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function EvaluationsPage() {
  const { data, isLoading, error } = useEvaluations();
  const reevaluate = useReevaluate();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = params.get('vue') ?? 'indicateurs';
  const indicateur = params.get('indicateur') ?? ALL;
  const go = (vue: string, ind?: string) => {
    const next = new URLSearchParams();
    if (vue !== 'indicateurs') next.set('vue', vue);
    if (ind && ind !== ALL) next.set('indicateur', ind);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const canReevaluate = data?.capabilities.reevaluer.allowed;

  async function run() {
    try {
      await reevaluate.mutateAsync();
      toast.success('Réévaluation terminée');
    } catch (e) {
      toast.error('Réévaluation refusée', {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  return (
    <>
      <ContentHeader>
        <h1 className="inline-flex items-center gap-2.5 text-sm font-semibold">
          <ClipboardCheck className="size-4 text-primary" />
          Évaluations
          {data && (
            <Badge variant="primary" appearance="light" size="sm">
              {data.referentiel}
            </Badge>
          )}
        </h1>
        {canReevaluate && (
          <Button size="sm" onClick={run} disabled={reevaluate.isPending}>
            {reevaluate.isPending ? (
              <LoaderCircleIcon className="animate-spin" />
            ) : (
              <RefreshCw />
            )}
            Tout réévaluer
          </Button>
        )}
      </ContentHeader>
      <Content className="block">
        <div className="container-fluid space-y-5">
          <Refusal error={error} />
          {isLoading && <Skeleton className="h-20" />}
          {data && (
            <Card>
              <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4 sm:p-5">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    Dernière évaluation
                  </p>
                  <p className="text-sm font-medium text-foreground">
                    {data.derniere
                      ? `${formatDate(data.derniere.debut, 'd MMM yyyy à HH:mm')} · ${data.derniere.declencheur}`
                      : 'Aucune pour l’instant'}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Période</p>
                  <p className="text-sm text-foreground">
                    {data.periode.label}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground basis-full">
                  {data.avertissement} Le moteur réévalue tout seul après chaque
                  modification des données.
                </p>
              </CardContent>
            </Card>
          )}
          <Tabs
            value={tab}
            onValueChange={(v) => go(v, indicateur)}
            className="text-sm min-w-0"
          >
            <TabsList
              variant="line"
              className="w-0 min-w-full gap-6 bg-transparent justify-start overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&_button]:border-b [&_button_svg]:size-4 [&_button]:text-secondary-foreground"
            >
              <TabsTrigger value="indicateurs">
                <ListChecks /> Par indicateur
              </TabsTrigger>
              <TabsTrigger value="controles">
                <ClipboardCheck /> Contrôles
              </TabsTrigger>
              <TabsTrigger value="constats">
                <TriangleAlert /> Constats
              </TabsTrigger>
              <TabsTrigger value="historique">
                <History /> Historique
              </TabsTrigger>
            </TabsList>
            <div className="pt-5">
              <TabsContent value="indicateurs">
                {data && (
                  <ByIndicator
                    data={data}
                    onPick={(n) => go('controles', String(n))}
                  />
                )}
              </TabsContent>
              <TabsContent value="controles">
                <Results
                  indicateur={indicateur}
                  setIndicateur={(v) => go('controles', v)}
                />
              </TabsContent>
              <TabsContent value="constats">
                <Findings />
              </TabsContent>
              <TabsContent value="historique">
                {data && <Runs data={data} />}
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </Content>
    </>
  );
}
