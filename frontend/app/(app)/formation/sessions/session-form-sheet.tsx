'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { CalendarDays, LoaderCircleIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { useCreateSession, useFormateurs, useFormations, useUpdateSession } from '@/lib/gsms/sessions';
import type { SessionRow } from '@/lib/gsms/types';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Refusal } from '@/components/gsms/refusal';

const NO_TRAINER = 'none';

const schema = z
  .object({
    reference: z.string().trim().min(1, 'La référence est obligatoire.'),
    program_id: z.string().min(1, 'Choisissez une formation.'),
    start_date: z.string().min(1, 'Date de début obligatoire.'),
    end_date: z.string().min(1, 'Date de fin obligatoire.'),
    trainer_id: z.string(),
    location: z.string(),
    room: z.string(),
    capacity: z.string().regex(/^\d*$/, 'Nombre entier attendu.'),
  })
  .refine((v) => !v.start_date || !v.end_date || v.end_date >= v.start_date, {
    message: 'La date de fin précède la date de début.',
    path: ['end_date'],
  });

type FormValues = z.infer<typeof schema>;

function toValues(session?: SessionRow | null): FormValues {
  return {
    reference: session?.reference ?? '',
    program_id: session?.program_id ?? '',
    start_date: session?.start_date ?? '',
    end_date: session?.end_date ?? '',
    trainer_id: session?.trainer_id ?? NO_TRAINER,
    location: session?.location ?? '',
    room: session?.room ?? '',
    capacity: session?.capacity != null ? String(session.capacity) : '',
  };
}

// Création (session absente) ou modification d'une session.
export function SessionFormSheet({
  open,
  onOpenChange,
  session,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session?: SessionRow | null;
}) {
  const router = useRouter();
  const { data: formations = [] } = useFormations();
  const { data: formateurs = [] } = useFormateurs();
  const create = useCreateSession();
  const update = useUpdateSession(session?.id ?? '');
  const mutation = session ? update : create;

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: toValues(session) });

  useEffect(() => {
    if (open) {
      form.reset(toValues(session));
      create.reset();
      update.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, session]);

  // Référence proposée à la création : code formation + année + mois (ex. SST-2610-01)
  const programId = form.watch('program_id');
  const startDate = form.watch('start_date');
  useEffect(() => {
    if (session) return;
    const formation = formations.find((f) => f.id === programId);
    if (!formation || !startDate || form.getFieldState('reference').isDirty) return;
    const [y, m] = startDate.split('-');
    form.setValue('reference', `${formation.code}-${y.slice(2)}${m}-01`);
  }, [programId, startDate, formations, form, session]);

  async function onSubmit(values: FormValues) {
    const payload = {
      reference: values.reference.trim(),
      program_id: values.program_id,
      start_date: values.start_date,
      end_date: values.end_date,
      trainer_id: values.trainer_id === NO_TRAINER ? null : values.trainer_id,
      location: values.location.trim() || null,
      room: values.room.trim() || null,
      capacity: values.capacity ? Number(values.capacity) : null,
    };
    try {
      if (session) {
        await update.mutateAsync(payload);
        toast.success('La session a été modifiée.');
        onOpenChange(false);
      } else {
        const created = await create.mutateAsync(payload);
        toast.success('La session a été créée.');
        onOpenChange(false);
        router.push(`/formation/sessions/${created.id}`);
      }
    } catch {
      // Refus affiché dans le panneau (Refusal)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:w-[560px] sm:max-w-none inset-5 start-auto h-auto rounded-lg p-0 [&_[data-slot=sheet-close]]:top-4.5 [&_[data-slot=sheet-close]]:end-5">
        <SheetHeader className="border-b py-3.5 px-5 border-border">
          <SheetTitle className="flex items-center gap-2.5">
            <CalendarDays className="text-primary size-4" />
            {session ? `Modifier ${session.reference}` : 'Nouvelle session'}
          </SheetTitle>
        </SheetHeader>
        <SheetBody className="p-0">
          <ScrollArea className="h-[calc(100dvh-11.75rem)] ps-3 pe-2 me-1">
            <Form {...form}>
              <form id="session-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 px-2 py-4">
                <Refusal error={mutation.error} />

                <FormField
                  control={form.control}
                  name="program_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Formation</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Choisir une formation" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {formations.map((f) => (
                            <SelectItem key={f.id} value={f.id}>
                              {f.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  {(['start_date', 'end_date'] as const).map((name) => (
                    <FormField
                      key={name}
                      control={form.control}
                      name={name}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{name === 'start_date' ? 'Début' : 'Fin'}</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ))}
                </div>

                <FormField
                  control={form.control}
                  name="reference"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Référence</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex. SST-2610-01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="trainer_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Formateur</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={NO_TRAINER}>À affecter plus tard</SelectItem>
                          {formateurs.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.first_name} {t.last_name}
                              {t.is_external ? ' (externe)' : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="location"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel>Lieu</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="room"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Salle</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="capacity"
                  render={({ field }) => (
                    <FormItem className="w-1/2">
                      <FormLabel>Capacité</FormLabel>
                      <FormControl>
                        <Input inputMode="numeric" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </form>
            </Form>
          </ScrollArea>
        </SheetBody>
        <SheetFooter className="flex items-center justify-end gap-2 border-t py-3.5 px-5 border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="submit" form="session-form" disabled={mutation.isPending}>
            {mutation.isPending && <LoaderCircleIcon className="size-4 animate-spin" />}
            {session ? 'Enregistrer' : 'Créer la session'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
