'use client';

import { useEffect, useState } from 'react';
import { LoaderCircleIcon } from 'lucide-react';
import { toast } from 'sonner';
import {
  useEvidenceDecision,
  type EvidenceDetail,
  type GridAnswer,
} from '@/lib/gsms/preuves';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Refusal } from '@/components/gsms/refusal';

const ANSWERS: { value: GridAnswer; label: string }[] = [
  { value: 'OUI', label: 'Oui' },
  { value: 'NON', label: 'Non' },
  { value: 'SANS_OBJET', label: 'Sans objet' },
];

// Valider ou rejeter une preuve. Une pièce qui a une grille demande une réponse à chaque point ; l'API
// refuse la validation si un point n'est pas satisfait, et le motif s'affiche dans la fenêtre.
export function DecisionDialog({
  preuve,
  decision,
  onClose,
}: {
  preuve: EvidenceDetail | null;
  decision: 'VALIDEE' | 'REJETEE' | null;
  onClose: () => void;
}) {
  const mutation = useEvidenceDecision();
  const [comment, setComment] = useState('');
  const [answers, setAnswers] = useState<Record<string, GridAnswer>>({});
  const reject = decision === 'REJETEE';
  const grid = preuve?.grille ?? [];
  const useGrid = grid.length > 0 && !reject;

  useEffect(() => {
    setComment('');
    setAnswers({});
    mutation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preuve?.id, decision]);

  const complete = !useGrid || grid.every((g) => answers[g.code]);
  const ready = complete && (!reject || comment.trim());

  async function confirm() {
    if (!preuve || !decision) return;
    try {
      const r = await mutation.mutateAsync({
        id: preuve.id,
        decision,
        comment: comment.trim(),
        checklist: useGrid ? answers : undefined,
      });
      toast.success(
        `${r.reference} : ${reject ? 'preuve rejetée' : 'preuve validée'}`,
      );
      onClose();
    } catch {
      // refus affiché dans la fenêtre
    }
  }

  return (
    <Dialog open={!!preuve && !!decision} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-sm:max-w-[calc(100vw-1rem)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {reject ? 'Rejeter' : 'Valider'} {preuve?.reference}
          </DialogTitle>
          <DialogDescription>
            {reject
              ? 'La preuve ne comptera plus pour ses indicateurs. Le motif est conservé avec la décision.'
              : 'Vous attestez avoir relu cette preuve. La décision est conservée avec l’état exact de la donnée.'}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4 max-h-[60dvh] overflow-y-auto">
          <p className="text-sm font-medium text-foreground">
            {preuve?.libelle}
          </p>
          <Refusal error={mutation.error} />
          {useGrid && (
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium text-foreground mb-1">
                Grille de relecture
              </legend>
              {grid.map((g) => (
                <div key={g.code} className="space-y-1.5">
                  <p className="text-sm text-foreground">
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {g.code}
                    </span>{' '}
                    {g.question}
                  </p>
                  <RadioGroup
                    value={answers[g.code] ?? ''}
                    onValueChange={(v) =>
                      setAnswers({ ...answers, [g.code]: v as GridAnswer })
                    }
                    className="flex flex-wrap gap-4"
                    aria-label={g.question}
                  >
                    {ANSWERS.filter(
                      (a) => a.value !== 'SANS_OBJET' || g.sans_objet_possible,
                    ).map((a) => (
                      <div key={a.value} className="flex items-center gap-1.5">
                        <RadioGroupItem
                          value={a.value}
                          id={`${g.code}-${a.value}`}
                        />
                        <Label
                          htmlFor={`${g.code}-${a.value}`}
                          className="font-normal"
                        >
                          {a.label}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
              ))}
            </fieldset>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="preuve-commentaire">
              {reject ? 'Motif' : 'Commentaire'}
              {!reject && (
                <span className="text-muted-foreground font-normal">
                  {' '}
                  (facultatif, obligatoire pour un point sans objet)
                </span>
              )}
            </Label>
            <Textarea
              id="preuve-commentaire"
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={
                reject
                  ? 'Ce qui manque ou ce qui ne va pas'
                  : 'Ce que vous avez vérifié'
              }
            />
          </div>
        </DialogBody>
        <DialogFooter className="flex flex-row justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Retour
          </Button>
          <Button
            variant={reject ? 'destructive' : 'primary'}
            disabled={mutation.isPending || !ready}
            onClick={confirm}
          >
            {mutation.isPending && (
              <LoaderCircleIcon className="animate-spin" />
            )}
            {reject ? 'Rejeter' : 'Valider'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
