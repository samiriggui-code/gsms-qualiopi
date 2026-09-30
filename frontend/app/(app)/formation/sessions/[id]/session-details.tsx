'use client';

import { ReactNode, useState } from 'react';
import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  Info,
  MapPin,
  Presentation,
  Users,
} from 'lucide-react';
import { formatDateRange, percent } from '@/lib/format';
import { READINESS } from '@/lib/gsms/labels';
import { useDossier } from '@/lib/gsms/sessions';
import type { ReadinessStatus, SessionRow } from '@/lib/gsms/types';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

function Row({ icon: Icon, label, children }: { icon: typeof Info; label: string; children: ReactNode }) {
  return (
    <>
      <div className="col-span-2 pt-0.5">
        <div className="text-muted-foreground flex items-center gap-1.5">
          <Icon className="size-3.5 text-muted-foreground" />
          {label}
        </div>
      </div>
      <div className="col-span-3 text-mono">{children}</div>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <Collapsible className="space-y-2" open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="text-sm font-semibold [&:not(:hover)[data-state=open]]:bg-transparent hover:bg-accent ps-1.5 -ms-1.5"
        >
          <ChevronRight className="[[data-state=open]_&]:rotate-90" />
          {title}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );
}

const SUMMARY_LABELS: Record<string, string> = {
  preuves_manquantes: 'Preuves manquantes',
  preuves_a_valider: 'Preuves à valider',
  preuves_expirees: 'Preuves expirées',
  preuves_non_exploitables: 'Preuves non exploitables',
  conventions_non_signees: 'Conventions non signées',
};

export function SessionDetails({ sessionId, session }: { sessionId: string; session: SessionRow | undefined }) {
  const { data: dossier } = useDossier(sessionId);

  return (
    <Tabs defaultValue="details" className="grow text-sm">
      <TabsList variant="line" className="px-5 gap-6 bg-transparent max-lg:w-full max-lg:justify-start max-lg:overflow-x-auto max-lg:overflow-y-hidden max-lg:[scrollbar-width:none] [&_button]:border-b [&_button_svg]:size-3.5">
        <TabsTrigger value="details">
          <Info /> Détails
        </TabsTrigger>
      </TabsList>
      <ScrollArea className="w-full lg:h-[calc(100vh-10rem)] [&_[data-radix-scroll-area-viewport]>div]:!block">
        <div className="px-5 py-2">
          <TabsContent value="details" className="space-y-4">
            {!session ? (
              <div className="space-y-2.5 pt-2">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-3/4" />
              </div>
            ) : (
              <Section title="Session">
                <div className="grid grid-cols-5 gap-2.5">
                  <Row icon={BookOpen} label="Formation">
                    {session.program_title}
                    <div className="flex gap-1.5 mt-1">
                      <Badge variant="outline" size="sm">
                        {session.program_code}
                      </Badge>
                      {dossier?.session.program.certifying && (
                        <Badge variant="primary" appearance="light" size="sm">
                          Certifiante
                        </Badge>
                      )}
                    </div>
                  </Row>
                  <Row icon={CalendarDays} label="Dates">
                    {formatDateRange(session.start_date, session.end_date)}
                  </Row>
                  <Row icon={MapPin} label="Lieu">
                    {session.location ?? '—'}
                    {session.room && <div className="text-muted-foreground text-xs">{session.room}</div>}
                  </Row>
                  <Row icon={Presentation} label="Formateur">
                    {session.trainer_name ?? <span className="text-destructive">À affecter</span>}
                  </Row>
                  <Row icon={Users} label="Stagiaires">
                    {session.learners_count}
                    {session.capacity ? ` / ${session.capacity} places` : ''}
                  </Row>
                </div>
                {session.cancel_reason && (
                  <p className="mt-2 text-sm text-destructive">Annulée : {session.cancel_reason}</p>
                )}
              </Section>
            )}

            <Separator />

            <Section title="Complétude du dossier">
              {!dossier ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <div className="space-y-3">
                  {dossier.checklist
                    .filter((c) => c.applicable && c.total > 0)
                    .map((c) => {
                      const complete = c.done >= c.total;
                      return (
                        <div key={c.label} className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-secondary-foreground">{c.label}</span>
                            <span className={cn('text-xs font-medium', complete ? 'text-green-600' : 'text-destructive')}>
                              {c.done}/{c.total}
                            </span>
                          </div>
                          <Progress
                            value={percent(c.done, c.total)}
                            className="h-1.5"
                            indicatorClassName={complete ? 'bg-green-500' : 'bg-destructive'}
                          />
                        </div>
                      );
                    })}
                </div>
              )}
            </Section>

            {dossier && (
              <>
                <Separator />
                <Section title="Préparation Qualiopi">
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-1.5">
                      {(Object.entries(dossier.summary.indicateurs) as [ReadinessStatus, number][])
                        .filter(([status, n]) => n > 0 && status !== 'NON_APPLICABLE')
                        .map(([status, n]) => (
                          <Badge key={status} className={READINESS[status].color}>
                            {READINESS[status].label} : {n}
                          </Badge>
                        ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(SUMMARY_LABELS).map(([key, label]) => {
                        const n = Number((dossier.summary as unknown as Record<string, number>)[key] ?? 0);
                        return (
                          <div key={key} className="rounded-md border border-border px-2.5 py-2">
                            <div className={cn('text-lg font-semibold tabular-nums', n > 0 ? 'text-destructive' : 'text-mono')}>
                              {n}
                            </div>
                            <div className="text-xs text-muted-foreground">{label}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </Section>
              </>
            )}
          </TabsContent>
        </div>
      </ScrollArea>
    </Tabs>
  );
}
