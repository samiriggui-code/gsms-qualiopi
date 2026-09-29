'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, CalendarDays, LoaderCircleIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  SESSION_STATUS,
  SessionStatus,
  useCreateSession,
  usePrograms,
  useTrainers,
} from '@/lib/formation/sessions';
import { Alert, AlertIcon, AlertTitle } from '@/components/ui/alert';
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
    status: z.enum(['PLANIFIEE', 'CONFIRMEE']),
  })
  .refine((v) => !v.start_date || !v.end_date || v.end_date >= v.start_date, {
    message: 'La date de fin précède la date de début.',
    path: ['end_date'],
  });

type FormValues = z.infer<typeof schema>;

const DEFAULTS: FormValues = {
  reference: '',
  program_id: '',
  start_date: '',
  end_date: '',
  trainer_id: NO_TRAINER,
  location: "Marseille — Centre FORM'SSI",
  room: '',
  capacity: '12',
  status: 'PLANIFIEE',
};

export function NewSessionSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { data: programs = [] } = usePrograms();
  const { data: trainers = [] } = useTrainers();
  const createSession = useCreateSession();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULTS,
  });

  // Référence proposée à partir du code formation et du mois de début (ex. SST-2610-01)
  const programId = form.watch('program_id');
  const startDate = form.watch('start_date');
  useEffect(() => {
    const program = programs.find((p) => p.id === programId);
    if (!program || !startDate || form.getFieldState('reference').isDirty) return;
    const [y, m] = startDate.split('-');
    form.setValue('reference', `${program.code}-${y.slice(2)}${m}-01`);
  }, [programId, startDate, programs, form]);

  useEffect(() => {
    if (!open) {
      form.reset(DEFAULTS);
      createSession.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function onSubmit(values: FormValues) {
    const session = await createSession.mutateAsync({
      reference: values.reference.trim(),
      program_id: values.program_id,
      start_date: values.start_date,
      end_date: values.end_date,
      trainer_id: values.trainer_id === NO_TRAINER ? undefined : values.trainer_id,
      location: values.location.trim() || undefined,
      room: values.room.trim() || undefined,
      capacity: values.capacity ? Number(values.capacity) : undefined,
      status: values.status as SessionStatus,
    });
    onOpenChange(false);
    router.push(`/formation/sessions/${session.id}`);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:w-[560px] sm:max-w-none inset-5 start-auto h-auto rounded-lg p-0 [&_[data-slot=sheet-close]]:top-4.5 [&_[data-slot=sheet-close]]:end-5">
        <SheetHeader className="border-b py-3.5 px-5 border-border">
          <SheetTitle className="flex items-center gap-2.5">
            <CalendarDays className="text-primary size-4" />
            Nouvelle session
          </SheetTitle>
        </SheetHeader>
        <SheetBody className="p-0">
          <ScrollArea className="h-[calc(100dvh-11.75rem)] ps-3 pe-2 me-1">
            <Form {...form}>
              <form
                id="new-session-form"
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-5 px-2 py-4"
              >
                {createSession.error && (
                  <Alert variant="destructive">
                    <AlertIcon>
                      <AlertCircle />
                    </AlertIcon>
                    <AlertTitle>{createSession.error.message}</AlertTitle>
                  </Alert>
                )}

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
                          {programs.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="start_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Début</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="end_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fin</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
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
                          {trainers.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.full_name}
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
                          <Input placeholder="Salle A" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="capacity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Capacité</FormLabel>
                        <FormControl>
                          <Input inputMode="numeric" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Statut</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {(['PLANIFIEE', 'CONFIRMEE'] as const).map((s) => (
                              <SelectItem key={s} value={s}>
                                {SESSION_STATUS[s].label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </form>
            </Form>
          </ScrollArea>
        </SheetBody>
        <SheetFooter className="flex items-center justify-end gap-2 border-t py-3.5 px-5 border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="submit" form="new-session-form" disabled={createSession.isPending}>
            {createSession.isPending && <LoaderCircleIcon className="size-4 animate-spin" />}
            Créer la session
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
