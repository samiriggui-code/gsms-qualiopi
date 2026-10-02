'use client';

import { useState } from 'react';
import { Info, LoaderCircleIcon, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/format';
import {
  edofApi,
  useEdofMutation,
  type Dossier,
  type DossierAction,
} from '@/lib/gsms/edof';
import { cn } from '@/lib/utils';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
} from '@/components/ui/alert';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ActionGate } from '@/components/gsms/action-gate';
import { Refusal } from '@/components/gsms/refusal';
import { DOSSIER_STATUS } from './labels';

const ORDER: DossierAction[] = [
  'valider',
  'declarer_depot',
  'enregistrer_complements',
  'declarer_complements_transmis',
  'enregistrer_decision',
  'rouvrir',
];
const WITH_FORM: DossierAction[] = [
  'declarer_depot',
  'enregistrer_complements',
  'enregistrer_decision',
];
const today = () => new Date().toISOString().slice(0, 10);

type Item = { label: string; requirement: string; due_on: string };

function TransitionDialog({
  dossier,
  action,
  onClose,
}: {
  dossier: Dossier;
  action: DossierAction | null;
  onClose: () => void;
}) {
  const [on, setOn] = useState(today());
  const [reference, setReference] = useState('');
  const [decision, setDecision] = useState('');
  const [note, setNote] = useState('');
  const [items, setItems] = useState<Item[]>([
    { label: '', requirement: '', due_on: '' },
  ]);
  const run = useEdofMutation(() =>
    edofApi.transition(dossier.id, action!, {
      on,
      reference: reference || undefined,
      decision: decision || undefined,
      note: note || undefined,
      items:
        action === 'enregistrer_complements'
          ? items
              .filter((i) => i.label.trim() || i.requirement)
              .map((i) => ({
                label: i.label.trim() || undefined,
                requirement: i.requirement || undefined,
                due_on: i.due_on || undefined,
              }))
          : undefined,
    }),
  );
  const pieces = dossier.pieces.filter(
    (p) => !p.generated && p.stage !== 'SUIVI',
  );

  return (
    <Dialog open={!!action} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-sm:max-w-[calc(100vw-1rem)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{action ? dossier.actions[action] : ''}</DialogTitle>
          <DialogDescription>
            {action === 'declarer_depot'
              ? 'Le dépôt se fait sur EDOF. Ici, vous enregistrez qu’il a eu lieu : le dossier transmis est figé (pièces, versions, contrôles).'
              : action === 'enregistrer_complements'
                ? 'Recopiez la demande reçue de la Caisse des Dépôts : chaque pièce demandée devient un point à fournir.'
                : 'Recopiez la décision reçue sur EDOF et déposez le courrier dans les pièces de suivi.'}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="transition-date">
              {action === 'declarer_depot'
                ? 'Date du dépôt'
                : action === 'enregistrer_complements'
                  ? 'Date de la demande'
                  : 'Date de la décision'}
            </Label>
            <Input
              id="transition-date"
              type="date"
              value={on}
              max={today()}
              onChange={(e) => setOn(e.target.value)}
            />
          </div>
          {action === 'declarer_depot' && (
            <div className="space-y-1.5">
              <Label htmlFor="transition-ref">
                Numéro de demande EDOF (si affiché)
              </Label>
              <Input
                id="transition-ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
          )}
          {action === 'enregistrer_decision' && (
            <>
              <div className="space-y-1.5">
                <Label>Décision</Label>
                <Select value={decision} onValueChange={setDecision}>
                  <SelectTrigger aria-label="Décision de la Caisse des Dépôts">
                    <SelectValue placeholder="Choisir" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACCEPTEE">Acceptée</SelectItem>
                    <SelectItem value="REFUSEE">Refusée</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="decision-note">Observations</Label>
                <Textarea
                  id="decision-note"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            </>
          )}
          {action === 'enregistrer_complements' && (
            <div className="space-y-3">
              {items.map((item, i) => (
                <div
                  key={i}
                  className="rounded-md border border-border p-2.5 space-y-2"
                >
                  <Select
                    value={item.requirement}
                    onValueChange={(v) =>
                      setItems(
                        items.map((x, j) =>
                          j === i ? { ...x, requirement: v } : x,
                        ),
                      )
                    }
                  >
                    <SelectTrigger aria-label="Pièce du référentiel demandée">
                      <SelectValue placeholder="Pièce du référentiel (facultatif)" />
                    </SelectTrigger>
                    <SelectContent>
                      {pieces.map((p) => (
                        <SelectItem key={p.code} value={p.code}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Libellé de la demande (si hors référentiel)"
                    value={item.label}
                    onChange={(e) =>
                      setItems(
                        items.map((x, j) =>
                          j === i ? { ...x, label: e.target.value } : x,
                        ),
                      )
                    }
                  />
                  <div className="flex items-center gap-2">
                    <Label
                      className="text-xs font-normal shrink-0"
                      htmlFor={`due-${i}`}
                    >
                      À fournir avant le
                    </Label>
                    <Input
                      id={`due-${i}`}
                      type="date"
                      value={item.due_on}
                      onChange={(e) =>
                        setItems(
                          items.map((x, j) =>
                            j === i ? { ...x, due_on: e.target.value } : x,
                          ),
                        )
                      }
                    />
                    {items.length > 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        mode="icon"
                        aria-label="Retirer"
                        onClick={() =>
                          setItems(items.filter((_, j) => j !== i))
                        }
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setItems([
                    ...items,
                    { label: '', requirement: '', due_on: '' },
                  ])
                }
              >
                <Plus /> Autre pièce demandée
              </Button>
            </div>
          )}
          <Refusal error={run.error} />
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button
            disabled={run.isPending}
            onClick={() =>
              run.mutate(undefined, {
                onSuccess: () => {
                  toast.success('Enregistré.');
                  onClose();
                },
              })
            }
          >
            {run.isPending && (
              <LoaderCircleIcon className="size-4 animate-spin" />
            )}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** État du dossier et étapes autorisées par l'API ; la décision appartient à la Caisse des Dépôts. */
export function DossierActions({ dossier }: { dossier: Dossier }) {
  const [action, setAction] = useState<DossierAction | null>(null);
  const run = useEdofMutation((a: DossierAction) =>
    edofApi.transition(dossier.id, a),
  );
  const status = DOSSIER_STATUS[dossier.display_status];
  const close = useEdofMutation((id: string) =>
    edofApi.closeComplement(
      id,
      'Demande retirée ou satisfaite autrement (voir EDOF)',
    ),
  );
  const visible = ORDER.filter((a) => {
    const d = dossier.capabilities[a];
    return d.allowed || (d.code !== 'ETAT' && d.code !== 'PERMISSION');
  });
  const blocked = dossier.capabilities.valider;

  function start(a: DossierAction) {
    if (WITH_FORM.includes(a)) return setAction(a);
    run.mutate(a, {
      onSuccess: () => toast.success(`${dossier.actions[a]} : c’est fait.`),
      onError: (e) => toast.error(e.message),
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={status.color}>{status.label}</Badge>
        <span className="text-xs text-muted-foreground">
          {dossier.counts.BLOQUANT} bloquant(s) · {dossier.counts.A_VERIFIER} à
          vérifier
        </span>
      </div>
      <Alert appearance="light" variant="info" size="sm">
        <AlertIcon>
          <Info />
        </AlertIcon>
        <AlertDescription>{dossier.reminder}</AlertDescription>
      </Alert>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        {dossier.validated_by && (
          <>
            <dt className="text-muted-foreground">Validé en interne</dt>
            <dd>
              {dossier.validated_by}, {formatDate(dossier.validated_at)}
            </dd>
          </>
        )}
        {dossier.submitted_on && (
          <>
            <dt className="text-muted-foreground">Déposé sur EDOF</dt>
            <dd>
              {formatDate(dossier.submitted_on)} par {dossier.submitted_by}
              {dossier.cdc_reference ? ` (n° ${dossier.cdc_reference})` : ''}
            </dd>
          </>
        )}
        {dossier.submission_snapshot?.programme && (
          <>
            <dt className="text-muted-foreground">Programme transmis</dt>
            <dd>version {dossier.submission_snapshot.programme.version}</dd>
          </>
        )}
        {dossier.decision && (
          <>
            <dt className="text-muted-foreground">Décision de la CDC</dt>
            <dd
              className={cn(
                dossier.decision === 'REFUSEE' && 'text-destructive',
              )}
            >
              {dossier.decision === 'ACCEPTEE' ? 'Acceptée' : 'Refusée'} le{' '}
              {formatDate(dossier.decision_on)}
              {dossier.decision_note ? ` — ${dossier.decision_note}` : ''}
            </dd>
          </>
        )}
      </dl>

      <div className="flex flex-wrap gap-2">
        {visible.map((a) => (
          <ActionGate
            key={a}
            decision={dossier.capabilities[a]}
            size="sm"
            variant={a === 'rouvrir' ? 'outline' : 'primary'}
            pending={run.isPending && run.variables === a}
            onRun={() => start(a)}
          >
            {dossier.actions[a]}
          </ActionGate>
        ))}
      </div>
      {!blocked.allowed &&
        blocked.code !== 'ETAT' &&
        blocked.code !== 'PERMISSION' &&
        (blocked.details?.length ?? 0) > 0 && (
          <Alert appearance="light" variant="warning" size="sm">
            <AlertIcon>
              <Info />
            </AlertIcon>
            <div>
              <AlertTitle>{blocked.message}</AlertTitle>
              <AlertDescription>
                <ul className="list-disc ps-4 mt-1">
                  {(blocked.details as unknown as string[])
                    .slice(0, 6)
                    .map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                </ul>
                {(blocked.details?.length ?? 0) > 6 && (
                  <p className="mt-1">
                    … voir la liste complète des contrôles.
                  </p>
                )}
              </AlertDescription>
            </div>
          </Alert>
        )}

      {dossier.complements.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">
            Compléments demandés par la CDC
          </h3>
          <ul className="divide-y divide-border rounded-md border border-border text-sm">
            {dossier.complements.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-2 px-3 py-2"
              >
                <span className="grow min-w-0 basis-48">
                  {c.label}
                  <span className="block text-xs text-muted-foreground">
                    Demandée le {formatDate(c.requested_on)}
                    {c.due_on ? `, avant le ${formatDate(c.due_on)}` : ''}
                    {c.note ? ` — ${c.note}` : ''}
                  </span>
                </span>
                <Badge
                  size="sm"
                  variant={
                    c.status === 'FOURNIE'
                      ? 'success'
                      : c.status === 'ANNULEE'
                        ? 'secondary'
                        : 'warning'
                  }
                  appearance="light"
                >
                  {c.status === 'FOURNIE'
                    ? 'Fournie'
                    : c.status === 'ANNULEE'
                      ? 'Close'
                      : 'À fournir'}
                </Badge>
                {c.status === 'DEMANDEE' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      close.mutate(c.id, {
                        onError: (e) => toast.error(e.message),
                      })
                    }
                  >
                    Clore sans pièce
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <TransitionDialog
        key={action ?? 'none'}
        dossier={dossier}
        action={action}
        onClose={() => setAction(null)}
      />
    </div>
  );
}
