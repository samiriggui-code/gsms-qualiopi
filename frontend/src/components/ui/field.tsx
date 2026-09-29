import * as React from "react";

import { cn } from "@/lib/utils";

const control =
  "w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-fg shadow-panel placeholder:text-fg-subtle disabled:opacity-60 aria-[invalid=true]:border-danger";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(control, "h-9", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-20 py-2", className)} {...props} />;
}

export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return <select className={cn(control, "h-9 pr-8", className)} {...props} />;
}

type Controlled = React.ReactElement<{ id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean }>;

/** Libellé + contrôle + aide + erreur, reliés pour les lecteurs d'écran. */
export function Field({
  label,
  hint,
  error,
  children,
  id,
  required,
}: {
  label: string;
  hint?: string;
  error?: string;
  id: string;
  required?: boolean;
  children: Controlled;
}) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-fg">
        {label}
        {required && (
          <span className="text-danger" aria-hidden>
            {" "}
            *
          </span>
        )}
      </label>
      {React.cloneElement(children, { id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-fg-subtle">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function Checkbox({ label, id, ...props }: React.ComponentProps<"input"> & { label: string; id: string }) {
  return (
    <label htmlFor={id} className="flex items-start gap-2 text-sm">
      <input id={id} type="checkbox" className="mt-0.5 size-4 accent-[var(--brand)]" {...props} />
      <span>{label}</span>
    </label>
  );
}
