'use client';

import { useEffect, useMemo } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { LoaderCircleIcon, LucideIcon } from 'lucide-react';
import { Resolver, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Row, useResourceList } from '@/lib/resource';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { FieldDef, Option } from './types';

const NONE = '__none__';

type Values = Record<string, string | boolean>;

function buildSchema(fields: FieldDef[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) {
    if (f.type === 'boolean') {
      shape[f.name] = z.boolean();
      continue;
    }
    let s = z.string();
    if (f.type === 'email') {
      shape[f.name] = f.required
        ? s.trim().min(1, `${f.label} : obligatoire.`).email('Adresse email invalide.')
        : s.trim().refine((v) => !v || z.string().email().safeParse(v).success, 'Adresse email invalide.');
      continue;
    }
    if (f.type === 'number') {
      s = s.regex(/^-?\d*([.,]\d+)?$/, 'Nombre attendu.');
    }
    shape[f.name] = f.required
      ? s.trim().min(1, `${f.label} : obligatoire.`).refine((v) => v !== NONE, `${f.label} : obligatoire.`)
      : s;
  }
  return z.object(shape);
}

// Ligne existante → valeurs du formulaire
function toValues(fields: FieldDef[], row?: Row | null): Values {
  const values: Values = {};
  for (const f of fields) {
    const raw = row ? row[f.name] : undefined;
    if (f.type === 'boolean') {
      values[f.name] = row ? Boolean(raw) : Boolean(f.defaultValue);
    } else if (f.type === 'tags') {
      values[f.name] = Array.isArray(raw) ? raw.join(', ') : '';
    } else if (f.type === 'select') {
      values[f.name] = raw != null && raw !== '' ? String(raw) : row ? NONE : String(f.defaultValue ?? NONE);
    } else if (f.type === 'date') {
      values[f.name] = typeof raw === 'string' ? raw.slice(0, 10) : '';
    } else {
      values[f.name] = raw != null ? String(raw) : row ? '' : String(f.defaultValue ?? '');
    }
  }
  return values;
}

// Valeurs du formulaire → charge utile API. En modification, un champ vidé est envoyé à null.
function toPayload(fields: FieldDef[], values: Values, editing: boolean) {
  const payload: Record<string, unknown> = {};
  for (const f of fields) {
    const v = values[f.name];
    let out: unknown;
    if (f.type === 'boolean') out = v;
    else if (f.type === 'tags')
      out = String(v)
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    else if (f.type === 'number') out = v === '' ? null : Number(String(v).replace(',', '.'));
    else if (f.type === 'select') out = v === NONE ? null : v;
    else out = typeof v === 'string' && v.trim() === '' ? null : typeof v === 'string' ? v.trim() : v;

    if (out === null && !editing) continue;
    payload[f.name] = out;
  }
  return payload;
}

function SelectField({ field, value, onChange }: { field: FieldDef; value: string; onChange: (v: string) => void }) {
  const source = useResourceList(field.optionsFrom?.path ?? 'none', { enabled: !!field.optionsFrom });
  const options: Option[] = useMemo(() => {
    if (field.options) return field.options;
    if (!field.optionsFrom || !source.data) return [];
    return source.data.map((row) => ({ value: row.id, label: field.optionsFrom!.label(row) }));
  }, [field, source.data]);

  return (
    <Select value={value} onValueChange={onChange}>
      <FormControl>
        <SelectTrigger>
          <SelectValue placeholder={field.placeholder ?? 'Choisir'} />
        </SelectTrigger>
      </FormControl>
      <SelectContent>
        {!field.required && <SelectItem value={NONE}>—</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ResourceFormSheet({
  open,
  onOpenChange,
  title,
  icon: Icon,
  fields,
  row,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  icon: LucideIcon;
  fields: FieldDef[];
  row?: Row | null;
  pending?: boolean;
  onSubmit: (payload: Record<string, unknown>) => Promise<unknown>;
}) {
  const schema = useMemo(() => buildSchema(fields), [fields]);
  const form = useForm<Values>({
    resolver: zodResolver(schema) as unknown as Resolver<Values>,
    defaultValues: toValues(fields, row),
  });

  useEffect(() => {
    if (open) form.reset(toValues(fields, row));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, row]);

  async function submit(values: Values) {
    try {
      await onSubmit(toPayload(fields, values, !!row));
      onOpenChange(false);
    } catch {
      // L'erreur est déjà affichée par une notification ; le panneau reste ouvert.
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:w-[560px] sm:max-w-none inset-5 start-auto h-auto rounded-lg p-0 [&_[data-slot=sheet-close]]:top-4.5 [&_[data-slot=sheet-close]]:end-5">
        <SheetHeader className="border-b py-3.5 px-5 border-border">
          <SheetTitle className="flex items-center gap-2.5">
            <Icon className="text-primary size-4" />
            {title}
          </SheetTitle>
        </SheetHeader>
        <SheetBody className="p-0">
          <ScrollArea className="h-[calc(100dvh-11.75rem)] ps-3 pe-2 me-1">
            <Form {...form}>
              <form
                id="resource-form"
                onSubmit={form.handleSubmit(submit)}
                className="grid grid-cols-2 gap-x-4 gap-y-5 px-2 py-4"
              >
                {fields.map((f) => (
                  <FormField
                    key={f.name}
                    control={form.control}
                    name={f.name}
                    render={({ field }) => (
                      <FormItem className={cn(f.span === 1 ? 'col-span-1' : 'col-span-2')}>
                        {f.type === 'boolean' ? (
                          <div className="flex items-center justify-between gap-3 rounded-md border border-input px-3 py-2.5">
                            <FormLabel className="font-normal">{f.label}</FormLabel>
                            <FormControl>
                              <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                            </FormControl>
                          </div>
                        ) : (
                          <>
                            <FormLabel>
                              {f.label}
                              {f.required && <span className="text-destructive"> *</span>}
                            </FormLabel>
                            {f.type === 'select' ? (
                              <SelectField field={f} value={String(field.value)} onChange={field.onChange} />
                            ) : f.type === 'textarea' ? (
                              <FormControl>
                                <Textarea rows={4} placeholder={f.placeholder} {...field} value={String(field.value)} />
                              </FormControl>
                            ) : (
                              <FormControl>
                                <Input
                                  type={f.type === 'tags' || f.type === 'number' ? 'text' : f.type}
                                  inputMode={f.type === 'number' ? 'decimal' : undefined}
                                  placeholder={f.placeholder ?? (f.type === 'tags' ? 'Valeurs séparées par des virgules' : undefined)}
                                  {...field}
                                  value={String(field.value)}
                                />
                              </FormControl>
                            )}
                          </>
                        )}
                        {f.help && <FormDescription>{f.help}</FormDescription>}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
              </form>
            </Form>
          </ScrollArea>
        </SheetBody>
        <SheetFooter className="flex items-center justify-end gap-2 border-t py-3.5 px-5 border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="submit" form="resource-form" disabled={pending}>
            {pending && <LoaderCircleIcon className="size-4 animate-spin" />}
            Enregistrer
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
