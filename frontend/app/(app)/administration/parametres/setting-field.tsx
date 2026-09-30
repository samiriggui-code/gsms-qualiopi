'use client';

// Champ d'un réglage, choisi d'après son schéma (celui que l'API valide) : interrupteur, liste, nombre,
// texte, couleur, jours de la semaine, créneaux horaires, règles de relance.
import type { JsonSchema, RelanceRule } from '@/lib/gsms/settings';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const PERIODS: Record<string, string> = {
  MATIN: 'Matin',
  APRES_MIDI: 'Après-midi',
};
const TIMEZONES: Record<string, string> = {
  'Europe/Paris': 'Métropole (Paris)',
  'America/Cayenne': 'Guyane',
  'Indian/Reunion': 'La Réunion',
  'America/Martinique': 'Martinique',
  'America/Guadeloupe': 'Guadeloupe',
};

type Slot = { period: string; start: string; end: string };

export function formatValue(
  schema: JsonSchema,
  value: unknown,
  rules?: RelanceRule[],
): string {
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  if (Array.isArray(value)) {
    if (value.length === 0) return 'Aucune';
    if (schema.items?.enum && typeof value[0] === 'number')
      return value.map((d) => WEEKDAYS[Number(d) - 1]).join(', ');
    if (typeof value[0] === 'object')
      return (value as Slot[])
        .map(
          (s) =>
            `${PERIODS[s.period] ?? s.period} ${s.start.slice(0, 5)}–${s.end.slice(0, 5)}`,
        )
        .join(' · ');
    return value
      .map((k) => rules?.find((r) => r.cle === k)?.libelle ?? String(k))
      .join(', ');
  }
  if (typeof value === 'string') return TIMEZONES[value] ?? (value || '—');
  return String(value);
}

export function SettingField({
  id,
  schema,
  value,
  onChange,
  disabled,
  rules,
}: {
  id: string;
  schema: JsonSchema;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
  rules?: RelanceRule[];
}) {
  if (schema.type === 'boolean') {
    return (
      <div className="flex items-center gap-2">
        <Switch
          id={id}
          size="sm"
          checked={!!value}
          onCheckedChange={onChange}
          disabled={disabled}
        />
        <Label htmlFor={id} className="font-normal">
          {value ? 'Oui' : 'Non'}
        </Label>
      </div>
    );
  }

  if (schema.const !== undefined) {
    return (
      <span className="text-sm text-foreground">
        {String(schema.const) === 'fr' ? 'Français' : String(schema.const)}
      </span>
    );
  }

  if (schema.enum && schema.type === 'string') {
    return (
      <Select
        value={String(value)}
        onValueChange={onChange}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="w-full sm:w-72">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {schema.enum.map((o) => (
            <SelectItem key={String(o)} value={String(o)}>
              {TIMEZONES[String(o)] ?? String(o)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (schema.type === 'integer') {
    return (
      <Input
        id={id}
        type="number"
        className="w-32"
        min={schema.minimum}
        max={schema.maximum}
        value={value === null || value === undefined ? '' : String(value)}
        onChange={(e) =>
          onChange(e.target.value === '' ? '' : Number(e.target.value))
        }
        disabled={disabled}
      />
    );
  }

  if (schema.type === 'string' && schema.pattern?.includes('[0-9a-fA-F]{6}')) {
    return (
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label="Choisir la couleur"
          className="size-8 rounded-md border border-input bg-background p-0.5 cursor-pointer"
          value={String(value || '#000000')}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
        <Input
          id={id}
          className="w-32 font-mono"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      </div>
    );
  }

  if (schema.type === 'string') {
    return (
      <Input
        id={id}
        className="w-full sm:w-72"
        maxLength={schema.maxLength}
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    );
  }

  if (schema.type === 'array' && schema.items?.enum) {
    const days = (value as number[]) ?? [];
    return (
      <div className="flex flex-wrap gap-1.5">
        {schema.items.enum.map((d) => {
          const on = days.includes(Number(d));
          return (
            <button
              key={String(d)}
              type="button"
              disabled={disabled}
              aria-pressed={on}
              onClick={() =>
                onChange(
                  on
                    ? days.filter((x) => x !== d)
                    : [...days, Number(d)].sort(),
                )
              }
              className={cn(
                'h-8 min-w-11 rounded-md border px-2 text-sm',
                on
                  ? 'border-primary bg-primary/10 text-primary font-medium'
                  : 'border-input text-muted-foreground',
              )}
            >
              {WEEKDAYS[Number(d) - 1]}
            </button>
          );
        })}
      </div>
    );
  }

  if (
    schema.type === 'array' &&
    (schema.items?.$ref || schema.items?.properties)
  ) {
    const slots = (value as Slot[]) ?? [];
    const set = (i: number, patch: Partial<Slot>) =>
      onChange(slots.map((s, j) => (j === i ? { ...s, ...patch } : s)));
    return (
      <div className="space-y-2">
        {slots.map((s, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <span className="w-24 text-sm text-foreground">
              {PERIODS[s.period] ?? s.period}
            </span>
            <Input
              type="time"
              aria-label={`${PERIODS[s.period]} : début`}
              className="w-28"
              value={s.start.slice(0, 5)}
              onChange={(e) => set(i, { start: `${e.target.value}:00` })}
              disabled={disabled}
            />
            <span className="text-muted-foreground">→</span>
            <Input
              type="time"
              aria-label={`${PERIODS[s.period]} : fin`}
              className="w-28"
              value={s.end.slice(0, 5)}
              onChange={(e) => set(i, { end: `${e.target.value}:00` })}
              disabled={disabled}
            />
          </div>
        ))}
      </div>
    );
  }

  if (schema.type === 'array') {
    const off = (value as string[]) ?? [];
    if (!rules?.length)
      return (
        <span className="text-sm text-muted-foreground">
          {formatValue(schema, value, rules)}
        </span>
      );
    return (
      <div className="space-y-2">
        {rules.map((r) => {
          const active = !off.includes(r.cle);
          return (
            <label key={r.cle} className="flex items-start gap-2.5 text-sm">
              <Checkbox
                checked={active}
                disabled={disabled}
                onCheckedChange={(c) =>
                  onChange(c ? off.filter((k) => k !== r.cle) : [...off, r.cle])
                }
                className="mt-0.5"
              />
              <span
                className={cn(
                  'text-foreground',
                  !active && 'text-muted-foreground line-through',
                )}
              >
                {r.libelle}
              </span>
            </label>
          );
        })}
      </div>
    );
  }

  return (
    <span className="text-sm text-muted-foreground">
      {formatValue(schema, value, rules)}
    </span>
  );
}
