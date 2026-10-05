'use client';

import { useEffect, useState } from 'react';
import { LoaderCircleIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useCloseAudit, type AuditDetail } from '@/lib/gsms/audits';
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

// Clôture : les jugements se figent et chaque non-conformité devient un constat à traiter par une action
// corrective (page Actions correctives).
export function CloseDialog({
  audit,
  open,
  onClose,
}: {
  audit: AuditDetail;
  open: boolean;
  onClose: () => void;
}) {
  const mutation = useCloseAudit(audit.id);
  const [conclusion, setConclusion] = useState('');
  const nc = audit.jugements
    .filter((j) => j.jugement === 'NC_MINEURE' || j.jugement === 'NC_MAJEURE')
    .reduce((n, j) => n + j.nombre, 0);

  useEffect(() => {
    setConclusion('');
    mutation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function confirm() {
    try {
      await mutation.mutateAsync(conclusion.trim());
      toast.success(`${audit.reference} clos`, {
        description: nc
          ? `${nc} constat${nc > 1 ? 's' : ''} créé${nc > 1 ? 's' : ''} : ouvrez les actions correctives.`
          : undefined,
      });
      onClose();
    } catch {
      // refus affiché dans la fenêtre
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-sm:max-w-[calc(100vw-1rem)]">
        <DialogHeader>
          <DialogTitle>Clore {audit.reference}</DialogTitle>
          <DialogDescription>
            Les jugements ne pourront plus être modifiés.{' '}
            {nc
              ? `${nc} non-conformité${nc > 1 ? 's' : ''} deviendr${nc > 1 ? 'ont' : 'a'} un constat à traiter.`
              : 'Aucune non-conformité : aucun constat ne sera créé.'}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <Refusal error={mutation.error} />
          <div className="space-y-1.5">
            <Label htmlFor="audit-conclusion">Conclusion</Label>
            <Textarea
              id="audit-conclusion"
              rows={4}
              value={conclusion}
              onChange={(e) => setConclusion(e.target.value)}
              placeholder="Synthèse de l’audit : points forts, écarts, suites à donner"
            />
          </div>
        </DialogBody>
        <DialogFooter className="flex flex-row justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Retour
          </Button>
          <Button
            onClick={confirm}
            disabled={mutation.isPending || !conclusion.trim()}
          >
            {mutation.isPending && (
              <LoaderCircleIcon className="animate-spin" />
            )}
            Clore l’audit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
