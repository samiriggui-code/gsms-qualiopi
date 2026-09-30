'use client';

import { FormEvent, useState } from 'react';
import { LoaderCircleIcon } from 'lucide-react';
import type { ActionSpec, FieldSpec } from '@/lib/gsms/journey-actions';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Refusal } from './refusal';

const todayIso = () => new Date().toLocaleDateString('sv-SE'); // AAAA-MM-JJ, heure locale
const UNSET = '__non_renseigne__';

function initial(fields: FieldSpec[]) {
  const v: Record<string, string | boolean> = {};
  for (const f of fields) {
    if (f.kind === 'date') v[f.name] = todayIso();
    else if (f.kind === 'checkbox') v[f.name] = false;
    else if (f.kind === 'select') v[f.name] = f.options[0].value;
    else if (f.kind === 'tristate') v[f.name] = UNSET;
    else v[f.name] = '';
  }
  return v;
}

// Saisie d'une étape du parcours ; les noms de champs sont ceux de l'API.
export function ActionForm({
  id,
  spec,
  fields,
  intro,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  id: string;
  spec: ActionSpec;
  fields: FieldSpec[];
  intro?: string;
  pending: boolean;
  error: unknown;
  onSubmit: (body: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState(() => initial(fields));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (name: string, value: string | boolean) => {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((errs) => {
      const next = { ...errs };
      delete next[name];
      return next;
    });
  };

  // Un champ peut n'apparaître que si une case est cochée (ex. adaptation → notes)
  const hiddenBy = Object.fromEntries(
    fields.flatMap((f) => (f.kind === 'checkbox' && f.reveals ? [[f.reveals, f.name]] : [])),
  );
  const shown = fields.filter((f) => !hiddenBy[f.name] || values[hiddenBy[f.name]] === true);

  function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const body: Record<string, unknown> = {};
    for (const f of shown) {
      const v = values[f.name];
      if ('required' in f && f.required && (v === '' || v === undefined)) errs[f.name] = 'Champ obligatoire';
      if (f.kind === 'number' && v !== '') {
        const n = Number(String(v).replace(',', '.'));
        if (Number.isNaN(n) || n < f.min || n > f.max) errs[f.name] = `Entre ${f.min} et ${f.max}`;
        else body[f.name] = n;
      } else if (f.kind === 'tristate') {
        if (v !== UNSET) body[f.name] = v === 'oui';
      } else if (v !== '') {
        body[f.name] = typeof v === 'string' ? v.trim() : v;
      }
    }
    setErrors(errs);
    if (Object.keys(errs).length === 0) onSubmit(body);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {intro && <p className="text-sm text-muted-foreground">{intro}</p>}
      {shown.map((f) => {
        const fid = `${id}-${f.name}`;
        const required = 'required' in f && f.required;
        const label = (
          <Label htmlFor={fid}>
            {f.label}
            {required && <span className="text-destructive"> *</span>}
          </Label>
        );
        const hint = f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>;
        const err = errors[f.name] && <p className="text-xs text-destructive">{errors[f.name]}</p>;

        if (f.kind === 'checkbox') {
          return (
            <div key={f.name} className="flex items-center gap-2">
              <Checkbox id={fid} checked={values[f.name] === true} onCheckedChange={(c) => set(f.name, c === true)} />
              <Label htmlFor={fid} className="font-normal">
                {f.label}
              </Label>
            </div>
          );
        }

        let control;
        if (f.kind === 'textarea') {
          control = <Textarea id={fid} rows={4} value={values[f.name] as string} onChange={(e) => set(f.name, e.target.value)} />;
        } else if (f.kind === 'select' || f.kind === 'tristate') {
          const options =
            f.kind === 'select'
              ? f.options
              : [
                  { value: UNSET, label: 'Non renseigné' },
                  { value: 'oui', label: 'Oui' },
                  { value: 'non', label: 'Non' },
                ];
          control = (
            <Select value={values[f.name] as string} onValueChange={(v) => set(f.name, v)}>
              <SelectTrigger id={fid}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        } else if (f.kind === 'number') {
          control = (
            <Input
              id={fid}
              type="number"
              inputMode="decimal"
              min={f.min}
              max={f.max}
              step={f.step ?? 1}
              value={values[f.name] as string}
              onChange={(e) => set(f.name, e.target.value)}
            />
          );
        } else if (f.kind === 'date') {
          control = (
            <Input id={fid} type="date" max={todayIso()} value={values[f.name] as string} onChange={(e) => set(f.name, e.target.value)} />
          );
        } else {
          control = <Input id={fid} value={values[f.name] as string} onChange={(e) => set(f.name, e.target.value)} />;
        }

        return (
          <div key={f.name} className="flex flex-col gap-1.5">
            {label}
            {control}
            {hint}
            {err}
          </div>
        );
      })}
      <Refusal error={error} />
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onCancel}>
          Retour
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <LoaderCircleIcon className="size-4 animate-spin" />}
          {spec.submit}
        </Button>
      </div>
    </form>
  );
}
