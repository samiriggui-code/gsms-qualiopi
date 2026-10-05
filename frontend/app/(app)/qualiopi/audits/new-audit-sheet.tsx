'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LoaderCircleIcon, ScanSearch } from 'lucide-react';
import { toast } from 'sonner';
import { formatDateRange } from '@/lib/format';
import { useAuditSample, useOpenAudit } from '@/lib/gsms/audits';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Refusal } from '@/components/gsms/refusal';

// Ouverture d'un audit : l'API propose l'échantillon (les sessions réalisées les plus récentes de chaque
// formation, comme un certificateur) ; on peut en retirer ou en ajouter avant de prendre la photo.
export function NewAuditSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const sample = useAuditSample(open);
  const mutation = useOpenAudit();
  const [titre, setTitre] = useState('');
  const [type, setType] = useState<'BLANC' | 'INTERNE'>('BLANC');
  const [auditeur, setAuditeur] = useState('');
  const [prevu, setPrevu] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setTitre('');
    setType('BLANC');
    setAuditeur('');
    setPrevu('');
    mutation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (sample.data)
      setPicked(
        new Set(
          sample.data.sessions.filter((s) => s.proposee).map((s) => s.id),
        ),
      );
  }, [sample.data]);

  // Sans session cochée, l'API reprendrait l'échantillon proposé : on demande d'en garder une.
  const noSession = !!sample.data?.sessions.length && picked.size === 0;
  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  async function submit() {
    try {
      const audit = await mutation.mutateAsync({
        titre: titre.trim(),
        type,
        auditeur: auditeur.trim(),
        prevu_le: prevu || null,
        sessions: Array.from(picked),
      });
      toast.success(`${audit.reference} ouvert`, {
        description: 'Photo des preuves prise : jugez chaque indicateur.',
      });
      onOpenChange(false);
      router.push(`/qualiopi/audits/${audit.id}`);
    } catch {
      // refus affiché dans le volet
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:w-[560px] sm:max-w-none inset-5 start-auto max-sm:inset-2 max-sm:w-auto h-auto rounded-lg p-0 gap-0 [&_[data-slot=sheet-close]]:top-4.5 [&_[data-slot=sheet-close]]:end-5">
        <SheetHeader className="border-b py-3.5 px-5 border-border">
          <SheetTitle className="flex items-center gap-2.5">
            <ScanSearch className="text-primary size-4" /> Nouvel audit
          </SheetTitle>
        </SheetHeader>
        <SheetBody className="p-0 grow flex flex-col min-h-0">
          <ScrollArea className="h-[calc(100dvh-11.75rem)] max-sm:h-[calc(100dvh-9.75rem)] [&_[data-radix-scroll-area-viewport]>div]:!block">
            <div className="space-y-5 p-5">
              <p className="text-sm text-muted-foreground">
                À l’ouverture, les résultats du moteur, les preuves et les
                écarts de l’échantillon sont figés. Les jugements portent sur
                cette photo, même si les données changent ensuite.
              </p>
              <Refusal error={mutation.error} />
              <div className="space-y-1.5">
                <Label htmlFor="audit-titre">Intitulé</Label>
                <Input
                  id="audit-titre"
                  value={titre}
                  onChange={(e) => setTitre(e.target.value)}
                  placeholder="Audit blanc avant la surveillance"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select
                    value={type}
                    onValueChange={(v) => setType(v as 'BLANC' | 'INTERNE')}
                  >
                    <SelectTrigger aria-label="Type d’audit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BLANC">Audit blanc</SelectItem>
                      <SelectItem value="INTERNE">Audit interne</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="audit-date">
                    Date prévue{' '}
                    <span className="text-muted-foreground font-normal">
                      (facultatif)
                    </span>
                  </Label>
                  <Input
                    id="audit-date"
                    type="date"
                    value={prevu}
                    onChange={(e) => setPrevu(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="audit-auditeur">Auditeur ou auditrice</Label>
                <Input
                  id="audit-auditeur"
                  value={auditeur}
                  onChange={(e) => setAuditeur(e.target.value)}
                  placeholder="Nom de la personne qui juge"
                />
              </div>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-foreground">
                  Échantillon de sessions
                </legend>
                {sample.data && (
                  <p className="text-xs text-muted-foreground">
                    Sessions réalisées sur la période (
                    {sample.data.periode.label}). Celles cochées sont proposées
                    : les plus récentes de chaque formation.
                  </p>
                )}
                {sample.isLoading && <Skeleton className="h-24" />}
                <Refusal error={sample.error} />
                {sample.data?.sessions.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Aucune session réalisée sur la période : l’audit portera sur
                    l’organisme et les formations.
                  </p>
                )}
                <ul className="space-y-1.5">
                  {sample.data?.sessions.map((s) => (
                    <li key={s.id} className="flex items-start gap-2.5">
                      <Checkbox
                        id={`ech-${s.id}`}
                        checked={picked.has(s.id)}
                        onCheckedChange={() => toggle(s.id)}
                        className="mt-0.5"
                      />
                      <Label
                        htmlFor={`ech-${s.id}`}
                        className="font-normal leading-snug block"
                      >
                        <span className="text-foreground font-medium">
                          {s.reference}
                        </span>{' '}
                        <span className="text-muted-foreground">
                          {s.formation} · {formatDateRange(s.du, s.au)}
                        </span>
                      </Label>
                    </li>
                  ))}
                </ul>
                {noSession && (
                  <p className="text-xs text-destructive">
                    Cochez au moins une session.
                  </p>
                )}
              </fieldset>
            </div>
          </ScrollArea>
        </SheetBody>
        <SheetFooter className="flex flex-row justify-end gap-2 border-t border-border py-3 px-5">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            onClick={submit}
            disabled={
              mutation.isPending ||
              !titre.trim() ||
              !auditeur.trim() ||
              noSession
            }
          >
            {mutation.isPending && (
              <LoaderCircleIcon className="animate-spin" />
            )}
            Ouvrir l’audit
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
