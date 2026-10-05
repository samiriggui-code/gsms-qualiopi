'use client';

// Un audit : la photo figée de chaque indicateur (état du moteur, preuves, écarts) et le jugement de
// l'auditeur. Juger et clore suivent les décisions de l'API ; la clôture crée les constats d'audit.
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Lock, ScanSearch } from 'lucide-react';
import { formatDate } from '@/lib/format';
import { JUDGMENT_TONE, useAudit, type AuditItem } from '@/lib/gsms/audits';
import { READINESS } from '@/lib/gsms/labels';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Refusal } from '@/components/gsms/refusal';
import { Content } from '@/components/layout/components/content';
import { ContentHeader } from '@/components/layout/components/content-header';
import { IndicatorName } from '@/components/qualiopi/indicator-name';
import { CloseDialog } from './close-dialog';
import { JudgeDialog } from './judge-dialog';

function ItemLine({
  item,
  canJudge,
  onOpen,
}: {
  item: AuditItem;
  canJudge: boolean;
  onOpen: () => void;
}) {
  const engine = READINESS[item.etat_moteur];
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="w-full text-start flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-3 hover:bg-muted/40 outline-none focus-visible:bg-muted/40"
      >
        <div className="min-w-0 grow basis-56">
          <div className="text-sm font-medium text-foreground">
            <IndicatorName number={item.numero} />
          </div>
          <div className="text-xs text-muted-foreground">
            Indicateur {item.numero} · {item.preuves.length} preuve
            {item.preuves.length > 1 ? 's' : ''} figée
            {item.preuves.length > 1 ? 's' : ''}
            {item.ecarts_ouverts.length > 0 &&
              ` · ${item.ecarts_ouverts.length} écart${item.ecarts_ouverts.length > 1 ? 's' : ''}`}
            {item.constat && ` · constat ${item.constat}`}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge size="sm" className={engine?.color}>
            Moteur : {engine?.label ?? item.etat_moteur}
          </Badge>
          {item.jugement ? (
            <Badge className={JUDGMENT_TONE[item.jugement]}>
              {item.jugement_libelle}
            </Badge>
          ) : (
            <Badge variant="outline">{canJudge ? 'À juger' : 'Non jugé'}</Badge>
          )}
        </div>
      </button>
    </li>
  );
}

export default function AuditPage() {
  const { id } = useParams<{ id: string }>();
  const { data: a, isLoading, error } = useAudit(id);
  const [openNumber, setOpenNumber] = useState<number | null>(null);
  const [closing, setClosing] = useState(false);
  const canJudge = !!a?.capabilities.juger.allowed;
  const close = a?.capabilities.clore;
  const item = a?.indicateurs.find((i) => i.numero === openNumber) ?? null;
  const order = a?.indicateurs.map((i) => i.numero) ?? [];
  const next = (n: number) => {
    const pending = a?.indicateurs.find((i) => i.numero > n && !i.jugement);
    return pending?.numero ?? null;
  };

  return (
    <>
      <ContentHeader>
        <h1 className="inline-flex items-center gap-2.5 text-sm font-semibold min-w-0">
          <ScanSearch className="size-4 text-primary shrink-0" />
          <span className="truncate">{a?.reference ?? 'Audit'}</span>
          {a && (
            <Badge
              variant={a.statut === 'CLOS' ? 'secondary' : 'primary'}
              appearance="light"
              size="sm"
            >
              {a.statut_libelle}
            </Badge>
          )}
        </h1>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link href="/qualiopi/audits">
              <ArrowLeft /> Audits
            </Link>
          </Button>
          {close?.allowed && (
            <Button size="sm" onClick={() => setClosing(true)}>
              <Lock /> Clore l’audit
            </Button>
          )}
        </div>
      </ContentHeader>
      <Content className="block">
        <div className="container-fluid space-y-5">
          <Refusal error={error} />
          {isLoading && <Skeleton className="h-32" />}
          {a && (
            <Card>
              <CardContent className="space-y-4 p-4 sm:p-5">
                <div className="space-y-1">
                  <h2 className="text-base font-semibold text-foreground">
                    {a.titre}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {a.type_libelle} · {a.auditeur} · {a.referentiel} · photo du{' '}
                    {formatDate(a.photo_le, 'd MMM yyyy à HH:mm')}
                    {a.prevu_le && ` · prévu le ${formatDate(a.prevu_le)}`}
                    {a.clos_le && ` · clos le ${formatDate(a.clos_le)}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Échantillon :{' '}
                    {a.echantillon.length
                      ? a.echantillon.join(', ')
                      : 'aucune session'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Progress
                    aria-label="Indicateurs jugés"
                    value={
                      a.progression.total
                        ? (a.progression.juges / a.progression.total) * 100
                        : 0
                    }
                    className="h-1.5 grow"
                  />
                  <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                    {a.progression.juges}/{a.progression.total} jugés
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {a.jugements.map((j) => (
                    <Badge
                      key={j.jugement}
                      className={JUDGMENT_TONE[j.jugement]}
                      size="sm"
                    >
                      {j.libelle} · {j.nombre}
                    </Badge>
                  ))}
                </div>
                {close &&
                  !close.allowed &&
                  close.code === 'JUDGMENTS_MISSING' && (
                    <p className="text-xs text-muted-foreground">
                      {close.message} avant de pouvoir clore l’audit.
                    </p>
                  )}
                {a.conclusion && (
                  <div className="rounded-lg border border-border p-3.5">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Conclusion
                    </p>
                    <p className="text-sm text-foreground whitespace-pre-line">
                      {a.conclusion}
                    </p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {a.avertissement}
                </p>
              </CardContent>
            </Card>
          )}
          {a && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              {a.criteres.map((c) => {
                const items = a.indicateurs.filter(
                  (i) => i.critere === c.numero,
                );
                if (!items.length) return null;
                return (
                  <Card key={c.numero} className="min-w-0">
                    <CardHeader className="min-h-12">
                      <CardTitle className="text-sm">
                        {c.titre}{' '}
                        <span className="font-normal text-muted-foreground">
                          · Critère {c.numero}
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <ul className={cn('divide-y divide-border')}>
                        {items.map((i) => (
                          <ItemLine
                            key={i.numero}
                            item={i}
                            canJudge={canJudge}
                            onOpen={() => setOpenNumber(i.numero)}
                          />
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </Content>
      {a && (
        <JudgeDialog
          audit={a}
          item={item}
          order={order}
          onNavigate={setOpenNumber}
          nextPending={next}
          onClose={() => setOpenNumber(null)}
        />
      )}
      {a && (
        <CloseDialog
          audit={a}
          open={closing}
          onClose={() => setClosing(false)}
        />
      )}
    </>
  );
}
