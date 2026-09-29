"use client";

import { AlertTriangle } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { ApiError } from "@/lib/api";

import type { ActionSpec, FieldSpec } from "./actions";

const todayIso = () => new Date().toLocaleDateString("sv-SE"); // AAAA-MM-JJ, heure locale

function initial(fields: FieldSpec[]) {
  const v: Record<string, string | boolean> = {};
  for (const f of fields) {
    if (f.kind === "date") v[f.name] = todayIso();
    else if (f.kind === "checkbox") v[f.name] = false;
    else if (f.kind === "select") v[f.name] = f.options[0].value;
    else v[f.name] = "";
  }
  return v;
}

/** Refus du moteur affiché dans le formulaire, avec son détail (ex. demi-journées manquantes). */
export function Refusal({ error }: { error: ApiError }) {
  const items = error.details.flatMap((d) => {
    const list = (d as { demi_journees?: string[] }).demi_journees;
    return list ? list.map((x) => `Demi-journée sans présence ni absence : ${x}`) : [];
  });
  return (
    <div
      role="alert"
      className="flex gap-2.5 rounded-md border border-[color-mix(in_oklab,var(--danger)_35%,transparent)] bg-danger-bg px-3 py-2.5 text-[13px] text-danger"
    >
      <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div>
        <p>{error.message}</p>
        {items.length > 0 && (
          <ul className="mt-1 list-disc pl-4">
            {items.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

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
  const [values, setValues] = React.useState(() => initial(fields));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const set = (name: string, value: string | boolean) => {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((errs) => {
      const next = { ...errs };
      delete next[name]; // l'erreur disparaît dès qu'on corrige
      return next;
    });
  };
  const hiddenBy = Object.fromEntries(
    fields.flatMap((f) => (f.kind === "checkbox" && f.reveals ? [[f.reveals, f.name]] : [])),
  );
  const shown = fields.filter((f) => !hiddenBy[f.name] || values[hiddenBy[f.name]] === true);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const body: Record<string, unknown> = {};
    for (const f of shown) {
      const v = values[f.name];
      if ("required" in f && f.required && (v === "" || v === undefined)) errs[f.name] = "Champ obligatoire";
      if (f.kind === "number" && v !== "") {
        const n = Number(v);
        if (Number.isNaN(n) || n < f.min || n > f.max) errs[f.name] = `Entre ${f.min} et ${f.max}`;
        else body[f.name] = n;
      } else if (f.kind === "tristate") {
        if (v !== "") body[f.name] = v === "oui";
      } else if (v !== "") {
        body[f.name] = typeof v === "string" ? v.trim() : v;
      }
    }
    setErrors(errs);
    if (Object.keys(errs).length === 0) onSubmit(body);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {intro && <p className="text-[13px] text-fg-muted">{intro}</p>}
      {shown.map((f) => {
        const fid = `${id}-${f.name}`;
        const common = { label: f.label, hint: f.hint, error: errors[f.name], required: "required" in f && f.required };
        switch (f.kind) {
          case "checkbox":
            return (
              <Checkbox
                key={f.name}
                id={fid}
                label={f.label}
                checked={values[f.name] === true}
                onChange={(e) => set(f.name, e.target.checked)}
              />
            );
          case "textarea":
            return (
              <Field key={f.name} id={fid} {...common}>
                <Textarea value={values[f.name] as string} onChange={(e) => set(f.name, e.target.value)} />
              </Field>
            );
          case "select":
            return (
              <Field key={f.name} id={fid} {...common}>
                <Select value={values[f.name] as string} onChange={(e) => set(f.name, e.target.value)}>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
            );
          case "tristate":
            return (
              <Field key={f.name} id={fid} {...common}>
                <Select value={values[f.name] as string} onChange={(e) => set(f.name, e.target.value)}>
                  <option value="">Non renseigné</option>
                  <option value="oui">Oui</option>
                  <option value="non">Non</option>
                </Select>
              </Field>
            );
          case "number":
            return (
              <Field key={f.name} id={fid} {...common}>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={f.min}
                  max={f.max}
                  step={f.step ?? 1}
                  value={values[f.name] as string}
                  onChange={(e) => set(f.name, e.target.value)}
                />
              </Field>
            );
          case "date":
            return (
              <Field key={f.name} id={fid} {...common}>
                <Input
                  type="date"
                  max={todayIso()}
                  value={values[f.name] as string}
                  onChange={(e) => set(f.name, e.target.value)}
                />
              </Field>
            );
          default:
            return (
              <Field key={f.name} id={fid} {...common}>
                <Input value={values[f.name] as string} onChange={(e) => set(f.name, e.target.value)} />
              </Field>
            );
        }
      })}
      {error instanceof ApiError && <Refusal error={error} />}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Retour
        </Button>
        <Button type="submit" variant="primary" disabled={pending} aria-busy={pending || undefined}>
          {pending ? "Enregistrement…" : spec.submit}
        </Button>
      </div>
    </form>
  );
}
