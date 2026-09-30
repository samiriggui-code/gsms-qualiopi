'use client';

import * as React from 'react';
import { useState } from 'react';
import { Building2, ChevronLeft, ExternalLink, FileText, Mail, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { documentUrl } from '@/lib/api';
import { formatDate, percent } from '@/lib/format';
import {
  ACTIONS,
  CONFIRM_TEXT,
  REISSUE_REASON,
  STATUS_ACTIONS,
  STEP_ACTIONS,
} from '@/lib/gsms/journey-actions';
import { ENROLLMENT_STATUS, STEP_LABEL, STEP_STATE } from '@/lib/gsms/labels';
import { useJourneyAction, useLearnerJourney, useSessionActivity } from '@/lib/gsms/sessions';
import type { Decision, GeneratedDocument, JourneyStep, LearnerJourney } from '@/lib/gsms/types';
import { cn } from '@/lib/utils';
import { Badge, BadgeDot } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardToolbar } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ActionForm } from '@/components/gsms/action-form';
import { ActionGate } from '@/components/gsms/action-gate';
import { Refusal } from '@/components/gsms/refusal';
import { StepMark } from '@/components/gsms/step-mark';
import { ActivityList } from './session-overview';

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

  // Grand panneau latéral repris de « Customer Details » (store-inventory/components/customer-details-sheet).
  return (
    <Sheet open={!!enrollmentId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="gap-0 lg:w-[1160px] sm:max-w-none inset-5 border start-auto max-sm:inset-2 max-sm:w-auto h-auto rounded-lg p-0 [&_[data-slot=sheet-close]]:top-4.5 [&_[data-slot=sheet-close]]:end-5">
        <SheetHeader className="border-b py-3.5 px-5 border-border">
          <SheetTitle className="font-medium">Fiche stagiaire</SheetTitle>
        </SheetHeader>
        <SheetBody className="p-0 grow flex flex-col min-h-0">
          {query.isPending && enrollmentId && (
            <div className="flex flex-col gap-2 p-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          )}
          {query.isError && (
            <div className="p-5">
              <Refusal error={query.error} />
            </div>
          )}
          {data && enrollmentId && <Body key={enrollmentId} sessionId={sessionId} journey={data} onClose={onClose} />}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <span className="font-normal text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </>
  );
}

function SideCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="rounded-md shadow-none">
      <CardHeader className="min-h-[34px] bg-accent/50">
        <CardTitle className="text-2sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="py-3 space-y-2.5 text-2sm">{children}</CardContent>
    </Card>
  );
}

function Line({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate text-foreground">{children}</span>
    </div>
  );
}

// En-tête (identité, statut, actions), colonne de coordonnées, onglets ; la saisie d'une étape remplace
// les onglets. Remis à zéro quand on change de stagiaire (key).
function Body({ sessionId, journey, onClose }: { sessionId: string; journey: LearnerJourney; onClose: () => void }) {
  const [action, setAction] = useState<string | null>(null);
  const caps = journey.capabilities;
  const statusActions = STATUS_ACTIONS.filter((a) => shown(caps[a]));
  const done = journey.etapes.filter((s) => s.fait).length;
  const c = journey.contact;
  const presence = percent(journey.assiduite.suivies, journey.assiduite.prevues);

  return (
    <>
      <div className="flex justify-between flex-wrap gap-2 border-b border-border px-5 py-4">
        <div className="flex flex-col gap-3 min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="text-lg lg:text-[22px] font-semibold text-foreground leading-none">{journey.stagiaire}</span>
            <Badge size="sm" className={ENROLLMENT_STATUS[journey.statut].color}>
              {ENROLLMENT_STATUS[journey.statut].label}
            </Badge>
          </div>
          <div className="flex items-center flex-wrap gap-2 text-2sm">
            <Meta label="Session" value={journey.session} />
            {c?.inscrit_le && (
              <>
                <BadgeDot className="bg-muted-foreground size-1" />
                <Meta label="Inscrit le" value={formatDate(c.inscrit_le)} />
              </>
            )}
            {c?.financement && (
              <>
                <BadgeDot className="bg-muted-foreground size-1" />
                <Meta label="Financement" value={c.financement} />
              </>
            )}
          </div>
        </div>
        <div className="flex items-center flex-wrap gap-2.5">
          {statusActions.map((a) => (
            <ActionGate
              key={a}
              decision={caps[a]}
              size="sm"
              variant={a === 'annuler' || a === 'abandonner' ? 'destructive' : 'outline'}
              onRun={() => setAction(a)}
            >
              {ACTIONS[a].label}
            </ActionGate>
          ))}
        </div>
      </div>

      <ScrollArea
        className="flex flex-col lg:h-[calc(100dvh-15.8rem)] max-lg:flex-1 max-lg:min-h-0 mx-1.5 [&_[data-radix-scroll-area-viewport]>div]:!block"
      >
        <div className="flex flex-wrap lg:flex-nowrap px-3.5 grow">
          <div className="w-full shrink-0 lg:w-[280px] py-5 lg:pe-5 space-y-4">
            <SideCard title="Coordonnées">
              <Line icon={Mail}>{c?.email ?? 'E-mail non renseigné'}</Line>
              <Line icon={Phone}>{c?.telephone ?? 'Téléphone non renseigné'}</Line>
              <Line icon={Building2}>{c?.entreprise ?? 'Sans entreprise'}</Line>
            </SideCard>
            <SideCard title="Avancement du parcours">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Étapes faites</span>
                <span className="font-semibold text-foreground tabular-nums">
                  {done} / {journey.etapes.length}
                </span>
              </div>
              <Progress value={percent(done, journey.etapes.length)} className="h-1.5" />
            </SideCard>
            <SideCard title="Assiduité">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Demi-journées suivies</span>
                <span className="font-semibold text-foreground tabular-nums">
                  {journey.assiduite.suivies} / {journey.assiduite.prevues}
                </span>
              </div>
              <Progress value={presence} className="h-1.5" />
              {journey.assiduite.heures_suivies && (
                <div className="text-muted-foreground tabular-nums">
                  {journey.assiduite.heures_suivies} h sur {journey.assiduite.heures_prevues} h
                </div>
              )}
            </SideCard>
            {journey.abandon && (
              <p className="rounded-md bg-amber-50 dark:bg-amber-950 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                {journey.statut === 'ANNULE' ? 'Annulée' : `Abandon le ${formatDate(journey.abandon.le)}`}
                {journey.abandon.motif ? ` — ${journey.abandon.motif}` : ' — motif non renseigné'}
              </p>
            )}
          </div>

          <div className="grow min-w-0 lg:border-s border-border space-y-5 py-5 lg:ps-5">
            {action ? (
              <ActionPanel sessionId={sessionId} journey={journey} action={action} onDone={() => setAction(null)} />
            ) : (
              <Tabs defaultValue="journey" className="w-auto text-sm text-muted-foreground">
                <TabsList className="inline-flex w-auto max-w-full grow-0 mb-2.5 overflow-x-auto [scrollbar-width:none]">
                  <TabsTrigger value="journey">Parcours</TabsTrigger>
                  <TabsTrigger value="documents">Documents ({journey.documents.length})</TabsTrigger>
                  <TabsTrigger value="questionnaires">Questionnaires ({journey.questionnaires?.length ?? 0})</TabsTrigger>
                  <TabsTrigger value="activity">Activité</TabsTrigger>
                </TabsList>
                <TabsContent value="journey">
                  <ol className="flex flex-col divide-y divide-border rounded-lg border border-border">
                    {journey.etapes.map((step) => (
                      <StepRow key={step.etape} step={step} caps={caps} onAction={setAction} />
                    ))}
                  </ol>
                </TabsContent>
                <TabsContent value="documents">
                  {journey.documents.length ? (
                    <Documents journey={journey} />
                  ) : (
                    <p className="text-muted-foreground">Aucun document émis pour l’instant.</p>
                  )}
                </TabsContent>
                <TabsContent value="questionnaires">
                  <Questionnaires journey={journey} />
                </TabsContent>
                <TabsContent value="activity">
                  <LearnerActivity sessionId={sessionId} name={journey.stagiaire} />
                </TabsContent>
              </Tabs>
            )}
          </div>
        </div>
      </ScrollArea>

      <SheetFooter className="flex-row border-t pb-4 p-5 border-border gap-2.5 lg:gap-0">
        <Button variant="ghost" onClick={onClose}>
          Fermer
        </Button>
      </SheetFooter>
    </>
  );
}

function Questionnaires({ journey }: { journey: LearnerJourney }) {
  const list = journey.questionnaires ?? [];
  if (!list.length) return <p className="text-muted-foreground">Aucun questionnaire envoyé en ligne.</p>;
  return (
    <div className="flex flex-col gap-4">
      {list.map((q) => (
        <Card key={q.type} className="rounded-md shadow-none">
          <CardHeader className="min-h-[34px] bg-accent/50">
            <CardTitle className="text-2sm">{q.questionnaire}</CardTitle>
            <CardToolbar>
              {q.repondu_le ? (
                <Badge variant="success" appearance="light" size="sm">
                  Répondu le {formatDate(q.repondu_le)}
                </Badge>
              ) : (
                <Badge variant="warning" appearance="light" size="sm">
                  {q.ouvert_le ? 'Ouvert, sans réponse' : 'Pas encore ouvert'}
                </Badge>
              )}
            </CardToolbar>
          </CardHeader>
          {q.reponses.length > 0 && (
            <CardContent className="py-3">
              <dl className="grid gap-2 text-2sm">
                {q.reponses.map((r) => (
                  <div key={r.question} className="grid gap-0.5 sm:grid-cols-[1fr_auto] sm:gap-4">
                    <dt className="text-muted-foreground">{r.question}</dt>
                    <dd className="font-medium text-foreground sm:text-end">{String(r.reponse)}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}

function LearnerActivity({ sessionId, name }: { sessionId: string; name: string }) {
  const { data, isLoading } = useSessionActivity(sessionId);
  if (isLoading) return <Skeleton className="h-24 w-full" />;
  return <ActivityList items={(data ?? []).filter((a) => a.stagiaire === name || a.qui === name)} />;
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
