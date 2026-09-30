'use client';

import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { LoaderCircleIcon, Wrench } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { useOpenCapa, useOpenFindings } from '@/lib/gsms/capa';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
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
import { Textarea } from '@/components/ui/textarea';
import { Refusal } from '@/components/gsms/refusal';
import { IndicatorName } from '@/components/qualiopi/indicator-name';

const today = () => new Date().toISOString().slice(0, 10);

const schema = z.object({
  ecart: z.string().min(1, 'Choisissez l’écart à traiter.'),
  type: z.enum(['CORRECTIVE', 'PREVENTIVE']),
  titre: z.string().trim().min(1, 'L’intitulé est obligatoire.'),
  cause: z.string(),
  plan: z.string().trim().min(1, 'Le plan d’action est obligatoire.'),
  responsable: z.string().trim().min(1, 'Le responsable est obligatoire.'),
  echeance: z
    .string()
    .min(1, 'L’échéance est obligatoire.')
    .refine((v) => v >= today(), 'L’échéance ne peut pas être dans le passé.'),
});

type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = {
  ecart: '',
  type: 'CORRECTIVE',
  titre: '',
  cause: '',
  plan: '',
  responsable: '',
  echeance: '',
};

// Ouverture d'une action sur un écart à traiter (l'écart passe « en traitement »).
export function NewCapaSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: findings = [] } = useOpenFindings(open);
  const mutation = useOpenCapa();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  });
  const openable = findings.filter((f) => f.ouvrir_action.allowed);
  const chosen = findings.find((f) => f.id === form.watch('ecart'));

  useEffect(() => {
    if (open) {
      form.reset(EMPTY);
      mutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Intitulé et plan proposés à partir de l'écart choisi (modifiables)
  useEffect(() => {
    if (!chosen) return;
    if (!form.getFieldState('titre').isDirty)
      form.setValue('titre', chosen.titre);
    if (!form.getFieldState('plan').isDirty && chosen.remediation)
      form.setValue('plan', chosen.remediation);
  }, [chosen, form]);

  async function onSubmit(v: FormValues) {
    try {
      const created = await mutation.mutateAsync({
        findingId: v.ecart,
        body: {
          titre: v.titre,
          plan: v.plan,
          responsable: v.responsable,
          echeance: v.echeance,
          cause: v.cause.trim() || null,
          type: v.type,
        },
      });
      toast.success(`${created.reference} ouverte`);
      onOpenChange(false);
    } catch {
      // refus affiché dans le volet
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:w-[560px] sm:max-w-none inset-5 start-auto max-sm:inset-2 max-sm:w-auto h-auto rounded-lg p-0 gap-0 [&_[data-slot=sheet-close]]:top-4.5 [&_[data-slot=sheet-close]]:end-5">
        <SheetHeader className="border-b py-3.5 px-5 border-border">
          <SheetTitle className="flex items-center gap-2.5">
            <Wrench className="text-primary size-4" />
            Nouvelle action
          </SheetTitle>
        </SheetHeader>
        <SheetBody className="p-0">
          <ScrollArea className="h-[calc(100dvh-11.75rem)] max-sm:h-[calc(100dvh-9.75rem)] ps-3 pe-2 me-1 [&_[data-radix-scroll-area-viewport]>div]:!block">
            <Form {...form}>
              <form
                id="capa-form"
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-5 px-2 py-4"
              >
                <Refusal error={mutation.error} />

                <FormField
                  control={form.control}
                  name="ecart"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Écart traité</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger className="[&>span]:truncate">
                            <SelectValue
                              placeholder={
                                openable.length
                                  ? 'Choisir un écart'
                                  : 'Aucun écart à traiter'
                              }
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-w-[calc(100vw-2rem)]">
                          {openable.map((f) => (
                            <SelectItem key={f.id} value={f.id}>
                              <span className="truncate">
                                <IndicatorName number={f.indicateur} /> ·{' '}
                                {f.reference}
                                {f.session ? ` · ${f.session}` : ''} — {f.titre}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {chosen && (
                        <p className="text-xs text-muted-foreground">
                          {chosen.explication}
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="CORRECTIVE">Corrective</SelectItem>
                          <SelectItem value="PREVENTIVE">Préventive</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="titre"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Intitulé</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="cause"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Cause identifiée{' '}
                        <span className="text-muted-foreground font-normal">
                          (facultatif)
                        </span>
                      </FormLabel>
                      <FormControl>
                        <Textarea rows={2} {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="plan"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Plan d’action</FormLabel>
                      <FormControl>
                        <Textarea rows={4} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="responsable"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Responsable</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="echeance"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Échéance</FormLabel>
                        <FormControl>
                          <Input type="date" min={today()} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </form>
            </Form>
          </ScrollArea>
        </SheetBody>
        <SheetFooter className="flex flex-row justify-end gap-2 border-t border-border py-3.5 px-5">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="submit" form="capa-form" disabled={mutation.isPending}>
            {mutation.isPending && (
              <LoaderCircleIcon className="animate-spin" />
            )}
            Ouvrir l’action
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
