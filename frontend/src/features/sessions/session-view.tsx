"use client";

import { CalendarDays, ChevronLeft, MapPin, User, Users } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";

import { ActionGate } from "@/components/app/action-gate";
import { useBootstrap } from "@/components/app/app-shell";
import { ErrorState, PageHeader } from "@/components/app/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/tooltip";
import { ApiError } from "@/lib/api";
import { SESSION_STATUS, SESSION_TRANSITIONS } from "@/lib/labels";
import type { Decision } from "@/lib/types";
import { fmt } from "@/lib/utils";

import { AttendanceTab } from "./attendance-tab";
import { JourneyTab } from "./journey-tab";
import { QualiopiTab } from "./qualiopi-tab";
import { useSession, useSessionTransition } from "./queries";

// Une action impossible dans cet état ou hors de mes droits n'a pas à encombrer l'écran ;
// une action bloquée pour une raison métier reste visible, avec sa raison.
const HIDDEN_CODES = new Set(["INVALID_TRANSITION", "PERMISSION_MISSING", "UNKNOWN_ACTION"]);
const visible = (d?: Decision) => !!d && (d.allowed || !HIDDEN_CODES.has(d.code));

export function SessionView({ id }: { id: string }) {
  const query = useSession(id);
  const boot = useBootstrap();
  const transition = useSessionTransition(id);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const canQuality = boot.data?.permissions.includes("quality.read") ?? false;

  if (query.isPending) return <HeaderSkeleton />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;

  const { session: s, capabilities, inscriptions } = query.data;
  const status = SESSION_STATUS[s.status];
  const run = (action: string, reason?: string) =>
    transition.mutate(
      { action, reason },
      {
        onSuccess: () => {
          toast.success(`Session ${s.reference} : ${SESSION_TRANSITIONS[action].toLowerCase()} — fait`);
          setCancelOpen(false);
        },
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Action impossible"),
      },
    );

  const transitions = Object.keys(SESSION_TRANSITIONS).filter((a) => visible(capabilities[a]));
  const active = inscriptions.filter((e) => e.statut !== "ANNULE").length;

  return (
    <>
      <Link href="/sessions" className="mb-3 inline-flex items-center gap-1 text-[13px] text-fg-muted hover:text-fg">
        <ChevronLeft aria-hidden className="size-4" />
        Sessions
      </Link>
      <PageHeader
        eyebrow={s.program_title}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {s.reference}
            <Badge tone={status.tone} dot>
              {status.label}
            </Badge>
          </span>
        }
        meta={
          <>
            <span className="tabular inline-flex items-center gap-1.5">
              <CalendarDays aria-hidden className="size-3.5" />
              {fmt.range(s.start_date, s.end_date)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin aria-hidden className="size-3.5" />
              {s.location ?? "Lieu à définir"}
              {s.room ? `, ${s.room}` : ""}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <User aria-hidden className="size-3.5" />
              {s.trainer_name ?? "Formateur à affecter"}
            </span>
            <span className="tabular inline-flex items-center gap-1.5">
              <Users aria-hidden className="size-3.5" />
              {active} stagiaire{active > 1 ? "s" : ""}
              {s.capacity ? ` / ${s.capacity} places` : ""}
            </span>
          </>
        }
        actions={transitions.map((a) => (
          <ActionGate
            key={a}
            decision={capabilities[a]}
            variant={a === "cancel" ? "danger" : a === "close" || a === "confirm" ? "primary" : "secondary"}
            pending={transition.isPending}
            onRun={() => (a === "cancel" ? setCancelOpen(true) : run(a))}
          >
            {SESSION_TRANSITIONS[a]}
          </ActionGate>
        ))}
      />
      {s.status === "ANNULEE" && s.cancel_reason && (
        <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-[13px] text-danger">Annulée : {s.cancel_reason}</p>
      )}

      <Tabs defaultValue="parcours">
        <TabsList aria-label="Vues de la session">
          <TabsTrigger value="parcours">Parcours des stagiaires</TabsTrigger>
          <TabsTrigger value="emargement">Émargement</TabsTrigger>
          {canQuality && <TabsTrigger value="qualiopi">Qualiopi</TabsTrigger>}
        </TabsList>
        <TabsContent value="parcours">
          <JourneyTab sessionId={id} />
        </TabsContent>
        <TabsContent value="emargement">
          <AttendanceTab sessionId={id} />
        </TabsContent>
        {canQuality && (
          <TabsContent value="qualiopi">
            <QualiopiTab sessionId={id} />
          </TabsContent>
        )}
      </Tabs>

      <CancelModal
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        pending={transition.isPending}
        onConfirm={(reason) => run("cancel", reason)}
      />
    </>
  );
}

function CancelModal({
  open,
  onOpenChange,
  onConfirm,
  pending,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: (reason: string) => void;
  pending: boolean;
}) {
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string>();
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Annuler la session"
      description="Les stagiaires ne seront plus attendus. Le motif est conservé au journal."
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!reason.trim()) return setError("Indiquez le motif de l'annulation");
          onConfirm(reason.trim());
        }}
      >
        <Field id="cancel-reason" label="Motif" required error={error}>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Revenir
          </Button>
          <Button type="submit" variant="danger" disabled={pending}>
            Annuler la session
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function HeaderSkeleton() {
  return (
    <div aria-busy aria-label="Chargement de la session" className="flex flex-col gap-3">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <Skeleton className="mt-6 h-64" />
    </div>
  );
}
