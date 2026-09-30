'use client';

// Actions correctives : le tableau kanban du concept Todo de Metronic (app/todo/all-tasks) sur les actions
// du moteur Qualiopi. Glisser une carte dans la colonne suivante demande l'étape correspondante à l'API,
// après confirmation ; un déplacement refusé est annulé avec le motif. Un clic ouvre la fiche.
import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  AlarmClock,
  Calendar,
  CircleCheck,
  Plus,
  ShieldCheck,
  User,
  Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDate, percent } from '@/lib/format';
import {
  useCapaActions,
  type CapaAction,
  type CapaStatus,
  type CapaStep,
} from '@/lib/gsms/capa';
import { useCan } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { Badge, BadgeDot } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Kanban,
  KanbanBoard,
  KanbanColumn,
  KanbanColumnContent,
  KanbanItem,
  KanbanItemHandle,
  KanbanOverlay,
  type KanbanMoveEvent,
} from '@/components/ui/kanban';
import { Label } from '@/components/ui/label';
import { ProgressCircle } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Refusal } from '@/components/gsms/refusal';
import { Content } from '@/components/layout/components/content';
import { ContentHeader } from '@/components/layout/components/content-header';
import { CapaSheet } from './capa-sheet';
import { CAPA_STATUS, STEP_INTO } from './columns';
import { NewCapaSheet } from './new-capa-sheet';
import { StepDialog } from './step-dialog';

const BOARD: CapaStatus[] = ['OUVERTE', 'EN_COURS', 'A_VERIFIER', 'CLOTUREE'];

function StatCard({
  visual,
  value,
  label,
}: {
  visual: React.ReactNode;
  value: React.ReactNode;
  label: string;
}) {
  return (
    <Card className="min-w-0">
      <CardContent className="flex items-center gap-3 sm:gap-4 lg:gap-5 p-4 sm:p-5">
        <div className="shrink-0">{visual}</div>
        <div className="flex flex-col gap-1 min-w-0">
          <div className="text-base font-medium leading-none text-foreground">
            {value}
          </div>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function RingIcon({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'size-12 lg:size-14 rounded-full border-4 flex items-center justify-center',
        className,
      )}
    >
      {children}
    </div>
  );
}

function CapaCard({
  action,
  onOpen,
}: {
  action: CapaAction;
  onOpen: (a: CapaAction) => void;
}) {
  return (
    <KanbanItem value={action.id}>
      <KanbanItemHandle>
        <div
          role="button"
          tabIndex={0}
          onClick={() => onOpen(action)}
          onKeyDown={(e) => e.key === 'Enter' && onOpen(action)}
          className="rounded-md border bg-card p-3 shadow-xs hover:border-primary/40 text-start"
        >
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground tabular-nums">
                {action.reference}
              </span>
              <Badge
                variant="outline"
                className="pointer-events-none h-5 rounded-sm px-1.5 text-[11px] shrink-0"
              >
                <BadgeDot
                  className={
                    action.type === 'CORRECTIVE' ? 'bg-red-500' : 'bg-primary'
                  }
                />
                {action.type === 'CORRECTIVE' ? 'Corrective' : 'Préventive'}
              </Badge>
            </div>
            <span className="line-clamp-2 font-medium text-sm text-foreground">
              {action.titre}
            </span>
            <p className="text-muted-foreground text-xs line-clamp-2">
              {action.plan}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-muted-foreground text-xs">
              {action.ecart && (
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck className="size-3" /> I
                  {String(action.ecart.indicateur).padStart(2, '0')}
                </span>
              )}
              <span className="inline-flex items-center gap-1 min-w-0">
                <User className="size-3 shrink-0" />
                <span className="truncate">{action.responsable}</span>
              </span>
              <span
                className={cn(
                  'inline-flex items-center gap-1 tabular-nums whitespace-nowrap ms-auto',
                  action.en_retard && 'text-destructive font-medium',
                )}
              >
                <Calendar className="size-3" />
                <time>{formatDate(action.echeance, 'd MMM')}</time>
              </span>
            </div>
          </div>
        </div>
      </KanbanItemHandle>
    </KanbanItem>
  );
}

function CapaColumn({
  status,
  actions,
  onOpen,
}: {
  status: CapaStatus;
  actions: CapaAction[];
  onOpen: (a: CapaAction) => void;
}) {
  return (
    <KanbanColumn
      value={status}
      className="rounded-md border bg-card p-2.5 shadow-xs min-w-0"
    >
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2.5">
          <span
            className={cn('size-2 rounded-full', CAPA_STATUS[status].dot)}
          />
          <span className="font-semibold text-sm">
            {CAPA_STATUS[status].label}
          </span>
          <Badge variant="secondary" className="text-xs">
            {actions.length}
          </Badge>
        </div>
      </div>
      <KanbanColumnContent
        value={status}
        className="flex flex-col gap-2.5 p-0.5 min-h-16"
      >
        {actions.map((a) => (
          <CapaCard key={a.id} action={a} onOpen={onOpen} />
        ))}
        {actions.length === 0 && (
          <div className="rounded-md border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
            Aucune action
          </div>
        )}
      </KanbanColumnContent>
    </KanbanColumn>
  );
}

export default function CapaBoardPage() {
  const can = useCan();
  const { data: actions, isLoading, error } = useCapaActions();
  const [showCancelled, setShowCancelled] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [step, setStep] = useState<{
    action: CapaAction;
    step: CapaStep;
  } | null>(null);
  const [creating, setCreating] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (searchParams.get('nouveau')) {
      setCreating(true);
      router.replace(pathname);
    }
  }, [searchParams, router, pathname]);

  const statuses = useMemo<CapaStatus[]>(
    () => (showCancelled ? [...BOARD, 'ANNULEE'] : BOARD),
    [showCancelled],
  );
  const grouped = useMemo(() => {
    const out = Object.fromEntries(
      statuses.map((s) => [s, [] as CapaAction[]]),
    ) as Record<string, CapaAction[]>;
    for (const a of actions ?? []) out[a.statut]?.push(a);
    return out;
  }, [actions, statuses]);
  // Ordre local dans une colonne (le glisser-déposer entre colonnes passe par l'API)
  const [columns, setColumns] = useState<Record<string, CapaAction[]>>(grouped);
  useEffect(() => setColumns(grouped), [grouped]);

  const all = actions ?? [];
  const live = all.filter((a) => a.statut !== 'ANNULEE');
  const closed = live.filter((a) => a.statut === 'CLOTUREE').length;
  const late = all.filter((a) => a.en_retard).length;
  const toVerify = all.filter((a) => a.statut === 'A_VERIFIER').length;
  const progress = percent(closed, live.length);
  const opened = all.find((a) => a.id === openId) ?? null;

  function onMove({
    activeContainer,
    overContainer,
    activeIndex,
    overIndex,
  }: KanbanMoveEvent) {
    if (activeContainer === overContainer) {
      const list = [...columns[activeContainer]];
      const [moved] = list.splice(activeIndex, 1);
      list.splice(overIndex, 0, moved);
      setColumns({ ...columns, [activeContainer]: list });
      return;
    }
    const action = columns[activeContainer][activeIndex];
    const next = STEP_INTO[overContainer as CapaStatus];
    if (!action) return;
    if (!next) {
      toast.error('Déplacement refusé', {
        description: 'Une action ne revient pas à « ouverte ».',
      });
      return;
    }
    const decision = action.capabilities[next];
    if (!decision?.allowed) {
      toast.error(
        `${CAPA_STATUS[overContainer as CapaStatus].label} : déplacement refusé`,
        {
          description:
            decision && !decision.allowed
              ? `${action.reference} — ${decision.message}. Les étapes se suivent : ouverte, en cours, à vérifier, clôturée.`
              : undefined,
        },
      );
      return;
    }
    setStep({ action, step: next });
  }

  return (
    <>
      <ContentHeader>
        <h1 className="inline-flex items-center gap-2.5 text-sm font-semibold">
          <Wrench className="size-4 text-primary" />
          Actions correctives
          <span className="text-muted-foreground font-normal">
            {live.length} en tout
          </span>
        </h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch
              id="capa-annulees"
              size="sm"
              checked={showCancelled}
              onCheckedChange={setShowCancelled}
            />
            <Label htmlFor="capa-annulees" className="text-xs font-normal">
              Annulées
            </Label>
          </div>
          {can('write_quality') && (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus /> Nouvelle action
            </Button>
          )}
        </div>
      </ContentHeader>
      <Content className="block">
        <div className="container-fluid space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <StatCard
              visual={
                <ProgressCircle
                  value={progress}
                  size={52}
                  strokeWidth={5}
                  indicatorClassName={
                    progress === 100 ? 'text-green-500' : 'text-primary'
                  }
                >
                  <span className="text-sm font-medium leading-none text-foreground">
                    {progress}%
                  </span>
                </ProgressCircle>
              }
              value={`${closed}/${live.length}`}
              label="Actions clôturées"
            />
            <StatCard
              visual={
                <RingIcon className="border-red-400">
                  <AlarmClock className="size-5 text-red-400" />
                </RingIcon>
              }
              value={`${late} en retard`}
              label="Échéance dépassée, non réalisées"
            />
            <StatCard
              visual={
                <RingIcon className="border-yellow-400">
                  <CircleCheck className="size-5 text-yellow-500" />
                </RingIcon>
              }
              value={`${toVerify} à vérifier`}
              label="Efficacité à constater"
            />
          </div>

          <Refusal error={error} />

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {BOARD.map((s) => (
                <Skeleton key={s} className="h-64" />
              ))}
            </div>
          ) : (
            <Kanban
              value={columns}
              onValueChange={setColumns}
              getItemValue={(a) => a.id}
              onMove={onMove}
            >
              <KanbanBoard
                className={cn(
                  'grid auto-rows-auto grid-cols-1 sm:grid-cols-1 md:grid-cols-2 gap-4 items-start',
                  showCancelled ? 'xl:grid-cols-5' : 'xl:grid-cols-4',
                )}
              >
                {statuses.map((s) => (
                  <CapaColumn
                    key={s}
                    status={s}
                    actions={columns[s] ?? []}
                    onOpen={(a) => setOpenId(a.id)}
                  />
                ))}
              </KanbanBoard>
              <KanbanOverlay>
                <div className="rounded-md bg-muted/60 size-full" />
              </KanbanOverlay>
            </Kanban>
          )}

          {!isLoading && all.length === 0 && (
            <p className="text-sm text-muted-foreground text-center">
              Aucune action pour l’instant. Les actions s’ouvrent sur un écart
              relevé par les contrôles ou un audit.
            </p>
          )}
        </div>
      </Content>

      <CapaSheet
        action={opened}
        onClose={() => setOpenId(null)}
        onStep={(a, s) => setStep({ action: a, step: s })}
      />
      <StepDialog target={step} onClose={() => setStep(null)} />
      <NewCapaSheet open={creating} onOpenChange={setCreating} />
    </>
  );
}
