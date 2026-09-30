'use client';

import { useEffect, useMemo, useState } from 'react';
import { LoaderCircleIcon, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { useEnroll, useStagiaires } from '@/lib/gsms/sessions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Refusal } from '@/components/gsms/refusal';

const FUNDINGS = ['Entreprise', 'OPCO', 'CPF', 'France Travail', 'Région', 'Personnel'];
const NONE = '__none__';

// Inscription d'un stagiaire existant à la session.
export function EnrollSheet({
  sessionId,
  enrolledLearnerIds,
  open,
  onOpenChange,
}: {
  sessionId: string;
  enrolledLearnerIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: stagiaires = [] } = useStagiaires();
  const enroll = useEnroll(sessionId);
  const [search, setSearch] = useState('');
  const [learnerId, setLearnerId] = useState('');
  const [funding, setFunding] = useState(NONE);

  useEffect(() => {
    if (open) {
      setSearch('');
      setLearnerId('');
      setFunding(NONE);
      enroll.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stagiaires
      .filter((s) => !enrolledLearnerIds.includes(s.id))
      .filter((s) => !q || `${s.first_name} ${s.last_name} ${s.email ?? ''}`.toLowerCase().includes(q))
      .sort((a, b) => a.last_name.localeCompare(b.last_name));
  }, [stagiaires, enrolledLearnerIds, search]);

  async function submit() {
    if (!learnerId) return;
    try {
      await enroll.mutateAsync({ learner_id: learnerId, financement: funding === NONE ? null : funding });
      toast.success('Le stagiaire a été inscrit.');
      onOpenChange(false);
    } catch {
      // Refus affiché dans le panneau
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:w-[480px] sm:max-w-none inset-5 start-auto h-auto rounded-lg p-0 [&_[data-slot=sheet-close]]:top-4.5 [&_[data-slot=sheet-close]]:end-5">
        <SheetHeader className="border-b py-3.5 px-5 border-border">
          <SheetTitle className="flex items-center gap-2.5">
            <UserPlus className="text-primary size-4" />
            Inscrire un stagiaire
          </SheetTitle>
        </SheetHeader>
        <SheetBody className="p-5 space-y-4">
          <Refusal error={enroll.error} />
          <div className="space-y-1.5">
            <Label htmlFor="enroll-search">Stagiaire</Label>
            <Input
              id="enroll-search"
              placeholder="Rechercher un stagiaire…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="max-h-72 overflow-y-auto rounded-md border border-border divide-y divide-border">
              {candidates.length === 0 && (
                <p className="p-3 text-sm text-muted-foreground">Aucun stagiaire disponible.</p>
              )}
              {candidates.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setLearnerId(s.id)}
                  className={`w-full text-start px-3 py-2 text-sm hover:bg-accent ${learnerId === s.id ? 'bg-primary/10 text-primary font-medium' : ''}`}
                >
                  {s.last_name} {s.first_name}
                  {s.email && <span className="block text-xs text-muted-foreground">{s.email}</span>}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Financement</Label>
            <Select value={funding} onValueChange={setFunding}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Non renseigné</SelectItem>
                {FUNDINGS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </SheetBody>
        <SheetFooter className="flex items-center justify-end gap-2 border-t py-3.5 px-5 border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={!learnerId || enroll.isPending}>
            {enroll.isPending && <LoaderCircleIcon className="size-4 animate-spin" />}
            Inscrire
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
