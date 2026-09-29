"use client";

import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
    }).catch(() => null);
    setPending(false);
    if (!res?.ok) {
      const data = await res?.json().catch(() => ({}));
      setError(data?.detail ?? "Connexion impossible");
      return;
    }
    const next = params.get("suite");
    router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/sessions");
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field id="email" label="Adresse e-mail" required>
        <Input name="email" type="email" autoComplete="username" required autoFocus />
      </Field>
      <Field id="password" label="Mot de passe" required error={error ?? undefined}>
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Connexion…" : "Se connecter"}
      </Button>
    </form>
  );
}
