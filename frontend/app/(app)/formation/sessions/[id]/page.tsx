'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarDays, Ellipsis, LoaderCircleIcon, Pencil, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { SESSION_STATUS, SESSION_TRANSITIONS } from '@/lib/gsms/labels';
import { useDeleteSession, useSession, useSessionTransition } from '@/lib/gsms/sessions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ActionGate } from '@/components/gsms/action-gate';
import { Refusal } from '@/components/gsms/refusal';
import { ConfirmDialog } from '@/components/resource/confirm-dialog';
import { Content } from '@/components/layout/components/content';
import { ContentHeader } from '@/components/layout/components/content-header';
import { SessionFormSheet } from '../session-form-sheet';
import { EnrollSheet } from './enroll-sheet';
import { LearnerSheet } from './learner-sheet';
import { SessionDetails } from './session-details';
import { SessionRecords } from './session-records';

const TRANSITION_ORDER = ['confirm', 'start', 'finish', 'close'];

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data, error } = useSession(id);
  const transition = useSessionTransition(id);
  const remove = useDeleteSession(id);

  const [editOpen, setEditOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [learner, setLearner] = useState<string | null>(null);

  const session = data?.session;
  const caps = data?.capabilities;

  function run(action: string, reason?: string) {
    transition.mutate(
      { action, reason },
      {
        onSuccess: () => {
          toast.success(`${SESSION_TRANSITIONS[action]} : c’est fait.`);
          setCancelOpen(false);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  // Seule la prochaine transition autorisée est proposée en bouton principal ; les autres restent accessibles.
  const nextTransition = caps ? TRANSITION_ORDER.find((a) => caps[a]?.allowed) : undefined;

  return (
    <>
      <ContentHeader>
        <div className="flex items-center gap-2.5 min-w-0">
          <Button variant="ghost" mode="icon" size="sm" asChild>
            <Link href="/formation/sessions" aria-label="Retour aux sessions">
              <CalendarDays className="text-primary" />
            </Link>
          </Button>
          {session ? (
            <h1 className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm font-semibold min-w-0">
              <span className="whitespace-nowrap">{session.reference}</span>
              <span className="text-muted-foreground font-normal truncate max-sm:hidden">{session.program_title}</span>
              <Badge className={SESSION_STATUS[session.status].color}>{SESSION_STATUS[session.status].label}</Badge>
            </h1>
          ) : (
            <Skeleton className="h-5 w-48 lg:w-96" />
          )}
        </div>
        {caps && session && (
          <div className="flex items-center gap-2">
            <ActionGate decision={caps.enroll} size="sm" variant="outline" onRun={() => setEnrollOpen(true)}>
              <UserPlus /> Inscrire
            </ActionGate>
            {nextTransition && (
              <ActionGate
                decision={caps[nextTransition]}
                size="sm"
                pending={transition.isPending}
                onRun={() => run(nextTransition)}
              >
                {SESSION_TRANSITIONS[nextTransition]}
              </ActionGate>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" mode="icon" size="sm" aria-label="Autres actions">
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem disabled={!caps.edit?.allowed} onSelect={() => setEditOpen(true)}>
                  <Pencil /> Modifier la session
                </DropdownMenuItem>
                {TRANSITION_ORDER.filter((a) => a !== nextTransition && caps[a]?.allowed).map((a) => (
                  <DropdownMenuItem key={a} onSelect={() => run(a)}>
                    {SESSION_TRANSITIONS[a]}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem
                  variant="destructive"
                  disabled={!caps.cancel?.allowed}
                  onSelect={() => {
                    setCancelReason('');
                    setCancelOpen(true);
                  }}
                >
                  {SESSION_TRANSITIONS.cancel}
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() =>
                    caps.delete?.allowed ? setDeleteOpen(true) : toast.info(caps.delete && !caps.delete.allowed ? caps.delete.message : 'Suppression impossible.')
                  }
                >
                  <Trash2 /> Supprimer
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </ContentHeader>

      <Content className="grid py-0">
        {error ? (
          <div className="p-5">
            <Refusal error={error} />
          </div>
        ) : (
          <div className="grow min-w-0">
            <div className="p-0 flex flex-col lg:flex-row grow">
              <div className="flex lg:grow min-w-0 border-b lg:border-b-0 lg:border-e border-border">
                <SessionRecords
                  sessionId={id}
                  capabilities={caps}
                  learnersCount={data?.inscriptions.length}
                  onOpenLearner={setLearner}
                />
              </div>
              <div className="flex min-w-0 lg:shrink-0 lg:w-[380px]">
                <SessionDetails sessionId={id} session={session} />
              </div>
            </div>
          </div>
        )}
      </Content>

      <LearnerSheet sessionId={id} enrollmentId={learner} onClose={() => setLearner(null)} />
      <SessionFormSheet open={editOpen} onOpenChange={setEditOpen} session={session} />
      <EnrollSheet
        sessionId={id}
        enrolledLearnerIds={data?.inscriptions.map((i) => i.learner_id) ?? []}
        open={enrollOpen}
        onOpenChange={setEnrollOpen}
      />

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Annuler la session</DialogTitle>
            <DialogDescription>La session reste dans l’historique avec son motif d’annulation.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-1.5">
            <Label htmlFor="cancel-reason">Motif</Label>
            <Textarea id="cancel-reason" rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
            <Refusal error={transition.error} />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Retour
            </Button>
            <Button
              variant="destructive"
              disabled={!cancelReason.trim() || transition.isPending}
              onClick={() => run('cancel', cancelReason.trim())}
            >
              {transition.isPending && <LoaderCircleIcon className="size-4 animate-spin" />}
              Annuler la session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Supprimer la session"
        description={session ? `Supprimer définitivement la session ${session.reference} ?` : ''}
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(undefined, {
            onSuccess: () => {
              toast.success('La session a été supprimée.');
              router.push('/formation/sessions');
            },
            onError: (e) => toast.error(e.message),
          })
        }
      />
    </>
  );
}
