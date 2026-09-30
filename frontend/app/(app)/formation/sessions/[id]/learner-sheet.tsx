'use client';

import { useState } from 'react';
import { ChevronLeft, ExternalLink, FileText, User } from 'lucide-react';
import { toast } from 'sonner';
import { documentUrl } from '@/lib/api';
import { formatDate } from '@/lib/format';
import {
  ACTIONS,
  CONFIRM_TEXT,
  REISSUE_REASON,
  STATUS_ACTIONS,
  STEP_ACTIONS,
} from '@/lib/gsms/journey-actions';
import { ENROLLMENT_STATUS, STEP_LABEL, STEP_STATE } from '@/lib/gsms/labels';
import { useJourneyAction, useLearnerJourney } from '@/lib/gsms/sessions';
import type { Decision, GeneratedDocument, JourneyStep, LearnerJourney } from '@/lib/gsms/types';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { ActionForm } from '@/components/gsms/action-form';
import { ActionGate } from '@/components/gsms/action-gate';
import { Refusal } from '@/components/gsms/refusal';
import { StepMark } from '@/components/gsms/step-mark';

// Refus qui n'apportent rien à l'utilisateur à cet endroit : le bouton est simplement masqué.
const HIDDEN = new Set([
  'PERMISSION_MISSING',
  'OUT_OF_SCOPE',
  'ENROLLMENT_ENDED',
  'INVALID_TRANSITION',
  'ENROLLMENT_CANCELLED',
  'SESSION_LOCKED',
]);
const shown = (d?: Decision) => !!d && (d.allowed || !HIDDEN.has(d.code));
const DOC_KIND: Record<string, string> = { CONVOCATION: 'Convocation', ATTESTATION_FIN: 'Attestation de fin' };

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
    <Sheet open={!!enrollmentId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:w-[600px] sm:max-w-none inset-5 start-auto max-sm:inset-2 max-sm:w-auto h-auto rounded-lg p-0 [&_[data-slot=sheet-close]]:top-4.5 [&_[data-slot=sheet-close]]:end-5">
        <SheetHeader className="border-b py-3.5 px-5 border-border">
          <SheetTitle className="flex items-center gap-2.5">
            <User className="text-primary size-4" />
            {data ? data.stagiaire : 'Stagiaire'}
            {data && (
              <Badge className={ENROLLMENT_STATUS[data.statut].color}>{ENROLLMENT_STATUS[data.statut].label}</Badge>
            )}
          </SheetTitle>
        </SheetHeader>
        <SheetBody className="p-0">
          <ScrollArea className="h-[calc(100dvh-7.5rem)]">
            <div className="p-5">
              {query.isPending && enrollmentId && (
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-12" />
                  ))}
                </div>
              )}
              {query.isError && <Refusal error={query.error} />}
              {data && enrollmentId && <Body key={enrollmentId} sessionId={sessionId} journey={data} />}
            </div>
          </ScrollArea>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

// Vue d'ensemble ou saisie d'une étape ; remis à zéro quand on change de stagiaire (key).
function Body({ sessionId, journey }: { sessionId: string; journey: LearnerJourney }) {
  const [action, setAction] = useState<string | null>(null);
  return action ? (
    <ActionPanel sessionId={sessionId} journey={journey} action={action} onDone={() => setAction(null)} />
  ) : (
    <Overview journey={journey} onAction={setAction} />
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums text-mono">{value}</div>
      {sub && <div className="text-xs text-muted-foreground tabular-nums">{sub}</div>}
    </div>
  );
}

function Overview({ journey, onAction }: { journey: LearnerJourney; onAction: (a: string) => void }) {
  const caps = journey.capabilities;
  const done = journey.etapes.filter((s) => s.fait).length;
  const statusActions = STATUS_ACTIONS.filter((a) => shown(caps[a]));

  return (
    <div className="flex flex-col gap-5">
      <div className="text-sm text-muted-foreground">Session {journey.session}</div>
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
        <p className="rounded-md bg-amber-50 dark:bg-amber-950 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
          {journey.statut === 'ANNULE' ? 'Annulée' : `Abandon le ${formatDate(journey.abandon.le)}`}
          {journey.abandon.motif ? ` — ${journey.abandon.motif}` : ' — motif non renseigné'}
        </p>
      )}

      <section>
        <h3 className="mb-2 text-sm font-semibold text-mono">Parcours</h3>
        <ol className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {journey.etapes.map((step) => (
            <StepRow key={step.etape} step={step} caps={caps} onAction={onAction} />
          ))}
        </ol>
      </section>

      <Documents journey={journey} />

      {statusActions.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-mono">Statut de l’inscription</h3>
          <div className="flex flex-wrap gap-2">
            {statusActions.map((a) => (
              <ActionGate
                key={a}
                decision={caps[a]}
                size="sm"
                variant={a === 'annuler' || a === 'abandonner' ? 'destructive' : 'outline'}
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

function buttonLabel(action: string, step: JourneyStep) {
  if (action === 'convocation' || action === 'attestation')
    return step.fait && step.detail === 'rédigée par le moteur' ? 'Réémettre' : 'Émettre';
  if (action === 'convention_envoyer') return 'Envoi';
  if (action === 'convention_signer') return 'Signature';
  if (action === 'evaluation') return 'Ajouter';
  return step.fait ? 'Modifier' : 'Saisir';
}

function StepRow({
  step,
  caps,
  onAction,
}: {
  step: JourneyStep;
  caps: LearnerJourney['capabilities'];
  onAction: (a: string) => void;
}) {
  // Étape faite : seules les actions encore possibles (modifier, réémettre) restent.
  const actions = STEP_ACTIONS[step.etape].filter((a) => shown(caps[a]) && (!step.fait || caps[a].allowed));
  // Raison du blocage dite en clair (pas seulement au survol) pour l'étape à faire.
  const first = !step.fait ? actions.map((a) => caps[a]).find((d) => d && !d.allowed) : undefined;
  const blocked = first && !first.allowed ? first.message : null;

  return (
    <li className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <StepMark state={step.etat} label={STEP_LABEL[step.etape].label} className="mt-0.5" />
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">{STEP_LABEL[step.etape].label}</div>
          <div className="text-xs text-muted-foreground">
            {step.fait
              ? [step.le && formatDate(step.le), step.detail].filter(Boolean).join(' · ')
              : [STEP_STATE[step.etat].label, step.echeance && `échéance ${formatDate(step.echeance)}`, step.detail]
                  .filter(Boolean)
                  .join(' · ')}
          </div>
          {step.adaptation && step.adaptation !== 'AUCUNE' && (
            <Badge variant={step.adaptation === 'A_TRAITER' ? 'warning' : 'success'} appearance="light" size="sm" className="mt-1">
              Adaptation {step.adaptation === 'A_TRAITER' ? 'à traiter' : 'traitée'}
            </Badge>
          )}
          {step.prerequis_ok === false && (
            <Badge variant="warning" appearance="light" size="sm" className="mt-1">
              Prérequis non atteints
            </Badge>
          )}
          {blocked && (
            <p className="mt-1 text-xs text-muted-foreground">
              <span className={cn('font-medium', step.etat !== 'A_VENIR' && 'text-amber-600')}>
                {step.etat === 'A_VENIR' ? 'Pas encore : ' : 'Bloqué : '}
              </span>
              {blocked}
            </p>
          )}
          {!!step.manque?.length && <p className="mt-1 text-xs text-destructive">Rien de noté : {step.manque.join(', ')}</p>}
        </div>
      </div>
      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2 ps-7 sm:ps-0">
          {actions.map((a) => (
            <ActionGate key={a} decision={caps[a]} size="sm" variant="outline" onRun={() => onAction(a)}>
              {buttonLabel(a, step)}
            </ActionGate>
          ))}
        </div>
      )}
    </li>
  );
}

function Documents({ journey }: { journey: LearnerJourney }) {
  if (journey.documents.length === 0) return null;
  const docs = [...journey.documents].sort((a, b) =>
    a.type === b.type ? b.version - a.version : a.type.localeCompare(b.type),
  );
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-mono">Documents rédigés par le moteur</h3>
      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {docs.map((d) => (
          <DocumentRow key={d.id} enrollmentId={journey.inscription} doc={d} />
        ))}
      </ul>
    </section>
  );
}

function DocumentRow({ enrollmentId, doc }: { enrollmentId: string; doc: GeneratedDocument }) {
  const replaced = doc.statut === 'REMPLACE';
  return (
    <li className={cn('flex items-start gap-3 px-3 py-2.5', replaced && 'opacity-70')}>
      <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {DOC_KIND[doc.type] ?? doc.type}
          <span className="text-xs text-muted-foreground tabular-nums">v{doc.version}</span>
          {replaced ? (
            <Badge variant="secondary" size="sm">Remplacée</Badge>
          ) : (
            <Badge variant="success" appearance="light" size="sm">En vigueur</Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          Émise le {formatDate(doc.emis_le, 'd MMM yyyy HH:mm')}
          {doc.par ? ` par ${doc.par}` : ''}
          {doc.motif ? ` · ${doc.motif}` : ''}
        </div>
        <div className="truncate font-mono text-[11px] text-muted-foreground" title={`Empreinte SHA-256 : ${doc.sha256}`}>
          SHA-256 {doc.sha256.slice(0, 16)}…
        </div>
      </div>
      <Button asChild variant="ghost" size="sm">
        <a href={documentUrl(enrollmentId, doc.id)} target="_blank" rel="noreferrer">
          Ouvrir <ExternalLink />
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
    (action === 'convocation' && journey.etapes.find((s) => s.etape === 'convocation')?.fait) ||
    (action === 'attestation' && journey.documents.some((d) => d.type === 'ATTESTATION_FIN'));
  const fields = reissue ? [...spec.fields, REISSUE_REASON] : spec.fields;

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onDone}
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Parcours
      </button>
      <h3 className="text-base font-semibold text-mono">{spec.label}</h3>
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
