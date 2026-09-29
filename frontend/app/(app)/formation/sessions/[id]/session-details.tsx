'use client';

import { ReactNode, useState } from 'react';
import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  Clock,
  Handshake,
  Info,
  MapPin,
  Presentation,
  Users,
} from 'lucide-react';
import { formatDateRange, percent } from '@/lib/format';
import { SessionDetail } from '@/lib/formation/sessions';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

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

interface Check {
  label: string;
  done: number;
  total: number;
  hint: string;
}

// Complétude du dossier de session : ce que l'auditeur Qualiopi viendra chercher.
function completeness(session: SessionDetail): Check[] {
  const active = session.enrollments.filter((e) => e.status !== 'ANNULE');
  const n = active.length;
  const started = session.status === 'EN_COURS' || session.status === 'TERMINEE' || session.status === 'CLOTUREE';
  const finished = session.status === 'TERMINEE' || session.status === 'CLOTUREE';
  const pastSlots = session.slots.filter((s) => s.trainer_signed_at || s.present + s.signed > 0).length;

  const checks: Check[] = [
    { label: 'Analyse du besoin', done: active.filter((e) => e.needs_analysis_done).length, total: n, hint: 'Indicateur 4' },
  ];
  if (session.program.is_certifying) {
    checks.push({ label: 'Positionnement', done: active.filter((e) => e.positioning_done).length, total: n, hint: 'Indicateur 8' });
  }
  if (session.status !== 'PLANIFIEE') {
    checks.push({ label: 'Convocations envoyées', done: active.filter((e) => e.convocation_sent_on).length, total: n, hint: 'Indicateur 9' });
    checks.push({ label: 'Conventions signées', done: active.filter((e) => e.agreement_signed_on).length, total: n, hint: 'Contractualisation' });
  }
  if (started) {
    checks.push({ label: 'Émargement formateur', done: session.slots_signed, total: pastSlots, hint: 'Indicateur 11 · assiduité' });
  }
  if (finished) {
    checks.push({ label: 'Évaluations des acquis', done: active.filter((e) => e.assessments > 0).length, total: n, hint: 'Indicateur 11' });
    checks.push({ label: 'Attestations délivrées', done: active.filter((e) => e.certificate_issued_on).length, total: n, hint: 'Fin de formation' });
  }
  return checks.filter((c) => c.total > 0);
}

function Details({ session }: { session: SessionDetail }) {
  const checks = completeness(session);

  return (
    <div className="space-y-4">
      <Section title="Session">
        <div className="grid grid-cols-5 gap-2.5">
          <Row icon={BookOpen} label="Formation">
            <div>{session.program.title}</div>
            <div className="flex gap-1.5 mt-1">
              <Badge variant="outline" size="sm">
                {session.program.code}
              </Badge>
              {session.program.is_certifying && (
                <Badge variant="primary" appearance="light" size="sm">
                  Certifiante
                </Badge>
              )}
            </div>
          </Row>
          <Row icon={CalendarDays} label="Dates">
            {formatDateRange(session.start_date, session.end_date)}
          </Row>
          <Row icon={Clock} label="Durée">
            {session.program.duration_hours ? `${session.program.duration_hours} h` : '—'}
          </Row>
          <Row icon={MapPin} label="Lieu">
            {session.location ?? '—'}
            {session.room && <div className="text-muted-foreground text-xs">{session.room}</div>}
          </Row>
          <Row icon={Presentation} label="Formateur">
            {session.trainer ? (
              <>
                {session.trainer.full_name}
                {session.trainer.is_external && (
                  <Badge variant="outline" size="sm" className="ms-1.5">
                    Externe
                  </Badge>
                )}
              </>
            ) : (
              <span className="text-destructive">À affecter</span>
            )}
          </Row>
          <Row icon={Users} label="Inscrits">
            {session.enrolled}
            {session.capacity ? ` / ${session.capacity} places` : ''}
          </Row>
          <Row icon={Handshake} label="Sous-traitance">
            {session.subcontracted ? 'Oui' : 'Non'}
          </Row>
        </div>
      </Section>

      <Separator />

      <Section title="Complétude du dossier">
        {checks.length ? (
          <div className="space-y-3">
            {checks.map((c) => {
              const complete = c.done >= c.total;
              return (
                <div key={c.label} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <Tooltip>
                      <TooltipTrigger className="text-secondary-foreground text-start">
                        {c.label}
                      </TooltipTrigger>
                      <TooltipContent side="left">{c.hint}</TooltipContent>
                    </Tooltip>
                    <span className={cn('text-xs font-medium', complete ? 'text-emerald-600' : 'text-destructive')}>
                      {c.done}/{c.total}
                    </span>
                  </div>
                  <Progress
                    value={percent(c.done, c.total)}
                    className="h-1.5"
                    indicatorClassName={complete ? 'bg-emerald-500' : 'bg-destructive'}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-muted-foreground">Rien à vérifier tant qu&apos;il n&apos;y a pas d&apos;inscrit.</p>
        )}
      </Section>
    </div>
  );
}

export function SessionDetails({ session }: { session: SessionDetail | undefined }) {
  return (
    <Tabs defaultValue="details" className="grow text-sm">
      <TabsList
        variant="line"
        className="px-5 gap-6 bg-transparent [&_button]:border-b [&_button_svg]:size-3.5"
      >
        <TabsTrigger value="details">
          <Info /> Détails
        </TabsTrigger>
      </TabsList>
      <ScrollArea className="w-full h-[calc(100vh-10rem)]">
        <div className="px-5 py-2">
          <TabsContent value="details">
            {session ? (
              <Details session={session} />
            ) : (
              <div className="space-y-2.5 pt-2">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-5 w-2/3" />
              </div>
            )}
          </TabsContent>
        </div>
      </ScrollArea>
    </Tabs>
  );
}
