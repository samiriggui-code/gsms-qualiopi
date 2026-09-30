'use client';

import Link from 'next/link';
import { CircleAlert, History, ShieldCheck, Wrench } from 'lucide-react';
import { formatDate } from '@/lib/format';
import type { CapaAction, CapaStep } from '@/lib/gsms/capa';
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
import { CAPA_STATUS, STEPS } from './columns';

const EVENTS: Record<string, string> = {
  CREATED: 'Action ouverte',
  EN_COURS: 'Action démarrée',
  A_VERIFIER: 'Déclarée réalisée',
  CLOTUREE: 'Clôturée',
  ANNULEE: 'Annulée',
  VERIFICATION_REQUESTED: 'Vérification demandée au moteur',
};

function eventLabel(type: string) {
  const [head, tail] = type.split(':');
  return (
    EVENTS[tail ?? head] ??
    EVENTS[head] ??
    type.toLowerCase().replaceAll('_', ' ')
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div className="text-sm text-foreground whitespace-pre-line">
        {children}
      </div>
    </div>
  );
}

// Fiche d'une action : tout son contenu, son historique, et les étapes permises par l'API.
export function CapaSheet({
  action,
  onClose,
  onStep,
}: {
  action: CapaAction | null;
  onClose: () => void;
  onStep: (action: CapaAction, step: CapaStep) => void;
}) {
  const a = action;
  const steps = a ? STEPS.filter((s) => a.capabilities[s]) : [];
  const allowed = a ? steps.filter((s) => a.capabilities[s].allowed) : [];
  const refused = a
    ? steps
        .map((s) => a.capabilities[s])
        .find((d) => !d.allowed && d.code !== 'PERMISSION_MISSING')
    : undefined;

  return (
    <Sheet open={!!a} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:w-[620px] sm:max-w-none inset-5 start-auto max-sm:inset-2 max-sm:w-auto h-auto rounded-lg p-0 gap-0 [&_[data-slot=sheet-close]]:top-4.5 [&_[data-slot=sheet-close]]:end-5">
        {a && (
          <>
            <SheetHeader className="border-b py-3.5 px-5 border-border">
              <SheetTitle className="flex items-center gap-2.5 pe-8">
                <Wrench className="text-primary size-4 shrink-0" />
                {a.reference}
                <Badge className={CAPA_STATUS[a.statut].color}>
                  {CAPA_STATUS[a.statut].label}
                </Badge>
                {a.en_retard && (
                  <Badge variant="destructive" appearance="light">
                    En retard
                  </Badge>
                )}
              </SheetTitle>
            </SheetHeader>
            <SheetBody className="p-0 grow flex flex-col min-h-0">
              <ScrollArea className="h-[calc(100dvh-11.75rem)] max-sm:h-[calc(100dvh-9.75rem)] [&_[data-radix-scroll-area-viewport]>div]:!block">
                <div className="space-y-5 p-5">
                  <div className="space-y-1">
                    <h2 className="text-base font-semibold text-foreground">
                      {a.titre}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Action{' '}
                      {a.type === 'CORRECTIVE' ? 'corrective' : 'préventive'} ·
                      responsable {a.responsable} · échéance{' '}
                      {formatDate(a.echeance)}
                    </p>
                  </div>

                  {a.ecart && (
                    <div className="flex items-start gap-3 rounded-lg border border-border p-3.5">
                      <CircleAlert className="size-4 text-yellow-500 mt-0.5 shrink-0" />
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                          Écart {a.ecart.reference}
                          <Badge variant="outline" size="sm" asChild>
                            <Link
                              href={`/qualiopi/referentiel/${a.ecart.indicateur}`}
                            >
                              <ShieldCheck className="size-3" /> Indicateur{' '}
                              {a.ecart.indicateur}
                            </Link>
                          </Badge>
                        </div>
                        <p className="text-sm text-secondary-foreground">
                          {a.ecart.titre}
                        </p>
                      </div>
                    </div>
                  )}

                  {a.cause && (
                    <Section title="Cause identifiée">{a.cause}</Section>
                  )}
                  <Section title="Plan d’action">{a.plan}</Section>
                  {a.realisation && (
                    <Section
                      title={`Réalisation${a.realisee_le ? ` · ${formatDate(a.realisee_le)}` : ''}`}
                    >
                      {a.realisation}
                    </Section>
                  )}
                  {a.verification && (
                    <Section
                      title={`Vérification d’efficacité${a.verifiee_par ? ` · ${a.verifiee_par}` : ''}`}
                    >
                      {a.verification}
                    </Section>
                  )}

                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <History className="size-3.5" /> Historique
                    </div>
                    <ol className="relative space-y-3 border-s border-border ms-1.5 ps-4">
                      {a.historique.map((h, i) => (
                        <li key={i} className="relative">
                          <span className="absolute -start-[21px] top-1.5 size-2 rounded-full bg-primary" />
                          <div className="text-sm text-foreground">
                            {eventLabel(h.type)}
                          </div>
                          {h.detail && (
                            <div className="text-xs text-secondary-foreground">
                              {h.detail}
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground">
                            {h.par} · {formatDate(h.le, 'd MMM yyyy à HH:mm')}
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              </ScrollArea>
            </SheetBody>
            <SheetFooter className="flex flex-row flex-wrap items-center gap-2 border-t border-border py-3.5 px-5">
              {refused && allowed.length === 0 && (
                <span className="text-xs text-muted-foreground me-auto">
                  {!refused.allowed && refused.message}
                </span>
              )}
              <Button
                variant="outline"
                onClick={onClose}
                className={cn(allowed.length > 0 && 'me-auto')}
              >
                Fermer
              </Button>
              {allowed.map((s) => (
                <Button
                  key={s}
                  variant={s === 'annuler' ? 'outline' : 'primary'}
                  className={cn(s === 'annuler' && 'text-destructive')}
                  onClick={() => onStep(a, s)}
                >
                  {a.capabilities[s].libelle}
                </Button>
              ))}
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
