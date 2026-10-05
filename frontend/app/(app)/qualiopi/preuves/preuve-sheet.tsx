'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CircleAlert, FileCheck2, History, Link2 } from 'lucide-react';
import { formatDate } from '@/lib/format';
import {
  EVIDENCE_STATUS_HELP,
  EVIDENCE_TONE,
  useEvidence,
  type EvidenceDetail,
} from '@/lib/gsms/preuves';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { Refusal } from '@/components/gsms/refusal';
import { DecisionDialog } from './decision-dialog';

const ANSWER: Record<string, string> = {
  OUI: 'Oui',
  NON: 'Non',
  SANS_OBJET: 'Sans objet',
};

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: typeof History;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {Icon && <Icon className="size-3.5" />}
        {title}
      </h3>
      {children}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{value}</dd>
    </div>
  );
}

function Body({ p }: { p: EvidenceDetail }) {
  return (
    <div className="space-y-6 p-5">
      <div className="space-y-1.5">
        <h2 className="text-base font-semibold text-foreground">{p.libelle}</h2>
        <p className="text-xs text-muted-foreground">
          {EVIDENCE_STATUS_HELP[p.statut]}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Fact label="Type" value={p.type_libelle} />
        <Fact label="Pour" value={`${p.portee_libelle} · ${p.cible}`} />
        <Fact label="Produite le" value={formatDate(p.produite_le)} />
        <Fact label="Par" value={p.par} />
        <Fact label="Valable jusqu’au" value={formatDate(p.valide_jusqu_au)} />
        <Fact label="Détectée le" value={formatDate(p.detectee_le)} />
      </dl>

      {p.problemes.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-border p-3.5">
          <CircleAlert className="size-4 text-destructive mt-0.5 shrink-0" />
          <div className="space-y-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              À corriger dans la donnée source
            </p>
            <ul className="list-disc ps-4 text-sm text-muted-foreground">
              {p.problemes.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <Section title="Indicateurs servis" icon={Link2}>
        {p.liens.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Cette preuve ne sert aucun indicateur du référentiel en vigueur.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {p.liens.map((l) => (
              <li
                key={l.indicateur}
                className="flex items-start gap-2 text-sm min-w-0"
              >
                <Link
                  href={`/qualiopi/referentiel?i=${l.indicateur}`}
                  className="text-primary hover:underline shrink-0"
                >
                  Indicateur {l.indicateur}
                </Link>
                <span className="text-muted-foreground min-w-0">
                  {l.titre}
                  {l.statut !== 'ACTIF' && ` (${l.statut.toLowerCase()})`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {p.grille.length > 0 && (
        <Section title="Grille de relecture">
          <ul className="space-y-1.5 text-sm">
            {p.grille.map((g) => (
              <li key={g.code} className="flex gap-2">
                <span className="text-xs text-muted-foreground tabular-nums shrink-0 pt-0.5">
                  {g.code}
                </span>
                <span className="text-foreground">{g.question}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Décisions">
        {p.decisions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucune relecture pour l’instant.
          </p>
        ) : (
          <ul className="space-y-3">
            {p.decisions.map((d, i) => (
              <li
                key={i}
                className="rounded-lg border border-border p-3 space-y-1.5"
              >
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge className={EVIDENCE_TONE[d.decision]} size="sm">
                    {d.decision === 'VALIDEE' ? 'Validée' : 'Rejetée'}
                  </Badge>
                  <span className="text-foreground">{d.par}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(d.le, 'd MMM yyyy HH:mm')}
                  </span>
                  {d.auto_validee && (
                    <Badge variant="warning" appearance="light" size="sm">
                      Déposée par la même personne
                    </Badge>
                  )}
                </div>
                {d.commentaire && (
                  <p className="text-sm text-muted-foreground whitespace-pre-line">
                    {d.commentaire}
                  </p>
                )}
                {Object.keys(d.grille).length > 0 && (
                  <ul className="text-xs text-muted-foreground space-y-0.5">
                    {Object.entries(d.grille).map(([code, a]) => (
                      <li key={code}>
                        {code} · {ANSWER[a.reponse] ?? a.reponse}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Historique" icon={History}>
        <ol className="space-y-2">
          {p.historique.map((h, i) => (
            <li key={i} className="text-sm">
              <span className="text-foreground">{h.libelle}</span>
              {h.detail && (
                <span className="text-muted-foreground"> · {h.detail}</span>
              )}
              <div className="text-xs text-muted-foreground">
                {formatDate(h.le, 'd MMM yyyy HH:mm')}
                {h.par && ` · ${h.par}`}
              </div>
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}

// Fiche d'une preuve : d'où elle vient, ce qu'elle prouve, qui l'a relue ; décisions permises par l'API.
export function PreuveSheet({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}) {
  const { data: p, isLoading, error } = useEvidence(id);
  const [decision, setDecision] = useState<'VALIDEE' | 'REJETEE' | null>(null);
  const caps = p?.capabilities;
  const refused = caps
    ? [caps.valider, caps.rejeter].find(
        (d) => !d.allowed && d.code !== 'PERMISSION_MISSING',
      )
    : undefined;

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="sm:w-[620px] sm:max-w-none inset-5 start-auto max-sm:inset-2 max-sm:w-auto h-auto rounded-lg p-0 gap-0 [&_[data-slot=sheet-close]]:top-4.5 [&_[data-slot=sheet-close]]:end-5">
        <SheetHeader className="border-b py-3.5 px-5 border-border">
          <SheetTitle className="flex items-center gap-2.5 pe-8">
            <FileCheck2 className="text-primary size-4 shrink-0" />
            {p?.reference ?? 'Preuve'}
            {p && (
              <Badge className={cn('shrink-0', EVIDENCE_TONE[p.statut])}>
                {p.statut_libelle}
              </Badge>
            )}
          </SheetTitle>
        </SheetHeader>
        <SheetBody className="p-0 grow flex flex-col min-h-0">
          <ScrollArea className="h-[calc(100dvh-11.75rem)] max-sm:h-[calc(100dvh-9.75rem)] [&_[data-radix-scroll-area-viewport]>div]:!block">
            {isLoading && (
              <div className="space-y-3 p-5">
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-24" />
                <Skeleton className="h-24" />
              </div>
            )}
            {error && (
              <div className="p-5">
                <Refusal error={error} />
              </div>
            )}
            {p && <Body p={p} />}
          </ScrollArea>
        </SheetBody>
        {caps && (caps.valider.allowed || caps.rejeter.allowed || refused) && (
          <SheetFooter className="flex flex-row flex-wrap items-center gap-2 border-t border-border py-3 px-5">
            {refused && !refused.allowed && (
              <span className="text-xs text-muted-foreground me-auto">
                {refused.message}
              </span>
            )}
            <div className="flex gap-2 ms-auto">
              {caps.rejeter.allowed && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDecision('REJETEE')}
                >
                  Rejeter
                </Button>
              )}
              {caps.valider.allowed && (
                <Button size="sm" onClick={() => setDecision('VALIDEE')}>
                  Valider
                </Button>
              )}
            </div>
          </SheetFooter>
        )}
      </SheetContent>
      <DecisionDialog
        preuve={decision ? (p ?? null) : null}
        decision={decision}
        onClose={() => setDecision(null)}
      />
    </Sheet>
  );
}
