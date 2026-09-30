'use client';

import { useEffect, useState } from 'react';
import { LoaderCircleIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useCapaStep, type CapaAction, type CapaStep } from '@/lib/gsms/capa';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Refusal } from '@/components/gsms/refusal';

const EXPLAIN: Record<CapaStep, string> = {
  demarrer: 'L’action passe « en cours ».',
  realiser:
    'L’action passe « à vérifier ». Décrivez ce qui a été fait : cette note sert de trace de réalisation.',
  verifier:
    'La vérification d’efficacité clôt l’action. Pour un écart issu d’un contrôle, le moteur réévalue le contrôle et ne clôt que si l’écart a disparu.',
  annuler: 'L’action est annulée. Le motif est conservé dans l’historique.',
};

// Confirmation d'une étape (depuis le tableau ou la fiche) : saisie demandée par l'API, puis notification.
export function StepDialog({
  target,
  onClose,
}: {
  target: { action: CapaAction; step: CapaStep } | null;
  onClose: () => void;
}) {
  const mutation = useCapaStep();
  const [text, setText] = useState('');
  const decision = target ? target.action.capabilities[target.step] : null;
  const inputs = decision?.a_saisir ?? [];
  const field = inputs.includes('motif')
    ? 'motif'
    : inputs.includes('note')
      ? 'note'
      : null;
  const required = target?.step === 'realiser' || target?.step === 'annuler';

  useEffect(() => {
    setText('');
    mutation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  async function confirm() {
    if (!target) return;
    try {
      const updated = await mutation.mutateAsync({
        id: target.action.id,
        step: target.step,
        ...(field ? { [field]: text.trim() } : {}),
      });
      toast.success(`${updated.reference} : ${updated.statut_libelle}`);
      onClose();
    } catch {
      // refus affiché dans la fenêtre
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-sm:max-w-[calc(100vw-1rem)]">
        <DialogHeader>
          <DialogTitle>
            {decision?.libelle} — {target?.action.reference}
          </DialogTitle>
          <DialogDescription>
            {target ? EXPLAIN[target.step] : null}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <p className="text-sm font-medium text-foreground">
            {target?.action.titre}
          </p>
          <Refusal error={mutation.error} />
          {field && (
            <div className="space-y-1.5">
              <Label htmlFor="capa-step-text">
                {field === 'motif' ? 'Motif' : 'Note'}
                {!required && (
                  <span className="text-muted-foreground font-normal">
                    {' '}
                    (facultatif)
                  </span>
                )}
              </Label>
              <Textarea
                id="capa-step-text"
                rows={4}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  field === 'motif'
                    ? 'Pourquoi cette action est annulée'
                    : 'Ce qui a été fait, avec quelles preuves'
                }
              />
            </div>
          )}
        </DialogBody>
        <DialogFooter className="flex flex-row justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Retour
          </Button>
          <Button
            variant={target?.step === 'annuler' ? 'destructive' : 'primary'}
            disabled={
              mutation.isPending || (required && !!field && !text.trim())
            }
            onClick={confirm}
          >
            {mutation.isPending && (
              <LoaderCircleIcon className="animate-spin" />
            )}
            Confirmer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
