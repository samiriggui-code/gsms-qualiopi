'use client';

import { useState } from 'react';
import {
  Activity,
  CalendarCheck,
  CalendarPlus,
  Check,
  Clock,
  Minus,
  LayoutDashboard,
  ShieldCheck,
  TriangleAlert,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/format';
import { ATTENDANCE, ENROLLMENT_STATUS, MILESTONE, OWNER, PERIOD, READINESS, STEP_LABEL } from '@/lib/gsms/labels';
import { useAttendance, useDossier, usePlanSlots, useSessionJourney } from '@/lib/gsms/sessions';
import type { AttendanceCell, Capabilities, ReadinessStatus, SessionRow } from '@/lib/gsms/types';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ActionGate } from '@/components/gsms/action-gate';
import { Refusal } from '@/components/gsms/refusal';
import { StepMark } from '@/components/gsms/step-mark';
import { SessionActivityTab, SessionOverview } from './session-overview';

function Loading() {
  return (
    <div className="space-y-2.5">
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-full" />
    </div>
  );
}

// --- Parcours : une ligne par stagiaire, une colonne par étape (états calculés par l'API) ---

function Journey({ sessionId, onOpenLearner }: { sessionId: string; onOpenLearner: (id: string) => void }) {
  const { data, error } = useSessionJourney(sessionId);
  if (error) return <Refusal error={error} />;
  if (!data) return <Loading />;
  if (!data.stagiaires.length) return <p className="text-muted-foreground py-4">Aucun stagiaire inscrit.</p>;

  return (
    <ScrollArea>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-48">Stagiaire</TableHead>
            {data.etapes.map((step) => (
              <TableHead key={step} className="text-center whitespace-nowrap">
                {STEP_LABEL[step].short}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.stagiaires.map((s) => (
            <TableRow key={s.inscription} className="cursor-pointer" onClick={() => onOpenLearner(s.inscription)}>
              <TableCell>
                <div className="font-medium text-foreground hover:text-primary">{s.stagiaire}</div>
                <Badge className={cn('mt-0.5', ENROLLMENT_STATUS[s.statut].color)} size="sm">
                  {ENROLLMENT_STATUS[s.statut].label}
                </Badge>
              </TableCell>
              {data.etapes.map((step) => (
                <TableCell key={step}>
                  <div className="flex justify-center">
                    <StepMark state={s.etats[step]} label={STEP_LABEL[step].label} />
                  </div>
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}

// --- Émargement : grille stagiaires × demi-journées ---

const CELL_ICON: Record<AttendanceCell['etat'], { icon: typeof Check; className: string }> = {
  PRESENT: { icon: Check, className: 'text-green-600' },
  ABSENT: { icon: X, className: 'text-destructive' },
  MANQUANT: { icon: TriangleAlert, className: 'text-yellow-600' },
  A_VENIR: { icon: Clock, className: 'text-muted-foreground' },
  NON_ATTENDU: { icon: Minus, className: 'text-muted-foreground/60' },
};

function Attendance({ sessionId, capabilities }: { sessionId: string; capabilities: Capabilities }) {
  const { data, error } = useAttendance(sessionId);
  const plan = usePlanSlots(sessionId);
  if (error) return <Refusal error={error} />;
  if (!data) return <Loading />;

  if (!data.demi_journees.length) {
    return (
      <div className="flex flex-col items-start gap-3 py-4">
        <p className="text-muted-foreground">Aucune demi-journée d’émargement n’est planifiée pour cette session.</p>
        <ActionGate
          decision={capabilities.edit}
          size="sm"
          variant="outline"
          pending={plan.isPending}
          onRun={() =>
            plan.mutate(undefined, {
              onSuccess: () => toast.success('Demi-journées générées.'),
              onError: (e) => toast.error(e.message),
            })
          }
        >
          <CalendarPlus /> Générer les demi-journées
        </ActionGate>
      </div>
    );
  }

  const learners = data.demi_journees[0].presences.map((p) => ({ id: p.enrollment_id, name: p.stagiaire }));

  return (
    <ScrollArea>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-44">Stagiaire</TableHead>
            {data.demi_journees.map((slot) => (
              <TableHead key={slot.id} className="text-center whitespace-nowrap">
                <div className="capitalize">{formatDate(slot.jour, 'EEE d MMM')}</div>
                <div className="font-normal text-xs text-muted-foreground">
                  {PERIOD[slot.periode]}
                  {slot.contre_validee && (
                    <Tooltip>
                      <TooltipTrigger>
                        <ShieldCheck className="inline size-3.5 ms-1 text-green-600" />
                      </TooltipTrigger>
                      <TooltipContent>
                        Contre-validée le {formatDate(slot.contre_validee.le, 'd MMM HH:mm')} par {slot.contre_validee.par}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {learners.map((l) => (
            <TableRow key={l.id}>
              <TableCell className="font-medium text-foreground">{l.name}</TableCell>
              {data.demi_journees.map((slot) => {
                const cell = slot.presences.find((p) => p.enrollment_id === l.id);
                if (!cell) return <TableCell key={slot.id} />;
                const { icon: Icon, className } = CELL_ICON[cell.etat];
                const detail = [ATTENDANCE[cell.etat].label, cell.heure && `à ${cell.heure}`, cell.procede, cell.note]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <TableCell key={slot.id}>
                    <div className="flex justify-center">
                      <Tooltip>
                        <TooltipTrigger>
                          <Icon className={cn('size-4', className)} aria-label={detail} />
                        </TooltipTrigger>
                        <TooltipContent>{detail}</TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}

// --- Qualiopi : indicateurs, écarts et échéancier du dossier de session ---

function Qualiopi({ sessionId }: { sessionId: string }) {
  const { data, error } = useDossier(sessionId);
  const [showAll, setShowAll] = useState(false);
  if (error) return <Refusal error={error} />;
  if (!data) return <Loading />;

  const indicators = data.indicators.filter((i) => showAll || i.status !== 'NON_APPLICABLE');

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">{data.disclaimer}</p>

      {data.findings.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-mono">Écarts ouverts ({data.findings.length})</h3>
          {data.findings.map((f) => (
            <Card key={f.id}>
              <CardContent className="p-4 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">
                    {f.reference} · I{String(f.indicator).padStart(2, '0')} — {f.title}
                  </span>
                  <Badge variant={f.severity === 'majeure' ? 'destructive' : 'warning'} appearance="light">
                    {f.severity}
                  </Badge>
                </div>
                <p className="text-sm text-secondary-foreground">{f.explanation}</p>
                {f.remediation && (
                  <p className="text-sm">
                    <span className="font-medium">À faire : </span>
                    {f.remediation}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-mono">Échéancier du dossier</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Échéance</TableHead>
              <TableHead>Étape</TableHead>
              <TableHead>Responsable</TableHead>
              <TableHead>Avancement</TableHead>
              <TableHead>État</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.echeancier.map((m) => {
              const state = MILESTONE[m.status] ?? { label: m.status, color: '' };
              return (
                <TableRow key={m.key}>
                  <TableCell className="whitespace-nowrap">{formatDate(m.due_on)}</TableCell>
                  <TableCell>
                    <div className="font-medium text-foreground">{m.label}</div>
                    {m.missing.length > 0 && m.done < m.total && (
                      <div className="text-xs text-muted-foreground">
                        Manque : {m.missing.map((x) => x.who).join(', ')}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{OWNER[m.owner] ?? m.owner}</TableCell>
                  <TableCell className="tabular-nums">
                    {m.done}/{m.total}
                  </TableCell>
                  <TableCell>
                    <Badge className={state.color}>{state.label}</Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-mono">Indicateurs pour cette session</h3>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch size="sm" checked={showAll} onCheckedChange={setShowAll} />
            Afficher les indicateurs sans objet
          </label>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Indicateur</TableHead>
              <TableHead>État</TableHead>
              <TableHead>Constat du moteur</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {indicators.map((i) => (
              <TableRow key={i.number}>
                <TableCell className="align-top">
                  <span className="font-semibold text-foreground">{i.code}</span>
                  <div className="text-xs text-muted-foreground max-w-64">{i.title}</div>
                </TableCell>
                <TableCell className="align-top">
                  <Badge className={READINESS[i.status as ReadinessStatus].color}>
                    {READINESS[i.status as ReadinessStatus].label}
                  </Badge>
                  {i.evidence_to_validate && (
                    <div className="text-xs text-muted-foreground mt-1">Preuve à valider</div>
                  )}
                </TableCell>
                <TableCell className="align-top text-sm text-secondary-foreground">
                  {i.results.map((r) => r.explanation).join(' ') || '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}

export function SessionRecords({
  sessionId,
  session,
  capabilities,
  learnersCount,
  onOpenLearner,
}: {
  sessionId: string;
  session?: SessionRow;
  capabilities: Capabilities | undefined;
  learnersCount: number | undefined;
  onOpenLearner: (enrollmentId: string) => void;
}) {
  const [tab, setTab] = useState('overview');
  return (
    <Tabs value={tab} onValueChange={setTab} className="grow text-sm min-w-0">
      <TabsList
        variant="line"
        className="px-5 gap-6 bg-transparent max-lg:w-full max-lg:justify-start max-lg:overflow-x-auto max-lg:overflow-y-hidden max-lg:[scrollbar-width:none] [&_button]:border-b [&_button_svg]:size-4 [&_button]:text-secondary-foreground"
      >
        <TabsTrigger value="overview">
          <LayoutDashboard /> Vue d’ensemble
        </TabsTrigger>
        <TabsTrigger value="journey">
          <Users /> Parcours
          {learnersCount !== undefined && (
            <Badge variant="primary" size="xs">
              {learnersCount}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="attendance">
          <CalendarCheck /> Émargement
        </TabsTrigger>
        <TabsTrigger value="qualiopi">
          <ShieldCheck /> Qualiopi
        </TabsTrigger>
        <TabsTrigger value="activity">
          <Activity /> Activité
        </TabsTrigger>
      </TabsList>

      <ScrollArea className="w-full lg:h-[calc(100vh-10rem)] [&_[data-radix-scroll-area-viewport]>div]:!block">
        <div className="px-5 py-3">
          <TabsContent value="overview">
            <SessionOverview sessionId={sessionId} session={session} onOpenTab={setTab} />
          </TabsContent>
          <TabsContent value="journey">
            <Journey sessionId={sessionId} onOpenLearner={onOpenLearner} />
          </TabsContent>
          <TabsContent value="attendance">
            {capabilities ? <Attendance sessionId={sessionId} capabilities={capabilities} /> : <Loading />}
          </TabsContent>
          <TabsContent value="qualiopi">
            <Qualiopi sessionId={sessionId} />
          </TabsContent>
          <TabsContent value="activity">
            <SessionActivityTab sessionId={sessionId} />
          </TabsContent>
        </div>
      </ScrollArea>
    </Tabs>
  );
}
