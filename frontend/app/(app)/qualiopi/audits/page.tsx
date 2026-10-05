'use client';

// Audits internes : chaque audit fige, à son ouverture, les résultats du moteur, les preuves et les écarts
// de l'échantillon ; l'auditeur juge ensuite chaque indicateur sur cette photo. L'onglet Évolution compare
// les derniers audits indicateur par indicateur.
import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChartNoAxesColumn, Plus, ScanSearch } from 'lucide-react';
import { formatDate } from '@/lib/format';
import {
  JUDGMENT_TONE,
  useAuditComparison,
  useAudits,
  type AuditSummary,
} from '@/lib/gsms/audits';
import { READINESS } from '@/lib/gsms/labels';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Refusal } from '@/components/gsms/refusal';
import { Content } from '@/components/layout/components/content';
import { ContentHeader } from '@/components/layout/components/content-header';
import { IndicatorName } from '@/components/qualiopi/indicator-name';
import { NewAuditSheet } from './new-audit-sheet';

function AuditCard({ a }: { a: AuditSummary }) {
  const { juges, total } = a.progression;
  return (
    <Link
      href={`/qualiopi/audits/${a.id}`}
      className="block rounded-xl border border-border bg-card p-4 sm:p-5 hover:border-primary/40 transition-colors"
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 grow basis-60">
          <p className="text-xs text-muted-foreground tabular-nums">
            {a.reference} · {a.type_libelle}
          </p>
          <h2 className="text-base font-semibold text-foreground">{a.titre}</h2>
          <p className="text-xs text-muted-foreground">
            {a.auditeur} · photo du {formatDate(a.photo_le)}
            {a.echantillon.length > 0 &&
              ` · échantillon : ${a.echantillon.join(', ')}`}
          </p>
        </div>
        <Badge
          variant={a.statut === 'CLOS' ? 'secondary' : 'primary'}
          appearance="light"
        >
          {a.statut_libelle}
        </Badge>
      </div>
      <div className="mt-4 space-y-2">
        <div className="flex items-center gap-3">
          <Progress
            aria-label="Indicateurs jugés"
            value={total ? (juges / total) * 100 : 0}
            className="h-1.5 grow"
          />
          <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
            {juges}/{total} jugés
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {a.jugements
            .filter((j) => j.nombre > 0)
            .map((j) => (
              <Badge
                key={j.jugement}
                className={JUDGMENT_TONE[j.jugement]}
                size="sm"
              >
                {j.libelle} · {j.nombre}
              </Badge>
            ))}
        </div>
        {a.conclusion && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {a.conclusion}
          </p>
        )}
      </div>
    </Link>
  );
}

function Comparison() {
  const { data, isLoading, error } = useAuditComparison(true);
  if (isLoading) return <Skeleton className="h-64" />;
  if (error) return <Refusal error={error} />;
  if (!data || data.audits.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        Aucun audit à comparer pour l’instant.
      </p>
    );
  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[36rem]">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="text-start font-medium px-4 py-2.5">Indicateur</th>
              {data.audits.map((a) => (
                <th key={a.id} className="text-start font-medium px-3 py-2.5">
                  {a.reference}
                  <div className="font-normal">{formatDate(a.photo_le)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.indicateurs.map((row) => (
              <tr key={row.indicator}>
                <td className="px-4 py-2 align-top">
                  <span className="text-foreground">
                    <IndicatorName number={row.indicator} />
                  </span>
                  <div className="text-xs text-muted-foreground">
                    Indicateur {row.indicator}
                  </div>
                </td>
                {row.points.map((p) => (
                  <td key={p.audit} className="px-3 py-2 align-top space-y-1">
                    {p.engine && (
                      <Badge size="sm" className={READINESS[p.engine]?.color}>
                        {READINESS[p.engine]?.label ?? p.engine}
                      </Badge>
                    )}
                    {p.judgment && (
                      <div>
                        <Badge size="sm" className={JUDGMENT_TONE[p.judgment]}>
                          {p.jugement_libelle}
                        </Badge>
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

export default function AuditsPage() {
  const { data, isLoading, error } = useAudits();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = params.get('vue') ?? 'audits';
  const [creating, setCreating] = useState(false);
  const audits = data?.audits ?? [];

  return (
    <>
      <ContentHeader>
        <h1 className="inline-flex items-center gap-2.5 text-sm font-semibold">
          <ScanSearch className="size-4 text-primary" />
          Audits
          {data && (
            <span className="text-xs font-normal text-muted-foreground">
              {audits.length} audit{audits.length > 1 ? 's' : ''}
            </span>
          )}
        </h1>
        {data?.capabilities.creer.allowed && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus /> Nouvel audit
          </Button>
        )}
      </ContentHeader>
      <Content className="block">
        <div className="container-fluid space-y-5">
          {data && (
            <p className="text-sm text-muted-foreground max-w-3xl">
              {data.avertissement}
            </p>
          )}
          <Refusal error={error} />
          <Tabs
            value={tab}
            onValueChange={(v) =>
              router.replace(
                v === 'audits' ? pathname : `${pathname}?vue=${v}`,
                {
                  scroll: false,
                },
              )
            }
            className="text-sm min-w-0"
          >
            <TabsList
              variant="line"
              className="w-0 min-w-full gap-6 bg-transparent justify-start overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&_button]:border-b [&_button_svg]:size-4 [&_button]:text-secondary-foreground"
            >
              <TabsTrigger value="audits">
                <ScanSearch /> Audits
              </TabsTrigger>
              <TabsTrigger value="evolution">
                <ChartNoAxesColumn /> Évolution
              </TabsTrigger>
            </TabsList>
            <div className="pt-5">
              <TabsContent value="audits">
                {isLoading ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <Skeleton className="h-40" />
                    <Skeleton className="h-40" />
                  </div>
                ) : audits.length ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {audits.map((a) => (
                      <AuditCard key={a.id} a={a} />
                    ))}
                  </div>
                ) : (
                  <Card>
                    <CardContent
                      className={cn(
                        'flex flex-col items-center gap-3 py-10 text-center',
                      )}
                    >
                      <ScanSearch className="size-6 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground max-w-md">
                        Aucun audit pour l’instant. Un audit blanc avant la
                        visite du certificateur permet de repérer les écarts à
                        temps.
                      </p>
                      {data?.capabilities.creer.allowed && (
                        <Button size="sm" onClick={() => setCreating(true)}>
                          <Plus /> Ouvrir un audit
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
              <TabsContent value="evolution">
                {tab === 'evolution' && <Comparison />}
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </Content>
      <NewAuditSheet open={creating} onOpenChange={setCreating} />
    </>
  );
}
