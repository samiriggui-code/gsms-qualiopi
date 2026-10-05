'use client';

// Résultats & taux (indicateurs 2 et 3) : ce que les sessions terminées ont réellement donné, formation par
// formation. Les taux viennent de l'API (examens, abandons, enquêtes à chaud enregistrés dans GSMS) ; un taux
// n'est publié sur la fiche formation que sur demande, avec sa période et ses effectifs.
import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Award,
  LoaderCircleIcon,
  Send,
  TrendingUp,
  TriangleAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/format';
import {
  usePublishResults,
  useResults,
  type Measure,
  type ProgramResults,
  type ResultsOverview,
} from '@/lib/gsms/offre';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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

const PERIODS = [
  { value: '6', label: '6 derniers mois' },
  { value: '12', label: '12 derniers mois' },
  { value: '24', label: '24 derniers mois' },
];

const pct = (v: number | null | undefined) =>
  v == null ? '—' : `${v.toLocaleString('fr-FR')} %`;

function Kpi({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-5 space-y-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold text-foreground tabular-nums">
          {value}
        </p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function Totals({ data }: { data: ResultsOverview }) {
  const t = data.totaux;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
      <Kpi
        label="Sessions terminées"
        value={String(t.sessions)}
        detail={`${t.stagiaires} stagiaire${t.stagiaires > 1 ? 's' : ''}, ${data.formations_mesurees} formation${data.formations_mesurees > 1 ? 's' : ''}`}
      />
      <Kpi
        label="Réussite à l’examen"
        value={pct(t.taux_reussite)}
        detail={`${t.reussis} reçu${t.reussis > 1 ? 's' : ''} sur ${t.examines} présenté${t.examines > 1 ? 's' : ''}`}
      />
      <Kpi
        label="Abandons"
        value={pct(t.taux_abandon)}
        detail={`${t.abandons} sur ${t.stagiaires} stagiaire${t.stagiaires > 1 ? 's' : ''}`}
      />
      <Kpi
        label="Satisfaction à chaud"
        value={pct(t.taux_satisfaction)}
        detail={`${t.satisfaits} satisfait${t.satisfaits > 1 ? 's' : ''} sur ${t.repondants} répondant${t.repondants > 1 ? 's' : ''}`}
      />
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums text-foreground">
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function Measured({ m }: { m: Measure }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <Metric
        label="Réussite"
        value={pct(m.taux_reussite)}
        detail={m.examines ? `${m.reussis} sur ${m.examines}` : 'aucun examen'}
      />
      <Metric
        label="Abandons"
        value={pct(m.taux_abandon)}
        detail={`${m.abandons} sur ${m.stagiaires}`}
      />
      <Metric
        label="Satisfaction"
        value={pct(m.taux_satisfaction)}
        detail={
          m.repondants
            ? `${m.satisfaits} sur ${m.repondants}${m.note_moyenne != null ? ` · ${m.note_moyenne.toLocaleString('fr-FR')}/5` : ''}`
            : 'aucune réponse'
        }
      />
    </div>
  );
}

function Published({ p }: { p: ProgramResults['publie'] }) {
  if (p.taux_reussite == null && p.taux_satisfaction == null)
    return (
      <p className="text-xs text-muted-foreground">
        Aucun taux publié sur la fiche formation.
      </p>
    );
  const parts = [
    p.taux_reussite != null && `réussite ${pct(p.taux_reussite)}`,
    p.taux_satisfaction != null && `satisfaction ${pct(p.taux_satisfaction)}`,
  ].filter(Boolean);
  return (
    <p className="text-xs text-muted-foreground">
      Publié sur la fiche : {parts.join(', ')}
      {p.base
        ? ` · sessions du ${formatDate(p.base.du)} au ${formatDate(p.base.au)}, ${p.base.stagiaires} stagiaires · publié le ${formatDate(p.base.publie_le)} par ${p.base.publie_par}`
        : ''}
    </p>
  );
}

function ProgramCard({
  r,
  onPublish,
}: {
  r: ProgramResults;
  onPublish: (r: ProgramResults) => void;
}) {
  const decision = r.capabilities.publier;
  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 grow basis-60">
          <p className="text-xs text-muted-foreground">{r.code}</p>
          <h2 className="text-sm font-semibold text-foreground">{r.title}</h2>
        </div>
        {r.is_certifying && (
          <Badge variant="info" appearance="light" className="shrink-0">
            <Award /> Certifiante
          </Badge>
        )}
      </div>
      {r.mesure ? (
        <>
          <Measured m={r.mesure} />
          <p className="text-xs text-muted-foreground">
            {r.mesure.sessions} session{r.mesure.sessions > 1 ? 's' : ''}{' '}
            terminée{r.mesure.sessions > 1 ? 's' : ''}, {r.mesure.stagiaires}{' '}
            stagiaire{r.mesure.stagiaires > 1 ? 's' : ''}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Aucune session terminée sur la période.
        </p>
      )}
      <Published p={r.publie} />
      {r.ecarts.length > 0 && (
        <ul className="space-y-1">
          {r.ecarts.map((e) => (
            <li key={e} className="flex items-start gap-2 text-xs">
              <TriangleAlert className="size-3.5 shrink-0 mt-0.5 text-warning" />
              <span className="text-foreground">{e}</span>
            </li>
          ))}
        </ul>
      )}
      {decision.allowed && (
        <Button size="sm" variant="outline" onClick={() => onPublish(r)}>
          <Send /> Publier les taux mesurés
        </Button>
      )}
    </div>
  );
}

function PublishDialog({
  target,
  mois,
  onClose,
}: {
  target: ProgramResults | null;
  mois: number;
  onClose: () => void;
}) {
  const publish = usePublishResults();
  const m = target?.mesure;
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(o) => {
        if (!o) {
          publish.reset();
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Publier les taux mesurés</DialogTitle>
          <DialogDescription>{target?.title}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3 text-sm">
          {m && (
            <ul className="list-disc ps-5 space-y-1">
              {m.taux_reussite != null && (
                <li>
                  Réussite : {pct(m.taux_reussite)} ({m.reussis} reçus sur{' '}
                  {m.examines} présentés)
                </li>
              )}
              {m.taux_satisfaction != null && (
                <li>
                  Satisfaction : {pct(m.taux_satisfaction)} ({m.satisfaits}{' '}
                  satisfaits sur {m.repondants} répondants)
                </li>
              )}
            </ul>
          )}
          <p className="text-muted-foreground">
            Ces taux remplacent ceux de la fiche formation, avec leur période et
            leurs effectifs. La fiche reste à relire avant toute diffusion.
          </p>
          <Refusal error={publish.error} />
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button
            disabled={publish.isPending || !target}
            onClick={() =>
              target &&
              publish.mutate(
                { id: target.id, mois },
                {
                  onSuccess: () => {
                    toast.success('Taux publiés sur la fiche formation.');
                    onClose();
                  },
                },
              )
            }
          >
            {publish.isPending && (
              <LoaderCircleIcon className="size-4 animate-spin" />
            )}
            Publier
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ResultsPage() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const mois = Number(params.get('mois') ?? 12) || 12;
  const [view, setView] = useState('mesurees');
  const [target, setTarget] = useState<ProgramResults | null>(null);
  const { data, isLoading, error } = useResults(mois);
  const rows = data?.formations ?? [];
  const measured = rows.filter((r) => r.mesure);
  const gaps = rows.filter((r) => r.ecarts.length);
  const shown =
    view === 'mesurees' ? measured : view === 'ecarts' ? gaps : rows;

  return (
    <>
      <ContentHeader>
        <h1 className="inline-flex items-center gap-2.5 text-sm font-semibold">
          <TrendingUp className="size-4 text-primary" />
          Résultats & taux
        </h1>
        <Select
          value={String(mois)}
          onValueChange={(v) =>
            router.replace(v === '12' ? pathname : `${pathname}?mois=${v}`, {
              scroll: false,
            })
          }
        >
          <SelectTrigger size="sm" className="w-44" aria-label="Période">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </ContentHeader>
      <Content className="block">
        <div className="container-fluid space-y-5">
          <Refusal error={error} />
          {data ? (
            <>
              <p className="text-sm text-muted-foreground max-w-3xl">
                Taux calculés sur les sessions terminées du{' '}
                {formatDate(data.periode.du)} au {formatDate(data.periode.au)},
                à partir des examens, abandons et enquêtes à chaud enregistrés
                ici. Un taux n’est publié sur la fiche formation que sur
                demande, avec sa période et ses effectifs.
              </p>
              <Totals data={data} />
              <details className="rounded-xl border border-border bg-card p-4 text-sm">
                <summary className="cursor-pointer font-medium">
                  Comment les taux sont calculés
                </summary>
                <ul className="mt-3 space-y-1.5 text-muted-foreground list-disc ps-5">
                  {Object.values(data.methode).map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </details>
            </>
          ) : (
            isLoading && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24" />
                ))}
              </div>
            )
          )}
          <Tabs
            value={view}
            onValueChange={setView}
            className="text-sm min-w-0"
          >
            <TabsList
              variant="line"
              className="w-0 min-w-full gap-6 bg-transparent justify-start overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&_button]:border-b [&_button]:text-secondary-foreground"
            >
              <TabsTrigger value="mesurees">
                Mesurées ({measured.length})
              </TabsTrigger>
              <TabsTrigger value="ecarts">Écarts ({gaps.length})</TabsTrigger>
              <TabsTrigger value="toutes">Toutes ({rows.length})</TabsTrigger>
            </TabsList>
            <TabsContent value={view} className="pt-5">
              {shown.length ? (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                  {shown.map((r) => (
                    <ProgramCard key={r.id} r={r} onPublish={setTarget} />
                  ))}
                </div>
              ) : (
                data && (
                  <Card>
                    <CardContent
                      className={cn(
                        'flex flex-col items-center gap-3 py-10 text-center',
                      )}
                    >
                      <TrendingUp className="size-6 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground max-w-md">
                        {view === 'ecarts'
                          ? 'Aucun écart entre les taux publiés et les résultats mesurés.'
                          : 'Aucune session terminée sur la période. Les taux apparaîtront avec les premières sessions closes.'}
                      </p>
                    </CardContent>
                  </Card>
                )
              )}
            </TabsContent>
          </Tabs>
        </div>
      </Content>
      <PublishDialog
        target={target}
        mois={mois}
        onClose={() => setTarget(null)}
      />
    </>
  );
}
