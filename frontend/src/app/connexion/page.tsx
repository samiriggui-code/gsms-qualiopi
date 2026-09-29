import type { Metadata } from "next";
import { Suspense } from "react";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion" };

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <p className="text-[13px] font-medium tracking-wide text-fg-subtle uppercase">Espace formation</p>
          <h1 className="mt-1 text-2xl font-semibold">Connexion</h1>
          <p className="mt-1 text-[13px] text-fg-muted">
            Sessions, parcours des stagiaires, émargement et préparation Qualiopi.
          </p>
        </div>
        <div className="rounded-lg border bg-surface p-5 shadow-panel">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
        <p className="mt-6 text-center text-xs text-fg-subtle">GSMS Qualiopi</p>
      </div>
    </main>
  );
}
