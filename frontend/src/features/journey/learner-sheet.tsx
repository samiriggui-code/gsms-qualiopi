"use client";

import { ChevronLeft, ExternalLink, FileText } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { ActionGate } from "@/components/app/action-gate";
import { ErrorState } from "@/components/app/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/tooltip";
import { useJourneyAction, useLearnerJourney } from "@/features/sessions/queries";
import { documentUrl } from "@/lib/api";
import { ENROLLMENT_STATUS, STEP_LABEL } from "@/lib/labels";
import type { Decision, GeneratedDocument, JourneyStep, LearnerJourney } from "@/lib/types";
import { cn, fmt } from "@/lib/utils";

import { ActionForm } from "./action-form";
import { STEP_STATE, StepMark } from "./step-mark";
import { ACTIONS, CONFIRM_TEXT, REISSUE_REASON, STATUS_ACTIONS, STEP_ACTIONS } from "./actions";

const HIDDEN = new Set([
  "PERMISSION_MISSING",
  "OUT_OF_SCOPE",
  "ENROLLMENT_ENDED",
  "INVALID_TRANSITION",
  "ENROLLMENT_CANCELLED",
  "SESSION_LOCKED",
]);
const shown = (d?: Decision) => !!d && (d.allowed || !HIDDEN.has(d.code));

const DOC_KIND: Record<string, string> = { CONVOCATION: "convocation", ATTESTATION_FIN: "attestation" };

export function LearnerSheet({
  sessionId,
  enrollmentId,
  onClose,
}: {
  sessionId: string;
  enrollmentId: string | null;
  onClose: () => void;
}) {
  const query = useLearnerJourney(enrollmentId);
  const data = query.data;

  return (
    <Sheet
      open={!!enrollmentId}
      onOpenChange={(o) => !o && onClose()}
      title={data ? data.stagiaire : "Stagiaire"}
      description={
        data ? (
          <span className="flex flex-wrap items-center gap-2">
            {data.session}
            <Badge tone={ENROLLMENT_STATUS[data.statut].tone}>{ENROLLMENT_STATUS[data.statut].label}</Badge>
          </span>
        ) : undefined
      }
    >
      {query.isPending && enrollmentId && (
        <div aria-busy aria-label="Chargement du parcours" className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      )}
      {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}
      {data && enrollmentId && <Body key={enrollmentId} sessionId={sessionId} journey={data} />}
    </Sheet>
  );
}

/** Vue d'ensemble ou saisie d'une étape ; remis à zéro quand on change de stagiaire (key). */
function Body({ sessionId, journey }: { sessionId: string; journey: LearnerJourney }) {
  const [action, setAction] = React.useState<string | null>(null);
  return action ? (
    <ActionPanel sessionId={sessionId} journey={journey} action={action} onDone={() => setAction(null)} />
  ) : (
    <Overview journey={journey} onAction={setAction} />
  );
}

function Overview({ journey, onAction }: { journey: LearnerJourney; onAction: (a: string) => void }) {
  const caps = journey.capabilities;
  const done = journey.etapes.filter((s) => s.fait).length;
  const statusActions = STATUS_ACTIONS.filter((a) => shown(caps[a]));
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Étapes faites" value={`${done} / ${journey.etapes.length}`} />
        <Stat
          label="Demi-journées suivies"
          value={`${journey.assiduite.suivies} / ${journey.assiduite.prevues}`}
          sub={
            journey.assiduite.heures_suivies
              ? `${journey.assiduite.heures_suivies} h sur ${journey.assiduite.heures_prevues} h`
              : undefined
          }
        />
      </div>
      {journey.abandon && (
        <p className="rounded-md bg-warn-bg px-3 py-2 text-[13px] text-warn">
          {journey.statut === "ANNULE" ? "Annulée" : `Abandon le ${fmt.date(journey.abandon.le)}`}
          {journey.abandon.motif ? ` — ${journey.abandon.motif}` : " — motif non renseigné"}
        </p>
      )}

      <section aria-labelledby="etapes-titre">
        <h3 id="etapes-titre" className="mb-2 text-[13px] font-semibold text-fg-muted">
          Parcours
        </h3>
        <ol className="flex flex-col divide-y rounded-lg border">
          {journey.etapes.map((step) => (
            <StepRow key={step.etape} step={step} caps={caps} onAction={onAction} />
          ))}
        </ol>
      </section>

      <Documents journey={journey} />

      {statusActions.length > 0 && (
        <section aria-labelledby="statut-titre">
          <h3 id="statut-titre" className="mb-2 text-[13px] font-semibold text-fg-muted">
            Statut de l’inscription
          </h3>
          <div className="flex flex-wrap gap-2">
            {statusActions.map((a) => (
              <ActionGate
                key={a}
                decision={caps[a]}
                size="sm"
                variant={a === "annuler" || a === "abandonner" ? "danger" : "secondary"}
                onRun={() => onAction(a)}
              >
                {ACTIONS[a].label}
              </ActionGate>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function StepRow({
  step,
  caps,
  onAction,
}: {
  step: JourneyStep;
  caps: LearnerJourney["capabilities"];
  onAction: (a: string) => void;
}) {
  // Étape faite : seules les actions encore possibles (modifier, réémettre) restent ; pas de bouton grisé inutile.
  const actions = STEP_ACTIONS[step.etape].filter((a) => shown(caps[a]) && (!step.fait || caps[a].allowed));
  // Raison du blocage dite en clair (pas seulement au survol) pour l'étape à faire.
  const first = !step.fait ? actions.map((a) => caps[a]).find((d) => d && !d.allowed) : undefined;
  const blocked = first && !first.allowed ? first.message : null;
  return (
    <li className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <span className="mt-0.5">
          <StepMark state={step.etat} label={STEP_LABEL[step.etape].label} size="sm" />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-medium">{STEP_LABEL[step.etape].label}</div>
          <div className="text-[13px] text-fg-muted">
            {step.fait
              ? [step.le && fmt.date(step.le), step.detail].filter(Boolean).join(" · ")
              : [STEP_STATE[step.etat].label, step.echeance && `échéance ${fmt.date(step.echeance)}`, step.detail]
                  .filter(Boolean)
                  .join(" · ")}
          </div>
          {step.adaptation && step.adaptation !== "AUCUNE" && (
            <Badge tone={step.adaptation === "A_TRAITER" ? "warn" : "ok"} className="mt-1">
              Adaptation {step.adaptation === "A_TRAITER" ? "à traiter" : "traitée"}
            </Badge>
          )}
          {step.prerequis_ok === false && (
            <Badge tone="warn" className="mt-1">
              Prérequis non atteints
            </Badge>
          )}
          {blocked && (
            <p className="mt-1 text-xs text-fg-muted">
              {step.etat === "A_VENIR" ? (
                <span className="font-medium">Pas encore : </span>
              ) : (
                <span className="font-medium text-warn">Bloqué : </span>
              )}
              {blocked}
            </p>
          )}
          {!!step.manque?.length && <p className="mt-1 text-xs text-danger">Rien de noté : {step.manque.join(", ")}</p>}
        </div>
      </div>
      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2 pl-7 sm:pl-0">
          {actions.map((a) => (
            <ActionGate key={a} decision={caps[a]} size="sm" onRun={() => onAction(a)}>
              {buttonLabel(a, step)}
            </ActionGate>
          ))}
        </div>
      )}
    </li>
  );
}

function buttonLabel(action: string, step: JourneyStep) {
  if (action === "convocation" || action === "attestation")
    return step.fait && step.detail === "rédigée par le moteur" ? "Réémettre" : "Émettre";
  if (action === "convention_envoyer") return "Envoi";
  if (action === "convention_signer") return "Signature";
  if (action === "evaluation") return "Ajouter";
  return step.fait ? "Modifier" : "Saisir";
}

function Documents({ journey }: { journey: LearnerJourney }) {
  if (journey.documents.length === 0) return null;
  const docs = [...journey.documents].sort((a, b) =>
    a.type === b.type ? b.version - a.version : a.type.localeCompare(b.type),
  );
  return (
    <section aria-labelledby="docs-titre">
      <h3 id="docs-titre" className="mb-2 text-[13px] font-semibold text-fg-muted">
        Documents rédigés par le moteur
      </h3>
      <ul className="flex flex-col divide-y rounded-lg border">
        {docs.map((d) => (
          <DocumentRow key={d.id} enrollmentId={journey.inscription} doc={d} />
        ))}
      </ul>
    </section>
  );
}

function DocumentRow({ enrollmentId, doc }: { enrollmentId: string; doc: GeneratedDocument }) {
  const replaced = doc.statut === "REMPLACE";
  return (
    <li className={cn("flex items-start gap-3 px-3 py-2.5", replaced && "opacity-70")}>
      <FileText aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
          <span className="capitalize">{DOC_KIND[doc.type] ?? doc.type}</span>
          <span className="tabular text-xs text-fg-subtle">v{doc.version}</span>
          {replaced ? <Badge>Remplacée</Badge> : <Badge tone="ok">En vigueur</Badge>}
        </div>
        <div className="text-xs text-fg-muted">
          Émise le {fmt.datetime(doc.emis_le)}
          {doc.par ? ` par ${doc.par}` : ""}
          {doc.motif ? ` · ${doc.motif}` : ""}
        </div>
        <div className="truncate font-mono text-[11px] text-fg-subtle" title={`Empreinte SHA-256 : ${doc.sha256}`}>
          SHA-256 {doc.sha256.slice(0, 16)}…
        </div>
      </div>
      <Button asChild variant="ghost" size="sm">
        <a href={documentUrl(enrollmentId, doc.id)} target="_blank" rel="noreferrer">
          Ouvrir
          <ExternalLink aria-hidden />
          <span className="sr-only"> (nouvel onglet)</span>
        </a>
      </Button>
    </li>
  );
}

function ActionPanel({
  sessionId,
  journey,
  action,
  onDone,
}: {
  sessionId: string;
  journey: LearnerJourney;
  action: string;
  onDone: () => void;
}) {
  const mutation = useJourneyAction(sessionId, journey.inscription);
  const spec = ACTIONS[action];
  const reissue =
    (action === "convocation" && journey.etapes.find((s) => s.etape === "convocation")?.fait) ||
    (action === "attestation" && journey.documents.some((d) => d.type === "ATTESTATION_FIN"));
  const fields = reissue ? [...spec.fields, REISSUE_REASON] : spec.fields;
  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onDone}
        className="inline-flex w-fit items-center gap-1 text-[13px] text-fg-muted hover:text-fg"
      >
        <ChevronLeft aria-hidden className="size-4" />
        Parcours
      </button>
      <h3 className="text-base font-semibold">{spec.label}</h3>
      <ActionForm
        id={action}
        spec={spec}
        fields={fields}
        intro={CONFIRM_TEXT[action]}
        pending={mutation.isPending}
        error={mutation.error}
        onCancel={onDone}
        onSubmit={(body) =>
          mutation.mutate(
            { action, body },
            {
              onSuccess: (res) => {
                const doc = res.produit?.document as GeneratedDocument | undefined;
                toast.success(doc ? `${spec.success} (version ${doc.version})` : spec.success);
                onDone();
              },
            },
          )
        }
      />
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border px-3 py-2.5">
      <div className="text-xs text-fg-muted">{label}</div>
      <div className="tabular text-lg font-semibold">{value}</div>
      {sub && <div className="tabular text-xs text-fg-subtle">{sub}</div>}
    </div>
  );
}
