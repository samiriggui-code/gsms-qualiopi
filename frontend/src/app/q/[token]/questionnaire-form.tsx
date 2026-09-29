"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { cn } from "@/lib/utils";

type Question = {
  id: string;
  libelle: string;
  type: "texte" | "choix" | "note" | "oui_non";
  requis?: boolean;
  options?: string[];
  aide?: string;
  si?: Record<string, boolean | string>;
};

export type PublicQuestionnaire = {
  organisme: string | null;
  formation: string;
  session: { reference: string; debut: string; fin: string };
  pour: string | null;
  expire_le: string;
  questionnaire: { code: string; titre: string; introduction: string; questions: Question[] };
};

type Value = string | number | boolean;

const date = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

function period(s: PublicQuestionnaire["session"]) {
  return s.debut === s.fin ? `le ${date(s.debut)}` : `du ${date(s.debut)} au ${date(s.fin)}`;
}

const visible = (q: Question, answers: Record<string, Value>) =>
  !q.si || Object.entries(q.si).every(([k, v]) => answers[k] === v);

const empty = (v: Value | undefined) => v === undefined || (typeof v === "string" && !v.trim());

function Choice({
  name,
  checked,
  onSelect,
  children,
  className,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "relative flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 text-sm transition-colors",
        "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--ring)]",
        checked
          ? "border-brand bg-[color-mix(in_oklab,var(--brand)_8%,var(--surface))]"
          : "border-border-strong bg-surface hover:bg-surface-2",
        className,
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="size-4 accent-[var(--brand)]" />
      {children}
    </label>
  );
}

function QuestionBlock({
  q,
  n,
  value,
  error,
  onChange,
}: {
  q: Question;
  n: number;
  value: Value | undefined;
  error?: string;
  onChange: (v: Value) => void;
}) {
  const id = `q-${q.id}`;
  const describedBy = [q.aide && `${id}-aide`, error && `${id}-erreur`].filter(Boolean).join(" ") || undefined;
  const title = (
    <>
      <span className="text-fg-subtle tabular-nums">{n}. </span>
      {q.libelle}
      {q.requis ? (
        <span className="text-danger" aria-hidden>
          {" "}
          *
        </span>
      ) : (
        <span className="font-normal text-fg-subtle"> (facultatif)</span>
      )}
    </>
  );
  const help = (
    <>
      {q.aide && (
        <p id={`${id}-aide`} className="text-xs text-fg-subtle">
          {q.aide}
        </p>
      )}
      {error && (
        <p id={`${id}-erreur`} className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </>
  );

  if (q.type === "texte") {
    return (
      <div className="flex flex-col gap-2" data-question={q.id}>
        <label htmlFor={id} className="text-sm font-medium leading-snug">
          {title}
        </label>
        <Textarea
          id={id}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          maxLength={4000}
          rows={3}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          aria-required={q.requis || undefined}
          className="text-base sm:text-sm"
        />
        {help}
      </div>
    );
  }

  return (
    <fieldset
      className="flex min-w-0 flex-col gap-2"
      data-question={q.id}
      role="radiogroup"
      aria-labelledby={`${id}-libelle`}
      aria-describedby={describedBy}
      aria-invalid={error ? true : undefined}
      aria-required={q.requis || undefined}
    >
      <legend id={`${id}-libelle`} className="mb-2 text-sm font-medium leading-snug">
        {title}
      </legend>
      {q.type === "choix" && (
        <div className="grid gap-2 sm:grid-cols-2">
          {q.options!.map((o) => (
            <Choice key={o} name={id} checked={value === o} onSelect={() => onChange(o)}>
              {o}
            </Choice>
          ))}
        </div>
      )}
      {q.type === "note" && (
        <div className="grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map((v) => (
            <Choice
              key={v}
              name={id}
              checked={value === v}
              onSelect={() => onChange(v)}
              className="justify-center gap-0 px-0 font-semibold tabular-nums [&_input]:sr-only"
            >
              {v}
            </Choice>
          ))}
        </div>
      )}
      {q.type === "oui_non" && (
        <div className="grid grid-cols-2 gap-2 sm:max-w-xs">
          <Choice name={id} checked={value === true} onSelect={() => onChange(true)}>
            Oui
          </Choice>
          <Choice name={id} checked={value === false} onSelect={() => onChange(false)}>
            Non
          </Choice>
        </div>
      )}
      {help}
    </fieldset>
  );
}

export function QuestionnaireForm({ token, data }: { token: string; data: PublicQuestionnaire }) {
  const q = data.questionnaire;
  const [answers, setAnswers] = React.useState<Record<string, Value>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [state, setState] = React.useState<"saisie" | "envoi" | "merci" | "ferme">("saisie");
  const [message, setMessage] = React.useState<string | null>(null);
  const summary = React.useRef<HTMLDivElement>(null);
  const done = React.useRef<HTMLHeadingElement>(null);

  const shown = q.questions.filter((x) => visible(x, answers));

  React.useEffect(() => {
    if (state === "merci" || state === "ferme") done.current?.focus();
  }, [state]);

  function change(id: string, v: Value) {
    setAnswers((a) => ({ ...a, [id]: v }));
    setErrors((all) => {
      const rest = { ...all };
      delete rest[id];
      return rest;
    });
  }

  function showErrors(found: Record<string, string>, text: string) {
    setErrors(found);
    setMessage(text);
    requestAnimationFrame(() => summary.current?.focus());
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const missing = Object.fromEntries(
      shown.filter((x) => x.requis && empty(answers[x.id])).map((x) => [x.id, "Réponse obligatoire"]),
    );
    if (Object.keys(missing).length) return showErrors(missing, "Certaines réponses sont à compléter");
    const reponses = Object.fromEntries(shown.filter((x) => !empty(answers[x.id])).map((x) => [x.id, answers[x.id]]));
    setState("envoi");
    const res = await fetch(`/api/public/questionnaires/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reponses }),
    }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    if (res?.ok) return setState("merci");
    if (res?.status === 410) {
      setMessage(body.detail);
      return setState("ferme");
    }
    setState("saisie");
    if (res?.status === 422 && Array.isArray(body.details)) {
      return showErrors(
        Object.fromEntries(body.details.map((d: { question: string; message: string }) => [d.question, d.message])),
        body.detail,
      );
    }
    showErrors({}, "L'envoi n'a pas abouti. Vérifiez votre connexion puis réessayez : vos réponses sont conservées.");
  }

  const header = (
    <header className="flex flex-col gap-1">
      {data.organisme && <p className="text-xs font-medium tracking-wide text-fg-subtle uppercase">{data.organisme}</p>}
      <p className="text-sm text-fg-muted">
        {data.formation} · {period(data.session)}
      </p>
    </header>
  );

  if (state === "merci" || state === "ferme") {
    return (
      <>
        {header}
        <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-6 shadow-panel">
          <h1 ref={done} tabIndex={-1} className="text-xl font-semibold text-balance outline-none">
            {state === "merci" ? "Merci, vos réponses sont enregistrées" : "Questionnaire fermé"}
          </h1>
          <p className="mt-2 text-sm text-fg-muted">
            {state === "merci"
              ? "Elles sont transmises à l'équipe de formation. Vous pouvez fermer cette page."
              : message}
          </p>
        </section>
      </>
    );
  }

  const errorCount = Object.keys(errors).length;
  return (
    <>
      {header}
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <section className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-balance">{q.titre}</h1>
          {data.pour && <p className="text-sm">Bonjour {data.pour},</p>}
          {q.introduction && <p className="max-w-[65ch] text-sm text-fg-muted">{q.introduction}</p>}
          <p className="text-xs text-fg-subtle">
            Les questions marquées <span className="text-danger">*</span> sont obligatoires. Lien valable jusqu&apos;au{" "}
            {date(data.expire_le)}.
          </p>
        </section>

        {message && (
          <div
            ref={summary}
            tabIndex={-1}
            role="alert"
            className="rounded-md border border-danger/40 bg-danger-bg px-4 py-3 text-sm text-danger outline-none"
          >
            <p className="font-medium">{message}</p>
            {errorCount > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {shown
                  .filter((x) => errors[x.id])
                  .map((x) => (
                    <li key={x.id}>
                      <a href={`#q-${x.id}`} className="underline underline-offset-2">
                        Question {shown.indexOf(x) + 1}
                      </a>{" "}
                      : {errors[x.id]}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}

        <section className="flex flex-col gap-6 rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-panel sm:p-6">
          {shown.map((x, i) => (
            <div key={x.id} id={x.type === "texte" ? undefined : `q-${x.id}`} className="scroll-mt-4">
              <QuestionBlock
                q={x}
                n={i + 1}
                value={answers[x.id]}
                error={errors[x.id]}
                onChange={(v) => change(x.id, v)}
              />
            </div>
          ))}
        </section>

        <div className="flex flex-col gap-2 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-fg-subtle">Une seule réponse possible : relisez avant d&apos;envoyer.</p>
          <Button
            type="submit"
            variant="primary"
            className="h-11 px-6 text-base sm:h-10 sm:text-sm"
            disabled={state === "envoi"}
          >
            {state === "envoi" ? "Envoi…" : "Envoyer mes réponses"}
          </Button>
        </div>
      </form>
    </>
  );
}
